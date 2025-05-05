import ffprobeStatic from 'ffprobe-static';
import { execFile } from 'child_process';
import path from 'path';

/**
 * Probes a media file to get detailed information about its streams and format
 * @param filePath Path to the media file to probe
 * @returns A promise that resolves to the probe data or null if probing fails
 */
export async function probeFile(filePath: string): Promise<any | null> {
    console.log(`Probing file: ${filePath}`);
    const ffprobePath = ffprobeStatic && typeof ffprobeStatic === 'object' && 'path' in ffprobeStatic ? ffprobeStatic.path : ffprobeStatic as string;
    const args = [
        '-v', 'error',          // Less verbose output
        '-show_format',       // Get format info (size, duration)
        '-show_streams',      // Get stream info (codecs)
        '-of', 'json',         // Output as JSON
        '-i', filePath        // Input file
    ];

    return new Promise((resolve) => {
        execFile(ffprobePath, args, { timeout: 30000, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                // Check if it's an AppleDouble file error before logging
                if (path.basename(filePath).startsWith('._')) {
                    // Optional: Log as debug if needed, but avoid console.error for expected failures
                    // console.debug(`Ignoring expected ffprobe failure for macOS metadata file: ${filePath}`);
                } else {
                    // Log other, unexpected ffprobe errors
                    console.error(`ffprobe error for ${filePath}:`, error.message);
                }
                // Don't reject, just return null if ffprobe fails for any reason
                return resolve(null); 
            }
            if (stderr) {
                // Usually contains warnings, can be ignored unless debugging
                // console.warn(`ffprobe stderr for ${filePath}:`, stderr);
            }
            try {
                const probeData = JSON.parse(stdout);
                
                // Check if this file has already been processed by Recodarr
                if (probeData.format && probeData.format.tags) {
                    const tags = probeData.format.tags;
                    console.log(`[probeFile] Checking metadata tags in format:`, JSON.stringify(tags, null, 2));
                    
                    // Convert all keys to lowercase for case-insensitive comparison
                    const lowercaseTags: Record<string, string> = {};
                    for (const key in tags) {
                        lowercaseTags[key.toLowerCase()] = tags[key];
                    }
                    
                    // Check multiple possible tags since different containers handle metadata differently
                    // Use lowercase keys to handle case sensitivity issues
                    const isProcessedByRecodarr = 
                        lowercaseTags['processed_by'] === "Recodarr" || 
                        lowercaseTags['encoded_by'] === "Recodarr" ||
                        (lowercaseTags['comment'] && lowercaseTags['comment'].includes("Processed by Recodarr"));
                    
                    console.log(`[probeFile] Processed by Recodarr check results:`);
                    console.log(`- processed_by tag: "${lowercaseTags['processed_by']}"`);
                    console.log(`- encoded_by tag: "${lowercaseTags['encoded_by']}"`);
                    console.log(`- comment tag: "${lowercaseTags['comment']}"`);
                    console.log(`- isProcessedByRecodarr result: ${isProcessedByRecodarr}`);
                        
                    if (isProcessedByRecodarr) {
                        console.log(`File already processed by Recodarr: ${filePath}`);
                        // Log all available metadata for debugging
                        console.log(`All metadata tags:`, JSON.stringify(tags, null, 2));
                        
                        // Get values from tags, falling back as needed
                        const processDate = lowercaseTags['processed_date'] || 
                            (lowercaseTags['comment'] && lowercaseTags['comment'].match(/Recodarr on (.*?)($|\s)/)?.[1]) || 
                            "Unknown date";
                            
                        // Add a flag to indicate this was processed by Recodarr
                        probeData.processedByRecodarr = {
                            processed: true,
                            date: processDate,
                            videoCodec: lowercaseTags['recodarr_video_codec'] || "Unknown",
                            audioCodec: lowercaseTags['recodarr_audio_codec'] || "Unknown"
                        };
                        
                        console.log(`[probeFile] Added processedByRecodarr flag:`, JSON.stringify(probeData.processedByRecodarr, null, 2));
                    }
                } else {
                    console.log(`[probeFile] No format tags found in file: ${filePath}`);
                }
                
                // Also check stream metadata in case container metadata isn't reliable
                if (probeData.streams && !probeData.processedByRecodarr) {
                    console.log(`[probeFile] Checking ${probeData.streams.length} streams for metadata`);
                    
                    for (let i = 0; i < probeData.streams.length; i++) {
                        const stream = probeData.streams[i];
                        if (stream.tags) {
                            console.log(`[probeFile] Stream ${i} (${stream.codec_type}) tags:`, JSON.stringify(stream.tags, null, 2));
                            
                            // Convert stream tags to lowercase for case-insensitive comparison
                            const streamLowercaseTags: Record<string, string> = {};
                            for (const key in stream.tags) {
                                streamLowercaseTags[key.toLowerCase()] = stream.tags[key];
                            }
                            
                            const streamProcessed = 
                                streamLowercaseTags['processed_by'] === "Recodarr" || 
                                streamLowercaseTags['encoded_by'] === "Recodarr" ||
                                (streamLowercaseTags['comment'] && streamLowercaseTags['comment'].includes("Processed by Recodarr"));
                                
                            if (streamProcessed) {
                                console.log(`File already processed by Recodarr (detected in stream ${i} metadata): ${filePath}`);
                                
                                probeData.processedByRecodarr = {
                                    processed: true,
                                    date: streamLowercaseTags['processed_date'] || "Unknown date",
                                    videoCodec: streamLowercaseTags['recodarr_video_codec'] || "Unknown",
                                    audioCodec: streamLowercaseTags['recodarr_audio_codec'] || "Unknown"
                                };
                                
                                console.log(`[probeFile] Added processedByRecodarr flag from stream:`, 
                                    JSON.stringify(probeData.processedByRecodarr, null, 2));
                                break;
                            }
                        }
                    }
                }
                
                resolve(probeData);
            } catch (parseError) {
                console.error(`Error parsing ffprobe output for ${filePath}:`, parseError);
                resolve(null);
            }
        });
    });
} 