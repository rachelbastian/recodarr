import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static'; // Import ffprobe static
import fs from 'fs/promises';
import fsSync from 'fs'; // For existsSync
// Remove direct type import - rely on global types
// import type { EncodingProgress, EncodingOptions, EncodingResult } from '../../types.js';

// --- Define Types Locally --- 
// (Copied from src/types.d.ts as imports/globals aren't working reliably)
interface EncodingProgress {
    percent?: number;
    fps?: number;
    frame?: number;
    totalFrames?: number;
    status?: string;
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

// Set FFMPEG and FFPROBE paths
try {
    const ffmpegPath = ffmpegStatic as unknown as string;
    const ffprobePath = ffprobeStatic && typeof ffprobeStatic === 'object' && 'path' in ffprobeStatic 
                        ? ffprobeStatic.path 
                        : ffprobeStatic as string;

    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath); // Explicitly set ffprobe path
    console.log(`[FFMPEG Utils] Successfully set ffmpeg path: ${ffmpegPath}`);
    console.log(`[FFMPEG Utils] Successfully set ffprobe path: ${ffprobePath}`);
} catch (error) {
    console.error(`[FFMPEG Utils] Error setting ffmpeg/ffprobe paths:`, error);
    // Consider how to handle this error - maybe throw or return a specific error state
}

// Keep EncodingProgress definition if needed elsewhere, but it's defined globally
// export interface EncodingProgress { ... }

// Keep EncodingOptions definition if needed elsewhere, but it's defined globally
// Note: This local definition might need updating if the global one changes
// export interface EncodingOptions { ... } 

// Keep EncodingResult definition if needed elsewhere, but it's defined globally
// export interface EncodingResult { ... }

// Add a property to store estimated total frames for progress calculation
let estimatedTotalFrames: number | undefined = undefined;
let videoDuration: number | undefined = undefined;

