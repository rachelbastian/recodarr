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
    jobId?: string; // Add jobId to the interface
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
    logFileId?: string; // Add logFileId field to match the actual result
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

// Create a wrapper for progress callback to store state
interface ProgressCallbackWrapper {
  (progress: EncodingProgress): void;
  lastFrameUpdate?: number;
  timer?: NodeJS.Timeout;
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

    // Create a progress callback wrapper with additional state
    const progressCallbackWrapper: ProgressCallbackWrapper = options.progressCallback ? 
        (progress: EncodingProgress) => {
            // Track the last time we saw a frame update
            if (progress.frame) {
                progressCallbackWrapper.lastFrameUpdate = Date.now();
            }
            
            // Call the original callback
            options.progressCallback!(progress);
        } : 
        () => {}; // Empty function if no callback
    
    progressCallbackWrapper.lastFrameUpdate = 0;

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
            let nb_frames = 0;
            
            if (ffprobeResult.streams && ffprobeResult.streams.length > 0) {
                const videoStream = ffprobeResult.streams.find((s: any) => s.codec_type === 'video');
                if (videoStream) {
                    // Check if stream has nb_frames property (actual frame count)
                    if (videoStream.nb_frames && parseInt(videoStream.nb_frames, 10) > 0) {
                        nb_frames = parseInt(videoStream.nb_frames, 10);
                        writeLog(`[Info] Frame count from probe: ${nb_frames}`);
                        estimatedTotalFrames = nb_frames;
                    }
                    
                    // Get FPS in any case for estimation if we don't have frame count
                    if (videoStream.avg_frame_rate) {
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
                    
                    // If we have r_frame_rate as backup, use that for FPS
                    if (!fps && videoStream.r_frame_rate) {
                        const parts = videoStream.r_frame_rate.split('/');
                        if (parts.length === 2) {
                            const num = parseInt(parts[0], 10);
                            const den = parseInt(parts[1], 10);
                            if (den !== 0) {
                                fps = num / den;
                                writeLog(`[Info] Video FPS found from r_frame_rate: ${fps} (from ${videoStream.r_frame_rate})`);
                            }
                        }
                    }
                }
                
                // Estimate total frames if we don't have it already
                if (!estimatedTotalFrames && videoDuration > 0 && fps > 0) {
                    estimatedTotalFrames = Math.round(videoDuration * fps);
                    writeLog(`[Info] Estimated total frames from duration and FPS: ${estimatedTotalFrames}`);
                }
                
                // As an extra backup, use format.bit_rate to get a basic estimation of complexity
                if (ffprobeResult.format.bit_rate) {
                    const bitrate = parseInt(ffprobeResult.format.bit_rate, 10);
                    writeLog(`[Info] Video bitrate: ${bitrate} bps`);
                    
                    // Send an initial progress update to get the UI started
                    if (options.progressCallback) {
                        options.progressCallback({
                            status: 'Starting encoding...',
                            percent: 0.5, // Small initial value to show activity
                        });
                    }
                }
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
                
                // Send an immediate progress update to indicate the process has started
                if (progressCallbackWrapper) {
                    progressCallbackWrapper({
                        status: 'Starting ffmpeg process...',
                        percent: 0.1, // Minimal value to show activity
                    });
                    
                    // Set up a timer for regular progress updates even if ffmpeg is quiet
                    let startTime = Date.now();
                    let progressTimer = setInterval(() => {
                        // If we haven't received any frames yet, calculate progress based on time
                        // This ensures progress is shown even if frame information is delayed
                        const elapsedSeconds = (Date.now() - startTime) / 1000;
                        
                        // Only send these fallback updates if we have duration and no frames have been reported yet
                        if (videoDuration && !progressCallbackWrapper.lastFrameUpdate) {
                            const estimatedPercent = Math.min(10, (elapsedSeconds / (videoDuration * 0.1)) * 100);
                            
                            progressCallbackWrapper({
                                status: 'Processing...',
                                percent: estimatedPercent,
                            });
                            
                            console.log(`[Encoding Process] Sending time-based fallback progress: ${estimatedPercent.toFixed(1)}%`);
                        }
                        
                        // Stop sending these after 30 seconds or if encoding completes
                        if (elapsedSeconds > 30) {
                            clearInterval(progressTimer);
                        }
                    }, 2000); // Send updates every 2 seconds
                    
                    // Attach the timer to the callback so we can clear it when encoding completes
                    progressCallbackWrapper.timer = progressTimer;
                    progressCallbackWrapper.lastFrameUpdate = 0;
                }
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
                        
                        // Create a proper status message
                        let status = 'Processing...';
                        
                        // Get frame progress details
                        let frame: number | undefined;
                        
                        // Handle different frame number formats from ffmpeg
                        if (progress.frames !== undefined) {
                            frame = parseInt(String(progress.frames), 10);
                            status = 'Encoding frames...';
                        } else if (progress.frame !== undefined) {
                            frame = parseInt(String(progress.frame), 10);
                            status = 'Encoding frames...';
                        } else if (progress.currentFrame !== undefined) {
                            frame = parseInt(String(progress.currentFrame), 10);
                            status = 'Encoding frames...';
                        }
                        
                        // Log frame update for debugging
                        if (frame !== undefined) {
                            console.log(`[ffmpeg] Frame update: ${frame}`);
                            // Update the last frame update timestamp
                            progressCallbackWrapper.lastFrameUpdate = Date.now();
                        }
                        
                        // Early progress indicator - send 1% immediately when we start to show activity
                        if (frame === 1 && !percent) {
                            percent = 1; // Start at 1% to show immediate progress 
                            console.log(`[ffmpeg] Setting initial progress indicator to 1%`);
                        }
                        
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
                            console.log(`[ffmpeg] Using total frames from ffmpeg progress: ${currentTotalFrames}`);
                        } else {
                            // Keep using the initial estimate if ffmpeg doesn't provide one
                            console.log(`[ffmpeg] Using initial estimated total frames: ${currentTotalFrames}`);
                        }
                        
                        // CRITICAL: If we have frame but no percent, always calculate it
                        // This is the main issue - we need to calculate percentage as soon as possible
                        if (frame !== undefined && currentTotalFrames && currentTotalFrames > 0) {
                            const calculatedPercent = Number(((frame / currentTotalFrames) * 100).toFixed(1));
                            
                            // If no percent exists or our calculation is higher, use our calculation
                            if (percent === undefined || calculatedPercent > percent) {
                                percent = Math.min(99.9, Math.max(0, calculatedPercent));
                                console.log(`[ffmpeg] Calculated percent from frames: ${percent}% (${frame}/${currentTotalFrames})`);
                            }
                        }
                        
                        // Ensure we always have some progress value even if calculation fails
                        if (percent === undefined && frame !== undefined && frame > 0) {
                            // Estimate progress based on time if we have time info
                            if (progress.timemark && videoDuration) {
                                const currentTime = convertTimemarkToSeconds(progress.timemark) || 0;
                                const timeBasedPercent = Math.min(99.9, Math.max(0, (currentTime / videoDuration) * 100));
                                percent = Number(timeBasedPercent.toFixed(1));
                                console.log(`[ffmpeg] Calculated percent from time: ${percent}% (${currentTime}s/${videoDuration}s)`);
                                status = `Processing ${currentTime.toFixed(1)}s of ${videoDuration.toFixed(1)}s...`;
                            } else if (frame > 10 && estimatedTotalFrames) {
                                // If we have no duration but have processed more than 10 frames, show at least some progress
                                // This ensures user sees early feedback
                                const estimatedPercent = Math.min(5, frame / 10); // Max 5% for first 50 frames as a fallback
                                percent = estimatedPercent;
                                console.log(`[ffmpeg] Using frame count as minimal progress indicator: ${percent}% (from ${frame} frames)`);
                                status = `Processed ${frame} frames...`;
                            }
                        }

                        // Ensure percent is capped between 0 and 100
                        if (percent !== undefined) {
                            percent = Math.max(0, Math.min(100, percent));
                        } else {
                            // Always have some progress value
                            percent = 0.1; // Minimal indicator
                        }
                        
                        // Create progress object to send to UI
                        const progressUpdate: EncodingProgress = {
                            percent, // Keep sending percent if available, UI might use it as fallback
                            fps,
                            frame,
                            totalFrames: currentTotalFrames, // Send the best available total frames count
                            status,
                            jobId: options.jobId // Always include the job ID if present
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

            command.on('end', (stdout: string | null, stderr: string | null) => {
                console.log(`[Encoding Process] Encoding completed successfully for: ${options.inputPath}`);
                writeLog(`[Info] Encoding completed successfully for: ${options.inputPath}`);
                
                if (stdout) {
                    writeLog(`[stdout on end] ${stdout.trim()}`);
                }
                if (stderr) {
                    writeLog(`[stderr on end] ${stderr.trim()}`);
                }
                
                // Calculate file size reduction
                try {
                    const getFinalStats = async () => {
                        try {
                            // Get size of final output file
                            const finalStats = await fs.stat(tempOutputPath);
                            const finalSize = finalStats.size;
                            const initialSizeMB = initialSize / (1024*1024);
                            const finalSizeMB = finalSize / (1024*1024);
                            const reductionPercent = initialSize > 0 ? 
                                ((initialSize - finalSize) / initialSize) * 100 : 0;
                            
                            writeLog(`[Info] Encoding stats:`);
                            writeLog(`[Info] - Initial file size: ${initialSizeMB.toFixed(2)} MB`);
                            writeLog(`[Info] - Final file size: ${finalSizeMB.toFixed(2)} MB`);
                            writeLog(`[Info] - Size reduction: ${reductionPercent.toFixed(2)}%`);
                            
                            // Add temporary file path to log
                            writeLog(`[Info] Temporary output file: ${tempOutputPath}`);
                            writeLog(`[Info] Target final path: ${finalTargetPath}`);
                            
                            // Close log stream before resolving
                            logStream?.end();
                            
                            // Return the result with file size information
                            resolve({
                                success: true,
                                outputPath: tempOutputPath,
                                initialSizeMB: parseFloat(initialSizeMB.toFixed(2)),
                                finalSizeMB: parseFloat(finalSizeMB.toFixed(2)),
                                reductionPercent: parseFloat(reductionPercent.toFixed(2)),
                                jobId: options.jobId,
                                logFileId: options.jobId // Add logFileId explicitly equal to jobId
                            });
                        } catch (statsError) {
                            writeLog(`[Error] Error getting final file stats: ${statsError instanceof Error ? statsError.message : String(statsError)}`);
                            logStream?.end();
                            resolve({ 
                                success: true, 
                                outputPath: tempOutputPath,
                                jobId: options.jobId,
                                logFileId: options.jobId,
                                error: `Encoding succeeded but failed to get file statistics: ${statsError instanceof Error ? statsError.message : String(statsError)}`
                            });
                        }
                    };
                    // Call the async function to get final stats
                    getFinalStats();
                } catch (finalError) {
                    writeLog(`[Error] Error in final processing: ${finalError instanceof Error ? finalError.message : String(finalError)}`);
                    logStream?.end();
                    resolve({ 
                        success: true, 
                        outputPath: tempOutputPath,
                        jobId: options.jobId,
                        logFileId: options.jobId
                    });
                }
            });

            command.on('error', (err: any) => {
                console.error(`[Encoding Process] Error during encoding:`, err);
                writeLog(`[Error] Encoding failed: ${err instanceof Error ? err.message : String(err)}`);
                logStream?.end();
                resolve({ 
                    success: false, 
                    error: err instanceof Error ? err.message : String(err),
                    jobId: options.jobId,
                    logFileId: options.jobId
                });
            });

            // Start encoding
            command.run();
        } catch (error) {
            console.error(`[Encoding Process] Error starting encoding:`, error);
            writeLog(`[Error] Encoding failed: ${error instanceof Error ? error.message : String(error)}`);
            logStream?.end();
            resolve({ 
                success: false, 
                error: error instanceof Error ? error.message : String(error),
                jobId: options.jobId,
                logFileId: options.jobId
            });
        }
    });
}