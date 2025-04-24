import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs/promises';
import fsSync from 'fs'; // For existsSync
// Remove direct type import - rely on global types
// import type { EncodingProgress, EncodingOptions, EncodingResult } from '../../types.js';

// --- Define Types Locally --- 
// (Copied from src/types.d.ts as imports/globals aren't working reliably)
interface EncodingProgress {
    percent?: number;
}

interface EncodingOptions {
    inputPath: string;
    outputPath: string;
    // Video options
    videoCodec?: string; 
    videoPreset?: string; 
    videoQuality?: number | string; 
    lookAhead?: number; 
    pixelFormat?: string; 
    mapVideo?: string; 
    // Audio options
    audioCodec?: string; 
    audioBitrate?: string; 
    audioFilter?: string; 
    mapAudio?: string; 
    audioOptions?: string[]; // Add support for additional audio codec options
    // Subtitle options
    subtitleCodec?: string; 
    mapSubtitle?: string[]; // Changed to optional string array
    // General options
    hwAccel?: 'auto' | 'qsv' | 'nvenc' | 'cuda' | 'vaapi' | 'videotoolbox' | 'none';
    duration?: number; 
    // Internal callback
    progressCallback?: (progress: EncodingProgress) => void;
}

interface EncodingResult {
    success: boolean;
    outputPath?: string;
    error?: string;
    initialSizeMB?: number;
    finalSizeMB?: number;
    reductionPercent?: number;
}
// --- End Local Type Definitions --- 

// Set FFMPEG path
try {
    ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
    console.log(`[FFMPEG Utils] Successfully set ffmpeg path.`);
} catch (error) {
    console.error(`[FFMPEG Utils] Error setting ffmpeg path:`, error);
    // Consider how to handle this error - maybe throw or return a specific error state
}

// Keep EncodingProgress definition if needed elsewhere, but it's defined globally
// export interface EncodingProgress { ... }

// Keep EncodingOptions definition if needed elsewhere, but it's defined globally
// Note: This local definition might need updating if the global one changes
// export interface EncodingOptions { ... } 

// Keep EncodingResult definition if needed elsewhere, but it's defined globally
// export interface EncodingResult { ... }