export async function startEncodingProcess(options: EncodingOptions): Promise<EncodingResult> {
    console.log(`[Encoding Process] Starting for: ${options.inputPath}`);
    console.log(`[Encoding Process] Options received:`, JSON.stringify(options, null, 2)); 

    // Reset global estimates when starting a new encoding job
    estimatedTotalFrames = undefined;
    videoDuration = undefined;

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

    // Try to get video duration from ffmpeg first
    try {
        console.log(`[Encoding Process] Probing for duration/frames: ${options.inputPath}`);
        const ffprobeResult = await new Promise<any>((resolve, reject) => {
            ffmpeg.ffprobe(options.inputPath, (err, metadata) => {
                if (err) reject(err);
                else resolve(metadata);
            });
        });
        
        console.log("[Encoding Process] ffprobe raw result:", JSON.stringify(ffprobeResult, null, 2));

        if (ffprobeResult && ffprobeResult.format && ffprobeResult.format.duration) {
            videoDuration = parseFloat(ffprobeResult.format.duration);
            console.log(`[Encoding Process] Video duration found: ${videoDuration}s`);
            
            // Try to estimate fps from video stream
            let fps = 30; // default fallback
            if (ffprobeResult.streams && ffprobeResult.streams.length > 0) {
                const videoStream = ffprobeResult.streams.find((s: any) => s.codec_type === 'video');
                if (videoStream && videoStream.avg_frame_rate) {
                    // Parse frame rate (format is usually "num/den")
                    const parts = videoStream.avg_frame_rate.split('/');
                    if (parts.length === 2) {
                        const num = parseInt(parts[0], 10);
                        const den = parseInt(parts[1], 10);
                        if (den !== 0) {
                            fps = num / den;
                            console.log(`[Encoding Process] Video FPS found: ${fps} (from ${videoStream.avg_frame_rate})`);
                        } else {
                             console.warn(`[Encoding Process] Invalid avg_frame_rate denominator: ${videoStream.avg_frame_rate}`);
                        }
                    } else {
                        console.warn(`[Encoding Process] Could not parse avg_frame_rate: ${videoStream.avg_frame_rate}`);
                    }
                } else {
                     console.warn('[Encoding Process] No video stream with avg_frame_rate found in probe data.');
                }
            }
            
            // Estimate total frames
            if (videoDuration > 0 && fps > 0) {
                estimatedTotalFrames = Math.round(videoDuration * fps);
                console.log(`[Encoding Process] Initial estimated total frames: ${estimatedTotalFrames}`);
            } else {
                 console.warn('[Encoding Process] Could not estimate total frames (duration or fps invalid).');
            }
        } else {
            console.warn('[Encoding Process] Could not find format.duration in ffprobe result.');
        }
    } catch (err) {
        console.error(`[Encoding Process] Error during ffprobe for duration/frames:`, err);
    }

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
                // Debug raw progress data
                console.log('[ffmpeg] Raw progress data:', JSON.stringify(progress, null, 2)); // Log the raw object
                
                // Use the progressCallbackWrapper if it exists
                if (progressCallbackWrapper) {
                    try {
                        // Extract and convert all potential progress fields
                        let percent = progress.percent && progress.percent >= 0 
                            ? Number(parseFloat(String(progress.percent)).toFixed(1)) // Ensure it's a number
                            : undefined;
                        
                        const frame = progress.frames 
                            ? parseInt(String(progress.frames), 10) 
                            : undefined;
                        
                        // elapsed calculation removed
                        
                        // Extract or calculate fps
                        let fps = progress.fps !== undefined && progress.fps > 0
                            ? Number(parseFloat(String(progress.fps)).toFixed(1))
                            : (progress.currentFps !== undefined && progress.currentFps > 0 
                                ? Number(parseFloat(String(progress.currentFps)).toFixed(1)) 
                                : undefined); // Use currentFps as fallback
                        
                        // Determine total frames, prioritize ffmpeg's report if available
                        let currentTotalFrames = estimatedTotalFrames; // Start with the initial estimate
                        if (progress.frames_total && parseInt(String(progress.frames_total), 10) > 0) {
                            currentTotalFrames = parseInt(String(progress.frames_total), 10);
                            // Optional: Update the initial estimate if ffmpeg provides a value later
                            // estimatedTotalFrames = currentTotalFrames; 
                            console.log(`[ffmpeg] Using total frames from ffmpeg progress: ${currentTotalFrames}`);
                        } else {
                            // Keep using the initial estimate if ffmpeg doesn't provide one
                            console.log(`[ffmpeg] Using initial estimated total frames: ${currentTotalFrames}`);
                        }
                        
                        // If we have frame and totalFrames but no percent, calculate it
                        if (percent === undefined && frame !== undefined && currentTotalFrames && currentTotalFrames > 0) {
                            percent = Number(((frame / currentTotalFrames) * 100).toFixed(1));
                        }

                        // Ensure percent is capped between 0 and 100
                        if (percent !== undefined) {
                            percent = Math.max(0, Math.min(100, percent));
                        }
                        
                        // Create progress object to send to UI
                        const progressUpdate: EncodingProgress = {
                            percent, // Keep sending percent if available, UI might use it as fallback
                            fps,
                            // elapsed, // Removed
                            frame,
                            totalFrames: currentTotalFrames, // Send the best available total frames count
                            status: 'Encoding...'
                        };
                        
                        // Log what we're sending
                        console.log('[ffmpeg] Sending progress update:', JSON.stringify(progressUpdate, null, 2)); // Log the final object
                        
                        // Send the progress update to the callback
                        progressCallbackWrapper(progressUpdate);
                    } catch (error) {
                        console.error('[ffmpeg] Error processing progress data:', error);
                    }
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

// Improved function to convert ffmpeg timemark (HH:MM:SS.MS) to seconds
function convertTimemarkToSeconds(timemark: string): number | undefined {
    try {
        if (!timemark) return undefined;
        
        // ffmpeg typically returns timemark in format HH:MM:SS.MS
        const match = timemark.match(/(\d+):(\d+):(\d+)(?:\.(\d+))?/);
        if (!match) return undefined;
        
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);
        const ms = match[4] ? parseInt(match[4], 10) / Math.pow(10, match[4].length) : 0;
        
        return hours * 3600 + minutes * 60 + seconds + ms;
    } catch (err) {
        console.error('[Encoding Process] Error parsing timemark:', err);
        return undefined;
    }
} 