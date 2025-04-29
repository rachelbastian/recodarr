import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static'; // Import ffprobe static
import fs from 'fs/promises';
import path from 'path'; // Import path module
import fsSync, { WriteStream } from 'fs'; // For existsSync and WriteStream
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
    overwriteInput?: boolean; // Added flag for overwriting
    // Video options
    videoCodec?: string; 
    videoPreset?: string; 
    videoQuality?: number | string; 
    lookAhead?: number; 
    pixelFormat?: string; 
    mapVideo?: string; 
    videoFilter?: string; // Add for resolution/scaling
    resolution?: string; // Add for explicit resolution
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
    // --- Added for logging ---
    jobId?: string; // Add jobId
    logDirectoryPath?: string; // Add log directory path
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
    jobId?: string;
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
    // --- Logging Setup ---
    let logStream: WriteStream | null = null;
    const jobId = options.jobId; // Get jobId for easier access

    // Helper defined early to be available everywhere, checks logStream internally
    const writeLog = (message: string) => {
        if (logStream) {
            logStream.write(`[${new Date().toISOString()}] ${message}\n`, (err) => {
                if (err) console.error(`[Log Write Error] Job ${jobId}:`, err);
            });
        }
    };

    if (jobId && options.logDirectoryPath) {
        const logFilePath = path.join(options.logDirectoryPath, `${jobId}.log`);
        try {
            logStream = fsSync.createWriteStream(logFilePath, { flags: 'a' });
            console.log(`[Encoding Process] Logging enabled for Job ${jobId} to: ${logFilePath}`);
            
            // Write initial info using the helper
            writeLog(`--- Starting Encoding Job ${jobId} ---`);
            writeLog(`Input Path: ${options.inputPath}`);
            writeLog(`Output Path: ${options.outputPath}`);
            writeLog(`Overwrite Input: ${options.overwriteInput}`);
            // Avoid logging the whole options object directly if it contains sensitive/large data or functions
            // Log specific important options instead:
            const optionsToLog = { ...options }; 
            delete optionsToLog.progressCallback; // Don't log the callback function
            writeLog(`Options Summary: ${JSON.stringify(optionsToLog, null, 2)}`); 
            
        } catch (logErr) {
            console.error(`[Encoding Process] Failed to create log file for Job ${jobId}:`, logErr);
            logStream = null; // Ensure logStream is null if creation failed
        }
    } else {
        console.warn(`[Encoding Process] Job ID (${jobId}) or Log Directory Path (${options.logDirectoryPath}) missing, logging disabled.`);
    }
    // --- End Logging Setup ---

    console.log(`[Encoding Process] Starting for: ${options.inputPath}`);
    writeLog(`[Info] Starting process for: ${options.inputPath}`); // Log start

    // Reset global estimates
    estimatedTotalFrames = undefined;
    videoDuration = undefined;

    // --- Input Validation & Path Setup ---
    if (!options.inputPath || !options.outputPath) {
        writeLog('[Error] Input or output path is missing.')
        logStream?.end(); // Close log stream if open
        return { success: false, error: "Input or output path is missing." };
    }

    const overwriteInput = options.overwriteInput ?? false;
    const finalTargetPath = overwriteInput ? options.inputPath : options.outputPath;
    const extension = path.extname(finalTargetPath);
    const basename = path.basename(finalTargetPath, extension);
    const tempOutputPath = path.join(path.dirname(finalTargetPath), `${basename}_tmp${extension}`);

    writeLog(`[Info] Mode: ${overwriteInput ? 'Overwrite' : 'Save As New'}`);
    writeLog(`[Info] Final Target Path: ${finalTargetPath}`);
    writeLog(`[Info] Temporary Output Path: ${tempOutputPath}`);

    try {
        await fs.access(options.inputPath, fs.constants.R_OK);
    } catch (err) {
        console.error(`[Encoding Process] Input file not found or not readable: ${options.inputPath}`, err);
        const errorMsg = `Input file not found or not readable: ${options.inputPath}`;
        writeLog(`[Error] ${errorMsg}: ${err instanceof Error ? err.message : String(err)}`);
        logStream?.end();
        return { success: false, error: errorMsg };
    }

    // Ensure temp file from previous failed attempt is removed
    try {
        await fs.unlink(tempOutputPath);
        writeLog(`[Info] Removed existing temp file: ${tempOutputPath}`);
    } catch (e: any) {
        if (e.code !== 'ENOENT') { // Ignore error if file doesn't exist
            writeLog(`[Warning] Could not remove existing temp file: ${e.message}`);
        }
    }

    // --- File Size Tracking ---
    let initialSize = 0;
    try {
        // Get size of the *original* input file for comparison
        const stats = await fs.stat(options.inputPath);
        initialSize = stats.size;
        writeLog(`[Info] Initial file size: ${initialSize} bytes (${(initialSize / (1024*1024)).toFixed(2)} MB)`);
    } catch (err) {
        console.warn(`[Encoding Process] Could not get initial file size for ${options.inputPath}`, err);
        writeLog(`[Warning] Could not get initial file size: ${err instanceof Error ? err.message : String(err)}`);
    }

    const progressCallbackWrapper = options.progressCallback;

    // Try to get video duration from ffmpeg first
    try {
        writeLog(`[Info] Probing for duration/frames: ${options.inputPath}`);
        const ffprobeResult = await new Promise<any>((resolve, reject) => {
            ffmpeg.ffprobe(options.inputPath, (err, metadata) => {
                if (err) reject(err);
                else resolve(metadata);
            });
        });
        
        writeLog("[Info] ffprobe raw result: " + JSON.stringify(ffprobeResult, null, 2));

        if (ffprobeResult && ffprobeResult.format && ffprobeResult.format.duration) {
            videoDuration = parseFloat(ffprobeResult.format.duration);
            writeLog(`[Info] Video duration found: ${videoDuration}s`);
            
            // Try to estimate fps from video stream
            let fps = 30; // default fallback
            if (ffprobeResult.streams && ffprobeResult.streams.length > 0) {
                const videoStream = ffprobeResult.streams.find((s: any) => s.codec_type === 'video');
                if (videoStream && videoStream.avg_frame_rate) {
                    const parts = videoStream.avg_frame_rate.split('/');
                    if (parts.length === 2) {
                        const num = parseInt(parts[0], 10);
                        const den = parseInt(parts[1], 10);
                        if (den !== 0) {
                            fps = num / den;
                            writeLog(`[Info] Video FPS found: ${fps} (from ${videoStream.avg_frame_rate})`);
                        } else {
                             writeLog(`[Warning] Invalid avg_frame_rate denominator: ${videoStream.avg_frame_rate}`);
                        }
                    } else {
                        writeLog(`[Warning] Could not parse avg_frame_rate: ${videoStream.avg_frame_rate}`);
                    }
                } else {
                     writeLog('[Warning] No video stream with avg_frame_rate found in probe data.');
                }
            }
            
            // Estimate total frames
            if (videoDuration > 0 && fps > 0) {
                estimatedTotalFrames = Math.round(videoDuration * fps);
                writeLog(`[Info] Initial estimated total frames: ${estimatedTotalFrames}`);
            } else {
                 writeLog('[Warning] Could not estimate total frames (duration or fps invalid).');
            }
        } else {
            writeLog('[Warning] Could not find format.duration in ffprobe result.');
        }
    } catch (err) {
        console.error(`[Encoding Process] Error during ffprobe for duration/frames:`, err);
        writeLog(`[Error] ffprobe failed: ${err instanceof Error ? err.message : String(err)}`);
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
            if (options.mapAudio) {
                // Check if mapAudio contains multiple entries (semicolon-separated)
                if (options.mapAudio.includes(';')) {
                    // Split by semicolon and map each audio stream
                    const audioMaps = options.mapAudio.split(';');
                    
                    // Process the audio streams in the order they should appear in the output
                    audioMaps.forEach((map, index) => {
                        if (map.trim()) { // Only process non-empty entries
                            // Add the map
                            outputOpts.push('-map', map.trim() + '?');
                            writeLog(`[Info] Mapping audio stream ${index}: ${map.trim()}`);
                            
                            // Set disposition - default for first track, none for others
                            if (index === 0) {
                                // Set the first mapped audio stream as default
                                outputOpts.push(`-disposition:a:${index}`, 'default');
                                writeLog(`[Info] Setting audio stream ${index} as default`);
                            } else {
                                // Ensure other streams are not marked as default
                                outputOpts.push(`-disposition:a:${index}`, 'none');
                            }
                        }
                    });
                } else {
                    // Original behavior for single audio stream
                    outputOpts.push('-map', options.mapAudio + '?');
                    // Set as default
                    outputOpts.push('-disposition:a:0', 'default');
                }
            }
            // Iterate over mapSubtitle array
            if (options.mapSubtitle && Array.isArray(options.mapSubtitle)) {
                options.mapSubtitle.forEach((map, index) => {
                    outputOpts.push('-map', map + '?');
                    
                    // Set subtitle disposition - make the first one default
                    if (index === 0) {
                        outputOpts.push(`-disposition:s:${index}`, 'default');
                        writeLog(`[Info] Setting subtitle stream ${index} as default`);
                    } else {
                        outputOpts.push(`-disposition:s:${index}`, 'none');
                    }
                });
            }

            // 2. Video Codec & Options
            if (options.videoCodec && options.mapVideo) { 
                outputOpts.push('-c:v', options.videoCodec);
                if (options.videoCodec !== 'copy') { 
                    if (options.videoPreset) outputOpts.push('-preset:v', options.videoPreset); 
                    if (options.videoQuality) {
                        if (['libx264', 'libx265'].includes(options.videoCodec)) {
                            outputOpts.push('-crf', String(options.videoQuality)); 
                        } else if (['hevc_qsv', 'h264_qsv', 'av1_qsv'].includes(options.videoCodec)) {
                            outputOpts.push('-global_quality:v', String(options.videoQuality)); 
                        }
                    }
                    if (options.lookAhead !== undefined) outputOpts.push('-look_ahead', String(options.lookAhead)); 
                    if (options.pixelFormat) outputOpts.push('-pix_fmt', options.pixelFormat);
                    
                    // Apply resolution setting (takes precedence)
                    if (options.resolution) {
                        outputOpts.push('-s', options.resolution);
                        console.log(`[Encoding Process] Forcing resolution to: ${options.resolution}`);
                        writeLog(`[Info] Forcing resolution to: ${options.resolution}`);
                    }
                    
                    // Apply video filter (may be used in addition to resolution for better scaling)
                    if (options.videoFilter) {
                        outputOpts.push('-vf', options.videoFilter);
                        console.log(`[Encoding Process] Applying video filter: ${options.videoFilter}`);
                        writeLog(`[Info] Applying video filter: ${options.videoFilter}`);
                    }
                }
            } else if (options.mapVideo) {
                 outputOpts.push('-c:v', 'copy'); 
            }

            // 3. Audio Codec & Options
            if (options.audioCodec && options.mapAudio) { 
                 // Check if multiple audio streams are mapped
                 if (options.mapAudio.includes(';')) {
                     const audioMaps = options.mapAudio.split(';');
                     const audioMapCount = audioMaps.filter(map => map.trim()).length;
                     
                     // Apply codec to all audio streams
                     outputOpts.push('-c:a', options.audioCodec);
                     
                     if (options.audioCodec !== 'copy') {
                         // Apply bitrate to all audio streams
                         if (options.audioBitrate) outputOpts.push('-b:a', options.audioBitrate);
                         
                         // For multiple streams with filters, we need to apply filters individually to each stream
                         // Unfortunately, applying filters to specific streams can be complex
                         // For now, apply the filter to all streams if specified
                         if (options.audioFilter) {
                             outputOpts.push('-af', options.audioFilter);
                             writeLog(`[Info] Applying audio filter to all streams: ${options.audioFilter}`);
                         }
                         
                         // Add support for additional audio codec options (like mapping_family for libopus)
                         if (options.audioOptions && options.audioOptions.length > 0) {
                             outputOpts.push(...options.audioOptions);
                         }
                     }
                 } else {
                     // Original behavior for single audio stream
                     outputOpts.push('-c:a', options.audioCodec);
                     if (options.audioCodec !== 'copy') { 
                         if (options.audioBitrate) outputOpts.push('-b:a', options.audioBitrate); 
                         if (options.audioFilter) outputOpts.push('-af', options.audioFilter);
                         if (options.audioOptions && options.audioOptions.length > 0) {
                             outputOpts.push(...options.audioOptions);
                         }
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
            
            // Add custom metadata to mark this file as processed by Recodarr
            // For global metadata across container types, use the global metadata tag
            writeLog('[Info] Adding Recodarr processing metadata tags');
            
            // Apply specific metadata tags with explicit key/value for detection
            // These core tags will be used to identify processed files
            outputOpts.push('-metadata', `encoded_by=Recodarr`); // Standard tag recognized by most players
            outputOpts.push('-metadata', `processed_by=Recodarr`); // Our custom tag
            outputOpts.push('-metadata', `processed_date=${new Date().toISOString()}`);
            
            // Add detailed codec information regardless of container type
            if (options.videoCodec) {
                outputOpts.push('-metadata', `recodarr_video_codec=${options.videoCodec}`);
                writeLog(`[Info] Adding video codec metadata: ${options.videoCodec}`);
            }
            if (options.audioCodec) {
                outputOpts.push('-metadata', `recodarr_audio_codec=${options.audioCodec}`);
                writeLog(`[Info] Adding audio codec metadata: ${options.audioCodec}`);
            }
            
            // Container-specific handling for extended metadata
            const outputExt = path.extname(tempOutputPath).toLowerCase();
            if (outputExt === '.mkv') {
                // MKV-specific metadata format
                writeLog('[Info] MKV container detected - adding MKV-specific metadata');
                
                // Add MKV comment tag which is well-supported
                const commentText = `Processed by Recodarr on ${new Date().toISOString()}`;
                outputOpts.push('-metadata', `comment=${commentText}`);
                
                // Add metadata to individual streams as well for better detection
                if (options.mapVideo) {
                    outputOpts.push('-metadata:s:v:0', 'encoded_by=Recodarr');
                    outputOpts.push('-metadata:s:v:0', `comment=${commentText}`);
                }
                if (options.mapAudio) {
                    outputOpts.push('-metadata:s:a:0', 'encoded_by=Recodarr');
                    outputOpts.push('-metadata:s:a:0', `comment=${commentText}`);
                }
            }
            
            writeLog(`[Info] Metadata tags added to output options`);
            
            outputOpts.push('-hide_banner');
            outputOpts.push('-y'); // Overwrite output (this applies to the *temp* file initially)

            // --- Apply ALL output options via outputOptions() ---
            writeLog("[Info] Applying output options: " + JSON.stringify(outputOpts));
            command.outputOptions(outputOpts); 
            
            // --- Output File --- 
            command.output(tempOutputPath);

            // --- Event Handlers --- 
            command.on('start', (commandLine: string) => {
                console.log(`[Encoding Process] Spawned Ffmpeg command: ${commandLine}`);
                writeLog(`[FFMPEG Command] ${commandLine}`);
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

            // --- Log stdout/stderr ---
            command.on('stderr', (stderrLine: string) => {
                 // console.log(`[Encoding Process] stderr: ${stderrLine}`);
                 writeLog(`[stderr] ${stderrLine.trim()}`); // Log stderr
            });
            // --- End Log stdout/stderr ---

            command.on('error', async (err: Error, stdout: string | null, stderr: string | null) => {
                console.error(`[Encoding Process] Encoding failed: ${err.message}`);
                writeLog(`[Error] Encoding failed: ${err.message}`);
                if (stdout) {
                    console.error('[Encoding Process] FFMPEG stdout on error:', stdout);
                    writeLog(`[stdout on error] ${stdout.trim()}`);
                }
                if (stderr) {
                    console.error('[Encoding Process] FFMPEG stderr on error:', stderr);
                    writeLog(`[stderr on error] ${stderr.trim()}`);
                }
                // Attempt to clean up temp file on error
                try {
                    await fs.unlink(tempOutputPath);
                    writeLog(`[Info] Cleaned up temp file on error: ${tempOutputPath}`);
                } catch (cleanupError: any) {
                    if (cleanupError.code !== 'ENOENT') {
                        writeLog(`[Error] Error cleaning up temp file after encoding error: ${cleanupError.message}`);
                    }
                }
                
                // --- Close Log Stream on Error ---
                writeLog(`--- Encoding Job ${jobId} Failed ---`);
                logStream?.end(() => console.log(`[Log] Closed log stream for failed Job ${jobId}.`));
                // --- End Close Log Stream ---

                resolve({ success: false, error: err.message });
            });

            command.on('end', async (stdout: string | null, stderr: string | null) => {
                writeLog(`[Info] FFmpeg process ended.`);
                if (stdout) {
                    // console.log('[Encoding Process] FFMPEG stdout on end:', stdout); // Might contain final stats
                    writeLog(`[stdout on end] ${stdout.trim()}`);
                }
                if (stderr) {
                    // console.log('[Encoding Process] FFMPEG stderr on end:', stderr); // Might contain warnings/info
                    writeLog(`[stderr on end] ${stderr.trim()}`);
                }

                console.log(`[Encoding Process] FFmpeg completed successfully for temp file: ${tempOutputPath}`);
                writeLog(`[Info] Attempting to rename ${tempOutputPath} to ${finalTargetPath}`);

                try {
                    // When overwriting, we need to ensure the target file doesn't exist first
                    // as fs.rename may fail on Windows if the target exists
                    if (overwriteInput && finalTargetPath !== tempOutputPath) {
                        try {
                            // Check if target file exists and unlink it before rename
                            await fs.access(finalTargetPath, fs.constants.F_OK);
                            console.log(`[Encoding Process] Target file exists, removing it: ${finalTargetPath}`);
                            writeLog(`[Info] Removing existing target file: ${finalTargetPath}`);
                            await fs.unlink(finalTargetPath);
                        } catch (accessError: any) {
                            // File doesn't exist, which is fine for our rename operation
                            if (accessError.code !== 'ENOENT') {
                                console.warn(`[Encoding Process] Warning checking target file: ${accessError.message}`);
                                writeLog(`[Warning] Error checking target file: ${accessError.message}`);
                            }
                        }
                    }
                    
                    // Rename the temporary file to the final path
                    await fs.rename(tempOutputPath, finalTargetPath);
                    console.log(`[Encoding Process] Successfully renamed temp file to: ${finalTargetPath}`);
                    writeLog(`[Success] Renamed temp file to: ${finalTargetPath}`);

                    // Get final file size and calculate reduction
                    let finalSize = 0;
                    let reductionPercent: number | undefined = undefined;
                    try {
                        const finalStats = await fs.stat(finalTargetPath);
                        finalSize = finalStats.size;
                        if (initialSize > 0 && finalSize > 0) {
                            reductionPercent = Number(((1 - (finalSize / initialSize)) * 100).toFixed(2));
                        }
                        writeLog(`[Success] Final file size: ${finalSize} bytes (${(finalSize / (1024*1024)).toFixed(2)} MB)`);
                        writeLog(`[Success] Size reduction: ${reductionPercent?.toFixed(2) ?? 'N/A'}%`);
                    } catch (statError: any) {
                        console.warn(`[Encoding Process] Could not get final file size for ${finalTargetPath}`, statError);
                        writeLog(`[Warning] Could not get final file size: ${statError.message}`);
                    }

                    // --- Close Log Stream on Success --- 
                    writeLog(`--- Encoding Job ${jobId} Succeeded ---`);
                    logStream?.end(() => console.log(`[Log] Closed log stream for successful Job ${jobId}.`));
                    // --- End Close Log Stream ---

                    // Resolve with success and the final path
                    resolve({
                        success: true,
                        outputPath: finalTargetPath, // Return the final path
                        initialSizeMB: initialSize > 0 ? Number((initialSize / (1024 * 1024)).toFixed(2)) : undefined,
                        finalSizeMB: finalSize > 0 ? Number((finalSize / (1024 * 1024)).toFixed(2)) : undefined,
                        reductionPercent: reductionPercent
                    });

                } catch (renameError: any) {
                    console.error(`[Encoding Process] Failed to rename temp file ${tempOutputPath} to ${finalTargetPath}:`, renameError);
                    writeLog(`[Error] Failed to rename temp file: ${renameError.message}`);
                    // Attempt to clean up the temp file if rename failed
                    try {
                        await fs.unlink(tempOutputPath);
                        writeLog(`[Info] Cleaned up temp file after rename failure: ${tempOutputPath}`);
                    } catch (cleanupError: any) {
                         if (cleanupError.code !== 'ENOENT') {
                            writeLog(`[Error] Error cleaning up temp file after rename failure: ${cleanupError.message}`);
                        }
                    }
                    
                    // --- Close Log Stream on Rename Error ---
                    writeLog(`--- Encoding Job ${jobId} Failed (Rename Error) ---`);
                    logStream?.end(() => console.log(`[Log] Closed log stream for failed (rename) Job ${jobId}.`));
                    // --- End Close Log Stream ---

                    resolve({ success: false, error: `Failed to move encoded file: ${renameError.message}` });
                }
            });

            // --- Run --- 
            command.run();

        } catch (err) {
            console.error(`[Encoding Process] Error setting up ffmpeg command:`, err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            writeLog(`[Error] Failed to setup ffmpeg command: ${errorMsg}`);
            
            // --- Close Log Stream on Setup Error ---
            writeLog(`--- Encoding Job ${jobId} Failed (Setup Error) ---`);
            logStream?.end(() => console.log(`[Log] Closed log stream for failed (setup) Job ${jobId}.`));
            // --- End Close Log Stream ---

            resolve({ success: false, error: errorMsg });
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