export async function startEncodingProcess(options: EncodingOptions): Promise<EncodingResult> {
    console.log(`[Encoding Process] Starting for: ${options.inputPath}`);
    console.log(`[Encoding Process] Options received:`, JSON.stringify(options, null, 2)); 

    // --- Input Validation ---
    if (!options.inputPath || !options.outputPath) {
        return { success: false, error: "Input or output path is missing." };
    }
    try {
        await fs.access(options.inputPath, fs.constants.R_OK);
    } catch (err) {
        console.error(`[Encoding Process] Input file not found or not readable: ${options.inputPath}`, err);
        return { success: false, error: `Input file not found or not readable: ${options.inputPath}` };
    }

    // --- File Size Tracking --- 
    let initialSize = 0;
    try {
        const stats = await fs.stat(options.inputPath);
        initialSize = stats.size;
    } catch (err) {
        console.warn(`[Encoding Process] Could not get initial file size for ${options.inputPath}`, err);
    }

    const progressCallbackWrapper = options.progressCallback; 

    return new Promise((resolve) => {
        try {
            const command = ffmpeg(options.inputPath);

            // --- Input Options --- 
            if (options.hwAccel && options.hwAccel !== 'none' && options.hwAccel !== 'auto') {
                command.inputOption(`-hwaccel ${options.hwAccel}`);
            } else if (options.hwAccel === 'auto') {
                command.inputOption('-hwaccel auto');
            }
            if (options.duration) {
                command.duration(options.duration); // Duration is handled differently
            }

            // --- Build Output Options Array --- 
            const outputOpts: string[] = [];
            
            // 1. Mapping
            if (options.mapVideo) outputOpts.push('-map', options.mapVideo + '?');
            if (options.mapAudio) outputOpts.push('-map', options.mapAudio + '?');
            // Iterate over mapSubtitle array
            if (options.mapSubtitle && Array.isArray(options.mapSubtitle)) {
                options.mapSubtitle.forEach(map => outputOpts.push('-map', map + '?'));
            }

            // 2. Video Codec & Options
            if (options.videoCodec && options.mapVideo) { 
                outputOpts.push('-c:v', options.videoCodec);
                if (options.videoCodec !== 'copy') { 
                    if (options.videoPreset) outputOpts.push('-preset:v', options.videoPreset); 
                    if (options.videoQuality) {
                        if (['libx264', 'libx265'].includes(options.videoCodec)) {
                            outputOpts.push('-crf', String(options.videoQuality)); 
                        } else if (['hevc_qsv', 'h264_qsv'].includes(options.videoCodec)) {
                            outputOpts.push('-global_quality:v', String(options.videoQuality)); 
                        }
                    }
                    if (options.lookAhead !== undefined) outputOpts.push('-look_ahead', String(options.lookAhead)); 
                    if (options.pixelFormat) outputOpts.push('-pix_fmt', options.pixelFormat); 
                }
            } else if (options.mapVideo) {
                 outputOpts.push('-c:v', 'copy'); 
            }

            // 3. Audio Codec & Options
            if (options.audioCodec && options.mapAudio) { 
                 outputOpts.push('-c:a', options.audioCodec);
                 if (options.audioCodec !== 'copy') { 
                    if (options.audioBitrate) outputOpts.push('-b:a', options.audioBitrate); 
                    if (options.audioFilter) outputOpts.push('-af', options.audioFilter);
                    // Add support for additional audio codec options (like mapping_family for libopus)
                    if (options.audioOptions && options.audioOptions.length > 0) {
                        outputOpts.push(...options.audioOptions);
                    }
                 }
            } else if (options.mapAudio) {
                 outputOpts.push('-c:a', 'copy'); 
            }

            // 4. Subtitle Codec (Applies to all mapped subtitles)
            // The codec is determined by the frontend logic now
            if (options.subtitleCodec && options.mapSubtitle && options.mapSubtitle.length > 0) {
                outputOpts.push('-c:s', options.subtitleCodec);
            } else if (options.mapSubtitle && options.mapSubtitle.length > 0) { // Default to copy if mapped but no codec specified
                 outputOpts.push('-c:s', 'copy'); 
            }
            
            // 5. Metadata / Chapters / General
            outputOpts.push('-map_metadata', '0');
            outputOpts.push('-map_chapters', '0');
            outputOpts.push('-hide_banner');
            outputOpts.push('-y'); // Overwrite output

            // --- Apply ALL output options via outputOptions() ---
            console.log("[Encoding Process] Applying output options:", outputOpts);
            command.outputOptions(outputOpts); 
            
            // --- Output File --- 
            command.output(options.outputPath);

            // --- Event Handlers --- 
            command.on('start', (commandLine: string) => {
                console.log(`[Encoding Process] Spawned Ffmpeg command: ${commandLine}`);
            });

            command.on('progress', (progress: any) => {
                // Use the progressCallbackWrapper if it exists
                if (progressCallbackWrapper) {
                    const percent = progress.percent && progress.percent >= 0 ? Number(progress.percent.toFixed(1)) : undefined;
                    progressCallbackWrapper({ percent });
                } else {
                     // Fallback logging if no callback provided from main
                     // console.log(`[Encoding Process] Progress: ${progress.percent ? progress.percent.toFixed(1) : 'N/A'}%`);
                }
            });

            command.on('stderr', (stderrLine: string) => {
                 // console.log(`[Encoding Process] stderr: ${stderrLine}`);
            });

            command.on('error', (err: Error, stdout: string | null, stderr: string | null) => {
                console.error(`[Encoding Process] Error: ${err.message}`);
                if (stdout) console.error('[Encoding Process] FFMPEG stdout:', stdout);
                if (stderr) console.error('[Encoding Process] FFMPEG stderr:', stderr);
                resolve({ success: false, error: err.message });
            });

            command.on('end', async (stdout: string | null, stderr: string | null) => {
                if (stdout) console.log('[Encoding Process] FFMPEG stdout on end:', stdout); // Might contain final stats
                if (stderr) console.log('[Encoding Process] FFMPEG stderr on end:', stderr); // Might contain warnings/info
                console.log(`[Encoding Process] Finished successfully: ${options.outputPath}`);
                let finalSize = 0;
                let reductionPercent: number | undefined = undefined;
                try {
                    const finalStats = await fs.stat(options.outputPath);
                    finalSize = finalStats.size;
                    if (initialSize > 0 && finalSize > 0) {
                         reductionPercent = Number(((1 - (finalSize / initialSize)) * 100).toFixed(2));
                    }
                } catch (err) {
                     console.warn(`[Encoding Process] Could not get final file size for ${options.outputPath}`, err);
                }

                resolve({
                    success: true,
                    outputPath: options.outputPath,
                    initialSizeMB: initialSize > 0 ? Number((initialSize / (1024 * 1024)).toFixed(2)) : undefined,
                    finalSizeMB: finalSize > 0 ? Number((finalSize / (1024 * 1024)).toFixed(2)) : undefined,
                    reductionPercent: reductionPercent
                });
            });

            // --- Run --- 
            command.run();

        } catch (err) {
            console.error(`[Encoding Process] Error setting up ffmpeg command:`, err);
            resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
    });
} 