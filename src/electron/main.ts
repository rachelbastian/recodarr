import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent, clipboard, systemPreferences, nativeTheme } from 'electron';
import { isDev } from "./util.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";
import { getStaticData, pollResources, stopPolling } from "./test.js";
import si from 'systeminformation';
import Store from 'electron-store';
import { exec, execFile } from 'child_process';
import { Buffer } from 'buffer';
import path from 'path';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import fsSync from 'fs';
import ffprobeStatic from 'ffprobe-static';
import * as chokidar from 'chokidar';
import { Node, Edge } from 'reactflow';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { startEncodingProcess } from './ffmpegUtils.js';
import crypto from 'crypto';
import { setMainWindow, captureConsoleLogs, getLogBuffer } from './logger.js'; // Import logger functions
// Remove problematic type import
// import type { ... } from '../../types.js';

// --- Define Types Locally within main.ts ---
// (Copied from src/types.d.ts)
interface GpuInfo { vendor: string; model: string; memoryTotal: number | null }; // Keep needed simple types
interface SystemStats { cpuLoad: number | null; memLoad: number | null; gpuLoad: number | null; gpuMemoryUsed: number | null; gpuMemoryTotal: number | null; gpuMemoryUsagePercent: number | null; error?: string };

interface WatchedFolder {
    path: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
}

interface Workflow {
    id: number;
    name: string;
    description: string;
}

interface WorkflowDetails extends Workflow {
    nodes: Node[]; // Use imported Node/Edge types
    edges: Edge[];
}

interface HardwareInfo {
    id?: number; // Assuming it might have an ID from DB
    device_type: string;
    vendor?: string;
    model: string;
    device_id?: string;
    cores_threads?: number;
    base_clock_mhz?: number | null;
    memory_mb?: number | null;
    is_enabled?: boolean;
    priority?: number;
}

interface EncodingProgress {
    percent?: number;
    fps?: number;
    elapsed?: number;
    frame?: number;
    totalFrames?: number;
    status?: string;
}

interface EncodingResult {
    success: boolean;
    outputPath?: string;
    error?: string;
    initialSizeMB?: number;
    finalSizeMB?: number;
    reductionPercent?: number;
    jobId?: string; // Added jobId
}

interface EncodingOptions {
    inputPath: string;
    outputPath: string;
    overwriteInput?: boolean; // Added flag for overwriting
    hwAccel?: 'auto' | 'qsv' | 'nvenc' | 'cuda' | 'vaapi' | 'videotoolbox' | 'none';
    duration?: number;
    outputOptions: string[]; 
    // --- Add potentially missing options from ffmpegUtils --- 
    videoCodec?: string;
    videoPreset?: string;
    videoQuality?: number | string;
    lookAhead?: number;
    pixelFormat?: string;
    mapVideo?: string;
    audioCodec?: string;
    audioBitrate?: string;
    audioFilter?: string;
    mapAudio?: string;
    audioOptions?: string[];
    subtitleCodec?: string;
    mapSubtitle?: string[];
    // --- Added for logging ---
    jobId?: string;
    logDirectoryPath?: string;
    // Optional progressCallback for internal use (if needed by main.ts logic)
    progressCallback?: (progress: EncodingProgress) => void;
}
// --- End Local Type Definitions ---

// --- FFMPEG Configuration ---
// Log the path provided by ffmpeg-static
console.log(`[FFMPEG Config] Path from ffmpeg-static: ${ffmpegStatic}`);
// Set the path to the ffmpeg binary from the static package
try {
    ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
    console.log(`[FFMPEG Config] Successfully set ffmpeg path.`);
} catch (error) {
    console.error(`[FFMPEG Config] Error setting ffmpeg path:`, error);
}
// --- End FFMPEG Configuration ---

// Initialize electron-store
const store = new Store();
const SELECTED_GPU_KEY = 'selectedGpuModel';
const ENABLE_PS_GPU_KEY = 'enablePsGpuMonitoring'; // Key for the toggle
const WATCHED_FOLDERS_KEY = 'watchedFolders'; // Added key for watched folders
const MANUAL_GPU_VRAM_MB_KEY = 'manualGpuVramMb'; // Key for manual VRAM override

// --- Define Watched Folder Type ---
interface WatchedFolder {
    path: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
}
// --- End Define Watched Folder Type ---

// --- Define Workflow Types ---
interface Workflow {
    id: number;
    name: string;
    description: string;
}

interface WorkflowDetails extends Workflow {
    nodes: Node[];
    edges: Edge[];
}
// --- End Workflow Types ---

// --- Database Setup ---
let db: Database.Database;
// --- End Database Setup ---

// --- Media Scanner & Watcher Constants & State ---
const SUPPORTED_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'];
let isScanning = false;
let watcher: chokidar.FSWatcher | null = null;
// --- End Media Scanner & Watcher Constants & State ---

// --- File System Watcher Functions ---

function startWatching(folders: WatchedFolder[]) {
    if (watcher) {
        console.log("Closing existing watcher before starting new one.");
        watcher.close();
    }

    const pathsToWatch = folders.map(f => f.path);
    if (pathsToWatch.length === 0) {
        console.log("No folders configured to watch.");
        return;
    }

    console.log(`Initializing watcher for paths: ${pathsToWatch.join(", ")}`);
    watcher = chokidar.watch(pathsToWatch, {
        ignored: [
            /(^|[\\\/])\../,  // ignore dotfiles
            /.*_tmp.*\.(?:mkv|mp4|avi|mov|wmv|flv|webm)$/i  // More specific pattern for temp encoding files
        ],
        persistent: true,
        ignoreInitial: true, // Don't fire 'add' events for existing files on startup
        awaitWriteFinish: {   // Try to wait for files to finish writing
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });

    watcher
        .on('add', async (filePath: string) => {
            console.log(`Watcher detected new file: ${filePath}`);
            const ext = path.extname(filePath).toLowerCase();
            
            // Skip temporary files created during encoding
            if (filePath.includes('_tmp')) {
                console.log(`Skipping temporary encoding file: ${filePath}`);
                return;
            }
            
            if (SUPPORTED_EXTENSIONS.includes(ext)) {
                // Find which library this file belongs to
                const parentFolder = folders.find(f => filePath.startsWith(f.path + path.sep));
                if (parentFolder) {
                    const probeData = await probeFile(filePath);
                    if (probeData) {
                        await addMediaToDb(probeData, parentFolder.libraryName, parentFolder.libraryType);
                    }
                } else {
                     console.warn(`File added in watched parent, but couldn't determine library: ${filePath}`);
                }
            }
        })
        .on('unlink', (filePath: string) => {
             console.log(`File ${filePath} has been removed`);
        })
        .on('error', (error: unknown) => {
             if (error instanceof Error) {
                 console.error(`Watcher error: ${error.message}`);
             } else {
                 console.error('Watcher error:', error);
             }
         })
        .on('ready', () => console.log('Initial scan complete. Watcher is ready.'));
}

function stopWatching() {
    if (watcher) {
        console.log("Closing file watcher.");
        watcher.close();
        watcher = null;
    }
}

function watchPath(folderPath: string) {
    if (watcher) {
        console.log(`Adding path to watcher: ${folderPath}`);
        watcher.add(folderPath);
    }
}

function unwatchPath(folderPath: string) {
     if (watcher) {
        console.log(`Removing path from watcher: ${folderPath}`);
        watcher.unwatch(folderPath);
    }
}
// --- End File System Watcher Functions ---

// --- Media Scanner Functions ---

async function probeFile(filePath: string): Promise<any | null> {
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

async function addMediaToDb(probeData: any, libraryName: string, libraryType: WatchedFolder['libraryType']): Promise<void> {
    if (!db) {
        console.error("Database not initialized, cannot add media.");
        return;
    }
    if (!probeData?.format?.filename) {
        console.warn("Skipping DB add due to missing filename in probe data.");
        return;
    }

    const filePath = probeData.format.filename;
    const title = path.basename(filePath, path.extname(filePath));
    const fileSize = probeData.format.size ? parseInt(probeData.format.size, 10) : 0;

    let videoCodec: string | null = null;
    let audioCodec: string | null = null;
    let resolutionWidth: number | null = null;
    let resolutionHeight: number | null = null;
    let audioChannels: number | null = null;

    if (probeData.streams && Array.isArray(probeData.streams)) {
        const videoStream = probeData.streams.find((s: any) => s.codec_type === 'video');
        const audioStream = probeData.streams.find((s: any) => s.codec_type === 'audio');
        videoCodec = videoStream?.codec_name ?? null;
        audioCodec = audioStream?.codec_name ?? null;
        resolutionWidth = videoStream?.width ?? null;
        resolutionHeight = videoStream?.height ?? null;
        audioChannels = audioStream?.channels ?? null;
    }

    try {
        // First check if the file already exists in the database
        const existingFile = db.prepare('SELECT id, originalSize FROM media WHERE filePath = ?').get(filePath) as { id: number; originalSize: number } | undefined;

        if (existingFile) {
            // Update currentSize and lastSizeCheckAt for existing file
            const updateSql = `
                UPDATE media 
                SET currentSize = ?, 
                    lastSizeCheckAt = CURRENT_TIMESTAMP,
                    videoCodec = ?,
                    audioCodec = ?,
                    resolutionWidth = ?,
                    resolutionHeight = ?,
                    audioChannels = ?
                WHERE id = ?
            `;
            const updateStmt = db.prepare(updateSql);
            updateStmt.run(fileSize, videoCodec, audioCodec, resolutionWidth, resolutionHeight, audioChannels, existingFile.id);
            console.log(`Updated size for existing file: ${title}`);
        } else {
            // Insert new file with both originalSize and currentSize set to the current size
            const insertSql = `
                INSERT INTO media (
                    title, filePath, originalSize, currentSize,
                    videoCodec, audioCodec, libraryName, libraryType,
                    resolutionWidth, resolutionHeight, audioChannels
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const insertStmt = db.prepare(insertSql);
            const info = insertStmt.run(
                title,
                filePath,
                fileSize,
                fileSize, // currentSize starts same as originalSize
                videoCodec,
                audioCodec,
                libraryName,
                libraryType,
                resolutionWidth,
                resolutionHeight,
                audioChannels
            );
            if (info.changes > 0) {
                console.log(`Added to DB: ${title} (${libraryName})`);
            }
        }
    } catch (error) {
        console.error(`Error adding/updating media in DB (${filePath}):`, error);
    }
}

async function processDirectory(directoryPath: string, libraryName: string, libraryType: WatchedFolder['libraryType'], window: BrowserWindow | null): Promise<void> {
    // console.log(`Scanning directory: ${directoryPath}`); // Can be noisy
    if (window && !window.isDestroyed()) {
        // Optional: Send progress update to renderer
        // window.webContents.send("scan-progress-update", { message: `Scanning: ${directoryPath}` });
    }
    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                await processDirectory(fullPath, libraryName, libraryType, window);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                // Skip temp files and process only supported video extensions
                if (SUPPORTED_EXTENSIONS.includes(ext) && !entry.name.includes('_tmp')) {
                    const probeData = await probeFile(fullPath);
                    if (probeData) {
                        await addMediaToDb(probeData, libraryName, libraryType);
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${directoryPath}:`, error);
        if (window && !window.isDestroyed()) {
            // Optional: Send error update to renderer
            // window.webContents.send("scan-error", { message: `Error scanning ${directoryPath}: ${error.message}` });
        }
    }
}

async function scanMediaFolders(window: BrowserWindow | null): Promise<void> {
    if (isScanning) {
        console.warn("Scan already in progress. Ignoring trigger.");
        return;
    }
    isScanning = true;
    console.log("Starting media scan...");
    if (window && !window.isDestroyed()) {
        window.webContents.send("scan-status-update", { status: 'running', message: 'Starting scan...' });
    }

    const foldersToScan = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
    console.log(`Found ${foldersToScan.length} folders to scan.`);

    for (const folder of foldersToScan) {
        console.log(`Processing library: ${folder.libraryName} (${folder.libraryType}) at ${folder.path}`);
        await processDirectory(folder.path, folder.libraryName, folder.libraryType, window);
    }

    console.log("Media scan finished.");
    isScanning = false;
     if (window && !window.isDestroyed()) {
        window.webContents.send("scan-status-update", { status: 'finished', message: 'Scan complete.' });
    }
}

// Function to scan a single folder
async function scanSingleFolder(folderPath: string, window: BrowserWindow | null): Promise<void> {
    if (isScanning) {
        console.warn("Scan already in progress. Ignoring trigger.");
        return;
    }
    
    isScanning = true;
    console.log(`Starting scan for specific folder: ${folderPath}`);
    
    if (window && !window.isDestroyed()) {
        window.webContents.send("scan-status-update", { 
            status: 'running', 
            message: `Starting scan for folder: ${path.basename(folderPath)}...` 
        });
    }

    const foldersToScan = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
    const folderToScan = foldersToScan.find(folder => folder.path === folderPath);
    
    if (!folderToScan) {
        console.warn(`Folder ${folderPath} not found in watched folders`);
        isScanning = false;
        if (window && !window.isDestroyed()) {
            window.webContents.send("scan-status-update", { 
                status: 'error', 
                message: `Folder not found in watched libraries.` 
            });
        }
        return;
    }

    try {
        console.log(`Processing library: ${folderToScan.libraryName} (${folderToScan.libraryType}) at ${folderToScan.path}`);
        await processDirectory(folderToScan.path, folderToScan.libraryName, folderToScan.libraryType, window);
        
        console.log(`Scan complete for folder: ${folderPath}`);
        isScanning = false;
        if (window && !window.isDestroyed()) {
            window.webContents.send("scan-status-update", { 
                status: 'finished', 
                message: `Scan complete for ${folderToScan.libraryName}.` 
            });
        }
    } catch (error) {
        console.error(`Error scanning folder ${folderPath}:`, error);
        isScanning = false;
        if (window && !window.isDestroyed()) {
            window.webContents.send("scan-status-update", { 
                status: 'error', 
                message: `Error scanning folder: ${error instanceof Error ? error.message : String(error)}` 
            });
        }
    }
}

// Updated function to use PowerShell's -EncodedCommand
function runPsCommand(command: string): Promise<string> {
    console.log(`[DEBUG] PowerShell command requested: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`);
    
    // Skip GPU monitoring commands if the setting is disabled
    if ((command.includes('Get-Counter') || command.includes('\\GPU')) && !store.get(ENABLE_PS_GPU_KEY, false)) {
        console.log('[DEBUG] Skipping PowerShell GPU monitoring command due to setting disabled');
        return Promise.resolve(''); // Return empty string instead of running command
    }
    
    return new Promise((resolve, reject) => {
        // Encode the command as UTF-16LE Buffer, then Base64
        const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');

        exec(`powershell.exe -EncodedCommand ${encodedCommand}`, (error, stdout, stderr) => {
            if (error) {
                // Keep essential error logs
                console.error(`PS exec error for encoded command [${command.substring(0, 50)}...]: ${error}`);
                return reject(error);
            }
            // if (stderr) {
            //     // Comment out non-critical stderr warnings
            //     // console.warn(`PS stderr for encoded command [${command.substring(0, 50)}...]: ${stderr.trim()}`);
            // }
            resolve(stdout.trim());
        });
    });
}

// Helper function to find preferred GPU
const findGpu = (controllers: si.Systeminformation.GraphicsControllerData[], preferredModel: string | null) => {
    if (preferredModel) {
        const preferred = controllers.find(gpu => gpu.model === preferredModel);
        if (preferred) return preferred;
        // Keep this warning as it indicates a configuration issue
        // console.warn(`Preferred GPU model "${preferredModel}" not found. Falling back.`);
    }
    return controllers.find(gpu => !gpu.vendor?.includes('Microsoft')) || controllers[0] || null;
}

async function getSystemStats(): Promise<SystemStats> {
    try {
        // Fetch CPU and System Memory via SI
        const [cpuData, memData] = await Promise.all([
            si.currentLoad(),
            si.mem(),
        ]);

        // Check if PowerShell GPU monitoring is enabled
        const psGpuEnabled = store.get(ENABLE_PS_GPU_KEY, false) as boolean;

        let gpuLoadPs: number | null = null;
        let gpuMemoryUsedPsMb: number | null = null;

        // Only run PS commands if enabled
        if (psGpuEnabled) {
            // Define PS commands for GPU stats (Counters)
            const gpuUtilCommand = `(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage').CounterSamples | Where-Object {$_.CookedValue -ne $null} | Measure-Object -Sum CookedValue | Select-Object -ExpandProperty Sum`;
            const gpuMemUsedCommand = `(Get-Counter '\\GPU Process Memory(*)\\Local Usage').CounterSamples | Where-Object {$_.CookedValue -ne $null} | Measure-Object -Sum CookedValue | Select-Object -ExpandProperty Sum`;

            try {
                const [gpuUtilOutput, gpuMemUsedOutput] = await Promise.all([
                    runPsCommand(gpuUtilCommand),
                    runPsCommand(gpuMemUsedCommand)
                ]);
                gpuLoadPs = gpuUtilOutput ? parseFloat(gpuUtilOutput) : null;
                gpuMemoryUsedPsMb = gpuMemUsedOutput ? parseFloat(gpuMemUsedOutput) / (1024 * 1024) : null;
            } catch (psCounterError) {
                console.error("Error executing PowerShell Get-Counter commands:", psCounterError);
                // Ensure values are null if PS fails even when enabled
                gpuLoadPs = null;
                gpuMemoryUsedPsMb = null;
            }
        }

        // Fetch Total GPU Memory via systeminformation (always attempt this)
        let gpuMemoryTotalSiMb: number | null = null;
        try {
            const gpuData = await si.graphics();
            // console.log("si.graphics() output:", gpuData); // Log the output - keep commented out unless debugging
            const preferredGpuModel = store.get(SELECTED_GPU_KEY) as string | null;
            const targetGpu = findGpu(gpuData.controllers, preferredGpuModel);
            gpuMemoryTotalSiMb = targetGpu?.memoryTotal ?? null;
        } catch (siError) {
             console.error("Error fetching GPU graphics info via systeminformation:", siError);
        }

        // Fetch manual VRAM override
        const manualVramMb = store.get(MANUAL_GPU_VRAM_MB_KEY) as number | null;

        // Determine effective total VRAM (prioritize manual override)
        const effectiveTotalVramMb = manualVramMb ?? gpuMemoryTotalSiMb;

        // Calculate GPU Memory Usage Percentage using effective total
        let gpuMemoryUsagePercent: number | null = null;
        if (gpuMemoryUsedPsMb !== null && effectiveTotalVramMb !== null && effectiveTotalVramMb > 0) {
             gpuMemoryUsagePercent = (gpuMemoryUsedPsMb / effectiveTotalVramMb) * 100;
        }

        return {
            cpuLoad: cpuData.currentLoad,
            memLoad: (memData.active / memData.total) * 100,
            gpuLoad: gpuLoadPs,             // Null if PS monitoring is disabled or fails
            gpuMemoryUsed: gpuMemoryUsedPsMb, // Null if PS monitoring is disabled or fails
            gpuMemoryTotal: effectiveTotalVramMb, // Return the effective total used
            gpuMemoryUsagePercent: gpuMemoryUsagePercent, // Added percentage
        };
    } catch (e: unknown) {
        console.error("Error fetching system stats:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            cpuLoad: null,
            memLoad: null,
            gpuLoad: null,
            gpuMemoryUsed: null,
            gpuMemoryTotal: null, // Return null if error occurs
            gpuMemoryUsagePercent: null, // Ensure percentage is null on error
            error: errorMessage
        };
    }
}

// Added function to poll system stats and send to renderer
function pollSystemStats(window: BrowserWindow) {
    // Clear any existing timer
    if (systemStatsTimer) {
        clearInterval(systemStatsTimer);
    }
    
    systemStatsTimer = setInterval(async () => {
        const stats = await getSystemStats();
        if (window && !window.isDestroyed()) {
            window.webContents.send("system-stats-update", stats);
        }
    }, 2000); // Poll every 2 seconds
}

// --- Hardware Info Management ---
function sanitizeHardwareString(str: string): string {
    return str
        .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII characters
        .replace(/[®™©]/g, '')        // Remove common symbols that often get mangled
        .replace(/\s+/g, ' ')         // Normalize whitespace
        .trim();                      // Remove leading/trailing whitespace
}

interface CPUCore {
    socket?: string;
    speed: number;
}

interface CPUSpeed {
    cores: Array<{
        socket?: string;
        speed: number;
    }>;
}

async function gatherAndStoreHardwareInfo(): Promise<void> {
    if (!db) {
        console.error("Database not initialized. Cannot store hardware info.");
        return;
    }

    try {
        // Get CPU information
        const [cpuData, gpuData] = await Promise.all([
            si.cpu(),
            si.graphics()
        ]);

        // Process CPU information
        // For multi-CPU systems, we'll create an entry for each physical CPU package
        const physicalCPUs = new Set(Array.isArray(cpuData.processors) ? cpuData.processors : [0]); // Default to single CPU if no processor info
        
        for (const processor of physicalCPUs) {
            const cpuEntry = {
                device_type: 'CPU',
                vendor: sanitizeHardwareString(cpuData.manufacturer),
                model: sanitizeHardwareString(cpuData.brand),
                device_id: `cpu${processor}`,
                cores_threads: Math.floor(cpuData.cores / physicalCPUs.size), // Divide cores among physical CPUs
                base_clock_mhz: cpuData.speed,
                memory_mb: Math.round((cpuData.cache?.l3 || 0) / 1024),
            };

            const cpuStmt = db.prepare(`
                INSERT INTO hardware_info 
                (device_type, vendor, model, device_id, cores_threads, base_clock_mhz, memory_mb, last_updated)
                VALUES (@device_type, @vendor, @model, @device_id, @cores_threads, @base_clock_mhz, @memory_mb, CURRENT_TIMESTAMP)
                ON CONFLICT(device_type, model, vendor, device_id) 
                DO UPDATE SET 
                    cores_threads=excluded.cores_threads,
                    base_clock_mhz=excluded.base_clock_mhz,
                    memory_mb=excluded.memory_mb,
                    last_updated=CURRENT_TIMESTAMP
            `);

            cpuStmt.run(cpuEntry);
        }

        // Process each GPU with sanitized strings
        for (const gpu of gpuData.controllers) {
            // Skip Microsoft Basic Display Adapter and similar
            if (gpu.vendor?.includes('Microsoft')) continue;

            const gpuInfo = {
                device_type: 'GPU',
                vendor: sanitizeHardwareString(gpu.vendor || 'Unknown'),
                model: sanitizeHardwareString(gpu.model || 'Unknown'),
                device_id: gpu.deviceId || gpu.busAddress || String(Math.random()), // Use PCI ID or bus address if available
                cores_threads: null,
                base_clock_mhz: null,
                memory_mb: gpu.memoryTotal || null,
            };

            const gpuStmt = db.prepare(`
                INSERT INTO hardware_info 
                (device_type, vendor, model, device_id, memory_mb, last_updated)
                VALUES (@device_type, @vendor, @model, @device_id, @memory_mb, CURRENT_TIMESTAMP)
                ON CONFLICT(device_type, model, vendor, device_id) 
                DO UPDATE SET 
                    memory_mb=excluded.memory_mb,
                    last_updated=CURRENT_TIMESTAMP
            `);

            gpuStmt.run(gpuInfo);
        }

        console.log("Hardware information updated successfully");
    } catch (error) {
        console.error("Error gathering hardware information:", error);
    }
}

// --- FFMPEG Transcoding Test Function ---
async function runFFMPEGTest() {
    // Revert to hardcoded paths with double backslashes for Windows
    const cacheDir = 'Z:\\transcode_cache';
    const inputFilePath = 'Z:\\transcode_cache\\moonriseSample.mkv';
    const outputFilePath = 'Z:\\transcode_cache\\output.mkv';

    console.log(`[FFMPEG Test] Using hardcoded input path: "${inputFilePath}"`);
    console.log(`[FFMPEG Test] Using hardcoded output path: "${outputFilePath}"`);

    try {
        // Create transcode cache directory if it doesn't exist
        try {
            // Use the original cacheDir variable for consistency
            if (!fsSync.existsSync(cacheDir)) {
                console.log(`[FFMPEG Test] Creating transcode cache directory: ${cacheDir}`);
                await fs.mkdir(cacheDir, { recursive: true });
            }
        } catch (dirError) {
            console.error(`[FFMPEG Test] Error creating transcode cache directory: ${dirError}`);
            return;
        }

        // Check if input file exists using the hardcoded path
        if (!fsSync.existsSync(inputFilePath)) {
            console.error(`[FFMPEG Test] Input file not found: ${inputFilePath}`);
            console.error(`[FFMPEG Test] Please place a sample video file at ${inputFilePath} to run the test`);
            return;
        }

        // Get initial file size
        const stats = await fs.stat(inputFilePath);
        const initialSizeMB = stats.size / (1024 * 1024);
        console.log(`[FFMPEG Test] Starting transcoding test...`);
        console.log(`[FFMPEG Test] Input file: ${inputFilePath}`);
        console.log(`[FFMPEG Test] Initial file size: ${initialSizeMB.toFixed(2)} MB`);

        // Create a promise to handle the ffmpeg process
        return new Promise((resolve, reject) => {
            try {
                /*
                // --- TEMPORARY: Inspect Input File Streams ---
                console.log(`[FFMPEG Inspect] Running: ffmpeg -i "${inputFilePath}"`);
                
                const commandString = `"${ffmpegStatic}" -i "${inputFilePath}"`;
                
                exec(commandString, (error, stdout, stderr) => {
                    console.log('[FFMPEG Inspect] --- STDOUT ---');
                    console.log(stdout);
                    console.log('[FFMPEG Inspect] --- STDERR ---');
                    console.error(stderr); // ffmpeg info often goes to stderr
                    
                    if (error) {
                        console.error(`[FFMPEG Inspect] Error executing ffmpeg -i: ${error.message}`);
                        reject(error);
                        return;
                    }
                    
                    console.log('[FFMPEG Inspect] Inspection complete. Please check logs for stream info.');
                    console.log('[FFMPEG Inspect] Re-enable transcoding logic after inspection.');
                    resolve(true); // Resolve promise after inspection
                });
                // --- END TEMPORARY INSPECTION ---
                */

                // --- ORIGINAL TRANSCODING LOGIC (Now Active) ---
                // Create a new ffmpeg command
                const command = ffmpeg();

                // Add input file using the hardcoded string path (with double backslashes)
                command.input(inputFilePath);

                // Add input options
                command.inputOption('-hwaccel auto');

                // Add output options - including stream mapping
                command.outputOptions([
                    // --- Stream Mapping ---
                    '-map 0:v:0',                   // Map video stream 0
                    '-map 0:a:1',                   // Map audio stream index 1 (second audio track)
                    '-map 0:s:m:language:eng?',     // Map English subtitle stream (optional)

                    // --- Codecs for Mapped Streams ---
                    // Video (Output Stream 0)
                    '-c:v hevc_qsv',
                    '-preset:v faster',
                    '-global_quality:v 28',
                    '-look_ahead 1',
                    '-pix_fmt p010le',

                    // Audio (Output Stream 1 - the mapped audio track 1)
                    '-c:a libopus',              // Re-encode audio with Opus
                    '-b:a 128k',              // Set Opus bitrate
                    '-af pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE', // Custom pan/downmix filter

                    // Subtitles (Output Stream 2 - the mapped English subs)
                    '-c:s copy',

                    // --- General Options ---
                    '-hide_banner',
                    '-v verbose',
                    '-y'
                ]);

                // Set output file using the hardcoded string path (with double backslashes)
                command.output(outputFilePath);

                // Add event handlers
                command.on('start', (commandLine: string) => {
                    console.log(`[FFMPEG Test] Command: ${commandLine}`);
                });

                command.on('progress', (progress: { percent?: number }) => {
                    console.log(`[FFMPEG Test] Processing: ${progress.percent ? progress.percent.toFixed(1) : '0'}% done`);
                });

                command.on('stderr', (stderrLine: string) => {
                    console.log(`[FFMPEG Test] stderr: ${stderrLine}`);
                });

                command.on('error', (err: any) => {
                    console.error(`[FFMPEG Test] Error: ${err.message}`);
                    console.error(err);
                    reject(err);
                });

                command.on('end', async () => {
                    try {
                        // Get final file size
                        const finalStats = await fs.stat(outputFilePath);
                        const finalSizeMB = finalStats.size / (1024 * 1024);
                        const reductionPercent = ((1 - (finalStats.size / stats.size)) * 100).toFixed(2);

                        console.log(`[FFMPEG Test] Transcoding complete!`);
                        console.log(`[FFMPEG Test] Initial file size: ${initialSizeMB.toFixed(2)} MB`);
                        console.log(`[FFMPEG Test] Final file size: ${finalSizeMB.toFixed(2)} MB`);
                        console.log(`[FFMPEG Test] Size reduction: ${reductionPercent}%`);
                        resolve(true);
                    } catch (error) {
                        console.error(`[FFMPEG Test] Error getting final file stats: ${error}`);
                        reject(error);
                    }
                });

                // Start the ffmpeg process
                console.log(`[FFMPEG Test] Running ffmpeg...`);
                command.run();
                 // --- END ORIGINAL TRANSCODING LOGIC ---
                 
            } catch (err) {
                console.error(`[FFMPEG Test] Error setting up ffmpeg command: ${err}`);
                reject(err);
            }
        });
    } catch (error) {
        console.error(`[FFMPEG Test] Error in FFMPEG test: ${error}`);
    }
}
// --- End FFMPEG Transcoding Test Function ---

app.on("ready", async () => {
    // Capture console logs as early as possible
    captureConsoleLogs();

    // Validate dialog API is available
    if (!dialog || typeof dialog.showMessageBox !== 'function') {
        console.error("dialog API is not properly initialized!");
    } else {
        console.log("dialog API is available and properly initialized");
    }

    const mainWindow = new BrowserWindow({
        // Shouldn't add contextIsolate or nodeIntegration because of security vulnerabilities
        width: 1450,
        height: 750,
        webPreferences: {
            preload: getPreloadPath(),
        }
    });

    // Set the main window instance in the logger
    setMainWindow(mainWindow);

    // --- Create Encoding Log Directory ---
    const logDir = path.join(app.getPath('userData'), 'encoding_logs');
    try {
        await fs.mkdir(logDir, { recursive: true });
        console.log(`[Main Process] Encoding logs directory ensured: ${logDir}`);
    } catch (dirError) {
        console.error(`[Main Process] Failed to create encoding log directory ${logDir}:`, dirError);
    }
    // --- End Create Log Directory ---

    // --- Initialize Database ---
    let dbPath: string | undefined;
    try {
        dbPath = path.join(app.getPath('userData'), 'media_database.db');
        console.log(`Attempting to initialize database at: ${dbPath}`);
        db = new Database(dbPath, { verbose: console.log });

        // Create media table if it doesn't exist
        db.exec(`
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                filePath TEXT UNIQUE NOT NULL,
                addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                originalSize INTEGER NOT NULL,          -- Size when first discovered (immutable)
                currentSize INTEGER NOT NULL,           -- Size as of latest scan
                lastSizeCheckAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When currentSize was last updated
                videoCodec TEXT,
                audioCodec TEXT,
                libraryName TEXT,
                libraryType TEXT CHECK( libraryType IN ('TV','Movies','Anime') ),
                resolutionWidth INTEGER,   -- Add resolution width
                resolutionHeight INTEGER,  -- Add resolution height
                audioChannels INTEGER,     -- Add audio channel count
                -- Placeholders for future encoding features
                encodingJobId TEXT,
                encodingNodeId TEXT,
                -- Ensure filePath is unique
                UNIQUE(filePath)
            );
        `);

        // Create workflow related tables
        db.exec(`
            -- Main workflow table
            CREATE TABLE IF NOT EXISTS workflows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                last_triggered_at DATETIME,
                UNIQUE(name)
            );

            -- Workflow nodes table
            CREATE TABLE IF NOT EXISTS workflow_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                node_id TEXT NOT NULL,          -- ReactFlow node ID
                node_type TEXT NOT NULL,        -- 'trigger' or 'action'
                label TEXT NOT NULL,
                description TEXT,
                position_x REAL NOT NULL,
                position_y REAL NOT NULL,
                data JSON,                      -- Store additional node data as JSON
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
                UNIQUE(workflow_id, node_id)
            );

            -- Workflow edges table
            CREATE TABLE IF NOT EXISTS workflow_edges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                edge_id TEXT NOT NULL,          -- ReactFlow edge ID
                source_node_id TEXT NOT NULL,   -- Source node ID
                target_node_id TEXT NOT NULL,   -- Target node ID
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
                UNIQUE(workflow_id, edge_id)
            );

            -- Workflow execution history
            CREATE TABLE IF NOT EXISTS workflow_executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                status TEXT CHECK( status IN ('running', 'completed', 'failed', 'cancelled') ),
                error_message TEXT,
                trigger_node_id TEXT NOT NULL,
                execution_data JSON,            -- Store execution context/variables
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            );
        `);

        // Create triggers to update workflows.updated_at
        db.exec(`
            CREATE TRIGGER IF NOT EXISTS update_workflow_timestamp 
            AFTER UPDATE ON workflows
            BEGIN
                UPDATE workflows 
                SET updated_at = CURRENT_TIMESTAMP 
                WHERE id = NEW.id;
            END;
        `);

        // Create hardware_info table
        db.exec(`
            CREATE TABLE IF NOT EXISTS hardware_info (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_type TEXT NOT NULL CHECK(device_type IN ('CPU', 'GPU')),
                vendor TEXT,
                model TEXT NOT NULL,
                device_id TEXT,                  -- Unique identifier for the device (e.g., CPU socket ID or GPU PCI ID)
                cores_threads INTEGER,           -- For CPUs: physical_cores * threads_per_core
                base_clock_mhz REAL,            -- Base clock speed in MHz
                memory_mb INTEGER,              -- For GPUs: VRAM in MB, For CPUs: Cache size in MB
                is_enabled BOOLEAN DEFAULT 1,    -- Whether this device should be used for transcoding
                priority INTEGER DEFAULT 0,      -- Higher number = higher priority
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(device_type, model, vendor, device_id) -- Unique combination including device_id
            );
        `);

        // Create encoding_presets table
        db.exec(`
            CREATE TABLE IF NOT EXISTS encoding_presets (
                id TEXT PRIMARY KEY, 
                name TEXT NOT NULL UNIQUE,
                videoCodec TEXT,
                videoPreset TEXT,
                videoQuality INTEGER,
                videoResolution TEXT,
                hwAccel TEXT,
                audioCodecConvert TEXT,
                audioBitrate TEXT,
                selectedAudioLayout TEXT,
                preferredAudioLanguages TEXT, -- Old field, keep for migration
                keepOriginalAudio INTEGER, -- Old field, keep for migration
                defaultAudioLanguage TEXT, -- Old field, keep for migration
                audioLanguageOrder TEXT, -- New field: Stored as JSON string array
                subtitleCodecConvert TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // --- End Initialize Database ---

        // --- Database Migrations ---
        // Define interface for PRAGMA table_info results
        interface TableColumn {
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
        }

        // Migration for `media` table
        console.log("Checking existing columns for 'media' table...");
        const mediaTableInfo = db.prepare('PRAGMA table_info(media)').all() as TableColumn[];
        const mediaColumns = mediaTableInfo.map(col => col.name);
        console.log(`Media table columns: ${mediaColumns.join(', ')}`);

        const mediaMigrations = [];
        if (!mediaColumns.includes('currentSize')) mediaMigrations.push(`ALTER TABLE media ADD COLUMN currentSize INTEGER NOT NULL DEFAULT 0`);
        if (!mediaColumns.includes('lastSizeCheckAt')) mediaMigrations.push(`ALTER TABLE media ADD COLUMN lastSizeCheckAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        if (!mediaColumns.includes('resolutionWidth')) mediaMigrations.push(`ALTER TABLE media ADD COLUMN resolutionWidth INTEGER`);
        if (!mediaColumns.includes('resolutionHeight')) mediaMigrations.push(`ALTER TABLE media ADD COLUMN resolutionHeight INTEGER`);
        if (!mediaColumns.includes('audioChannels')) mediaMigrations.push(`ALTER TABLE media ADD COLUMN audioChannels INTEGER`);

        if (mediaMigrations.length > 0) {
            console.log('Starting database migration transaction for media table...');
            db.transaction((migrations: string[]) => {
                migrations.forEach((migration, index) => {
                    console.log(`Executing media migration ${index + 1}/${migrations.length}: ${migration.trim().substring(0, 100)}...`);
                    db.exec(migration);
                });
                if (!mediaColumns.includes('currentSize')) {
                    console.log("Executing UPDATE to populate 'currentSize' from 'originalSize'...");
                    db.exec(`UPDATE media SET currentSize = COALESCE(originalSize, 0)`);
                }
            })(mediaMigrations);
            console.log('Media table migration transaction committed successfully.');
        } else {
            console.log('No database migrations needed for media table.');
        }

        // Migration for `encoding_presets` table
        console.log("Checking existing columns for 'encoding_presets' table...");
        try {
            const presetsTableInfo = db.prepare('PRAGMA table_info(encoding_presets)').all() as TableColumn[];
            const presetsColumns = presetsTableInfo.map(col => col.name);
            console.log(`Encoding_presets table columns: ${presetsColumns.join(', ')}`);

            const presetMigrations = [];
            // Keep old column migrations for robustness if needed
            if (!presetsColumns.includes('preferredAudioLanguages')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN preferredAudioLanguages TEXT`);
            if (!presetsColumns.includes('keepOriginalAudio')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN keepOriginalAudio INTEGER`);
            if (!presetsColumns.includes('defaultAudioLanguage')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN defaultAudioLanguage TEXT`);
            // Add migration for the new column
            if (!presetsColumns.includes('audioLanguageOrder')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN audioLanguageOrder TEXT`);
            // Add migrations for the new subtitle order columns
            if (!presetsColumns.includes('subtitleLanguageOrder')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN subtitleLanguageOrder TEXT`);
            if (!presetsColumns.includes('subtitleTypeOrder')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN subtitleTypeOrder TEXT`);

            if (presetMigrations.length > 0) {
                console.log('Starting database migration transaction for encoding_presets table...');
                db.transaction((migrations: string[]) => {
                    migrations.forEach((migration, index) => {
                        console.log(`Executing preset migration ${index + 1}/${migrations.length}: ${migration.trim().substring(0, 100)}...`);
                        db.exec(migration);
                    });
                })(presetMigrations);
                console.log('Encoding_presets table migration transaction committed successfully.');
            } else {
                console.log('No database migrations needed for encoding_presets table.');
            }
        } catch (error) {
            // Handle case where encoding_presets table might not exist yet (e.g., very first run)
            if (error instanceof Error && error.message.includes('no such table: encoding_presets')) {
                console.log('Encoding_presets table does not exist yet, skipping migration check (will be created by CREATE TABLE).');
            } else {
                console.error('Error checking/migrating encoding_presets table:', error);
                throw error; // Re-throw other errors
            }
        }
        // --- End Database Migrations ---

        // Create FTS table and triggers as before
        db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS media_fts USING fts5(
                title,
                filePath,
                content='media',
                content_rowid='id'
            );
        `);
         // Trigger to keep FTS table in sync with media table
         // Update triggers if newly added columns should be indexed by FTS
         db.exec(`
            CREATE TRIGGER IF NOT EXISTS media_ai AFTER INSERT ON media BEGIN
                INSERT INTO media_fts (rowid, title, filePath) VALUES (new.rowid, new.title, new.filePath);
            END;
        `);
        db.exec(`
            CREATE TRIGGER IF NOT EXISTS media_ad AFTER DELETE ON media BEGIN
                DELETE FROM media_fts WHERE rowid=old.rowid;
            END;
        `);
        db.exec(`
            CREATE TRIGGER IF NOT EXISTS media_au AFTER UPDATE ON media BEGIN
                UPDATE media_fts SET title=new.title, filePath=new.filePath WHERE rowid=old.rowid;
            END;
        `);
         console.log("FTS5 table and triggers checked/created.");

    } catch (err) {
        console.error(`Failed to initialize database at path: ${dbPath || 'Unknown'}:`, err);
        // Handle error appropriately - maybe show an error dialog to the user
        // For now, we'll let the app continue but DB functionality will be broken
    }
    // --- End Initialize Database ---

    // --- Start File Watcher ---
    const initialFolders = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
    startWatching(initialFolders);
    // --- End Start File Watcher ---

    if (isDev()) mainWindow.loadURL("http://localhost:3524")
    else mainWindow.loadFile(getUIPath());

    pollResources(mainWindow);
    pollSystemStats(mainWindow); // Start polling system stats

    ipcMain.handle("getStaticData", () => {
        return getStaticData();
    })

    // --- Database Query Handler ---
    ipcMain.handle('db-query', async (_event, sql: string, params: any[] = []) => {
        if (!db) {
            console.error("Database not initialized. Cannot execute query.");
            throw new Error("Database not available.");
        }
        try {
            // Basic security: Check if the query is a SELECT statement for 'all'/'get'
            // More robust validation might be needed depending on requirements
            const command = sql.trim().split(' ')[0].toUpperCase();
            const stmt = db.prepare(sql);

            if (command === 'SELECT') {
                return params.length > 0 ? stmt.all(params) : stmt.all();
            } else if (['INSERT', 'UPDATE', 'DELETE'].includes(command)) {
                const info = params.length > 0 ? stmt.run(params) : stmt.run();
                return info; // Contains changes, lastInsertRowid etc.
            } else {
                console.warn(`Unsupported SQL command attempted: ${command}`);
                throw new Error(`Unsupported SQL command: ${command}`);
            }
        } catch (error) {
            console.error(`Error executing SQL: ${sql}`, params, error);
            throw error; // Re-throw the error to be caught by the renderer
        }
    });
    // --- End Database Query Handler ---

    // --- Watched Folder Management Handlers ---
    ipcMain.handle('get-watched-folders', async (): Promise<WatchedFolder[]> => {
        return store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
    });

    ipcMain.handle('add-watched-folder', async (_event, folderInfo: Omit<WatchedFolder, 'path'>): Promise<WatchedFolder | null> => {
        if (!mainWindow) throw new Error("Main window not available");
        const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
        if (result.canceled || result.filePaths.length === 0) return null;

        const folderPath = result.filePaths[0];
        const currentFolders = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
        if (currentFolders.some(f => f.path === folderPath)) {
             throw new Error(`Folder already being watched: ${folderPath}`);
        }

        const newFolder: WatchedFolder = { path: folderPath, ...folderInfo };
        currentFolders.push(newFolder);
        store.set(WATCHED_FOLDERS_KEY, currentFolders);
        watchPath(folderPath);
        console.log(`Added watched folder: ${JSON.stringify(newFolder)}`);
        return newFolder;
    });

    ipcMain.handle('remove-watched-folder', async (_event, folderPath: string): Promise<void> => {
        const currentFolders = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
        const updatedFolders = currentFolders.filter(f => f.path !== folderPath);
        if (currentFolders.length === updatedFolders.length) {
             console.warn(`Attempted to remove non-existent watched folder: ${folderPath}`);
             return; 
        }
        store.set(WATCHED_FOLDERS_KEY, updatedFolders);
        unwatchPath(folderPath);
        console.log(`Removed watched folder: ${folderPath}`);
    });
    // --- End Watched Folder Management Handlers ---

    // --- Use standard ipcMain.handle ---
    ipcMain.handle("getAvailableGpus", async (): Promise<GpuInfo[]> => {
        try {
            const gpus = await si.graphics();
            // Filter out potential RDP adapter from selection if desired
            return gpus.controllers
                .filter(gpu => !gpu.vendor?.includes('Microsoft')) // Example filter
                .map(gpu => ({ 
                    vendor: gpu.vendor ?? 'Unknown', 
                    model: gpu.model ?? 'Unknown', 
                    memoryTotal: gpu.memoryTotal ?? null // Include detected VRAM
                }));
        } catch (error) {
            console.error("Error fetching available GPUs:", error);
            return [];
        }
    });

    ipcMain.handle("getSelectedGpu", async (): Promise<string | null> => {
        return store.get(SELECTED_GPU_KEY, null) as string | null;
    });

    ipcMain.handle("setSelectedGpu", async (_event: Electron.IpcMainInvokeEvent, model: string | null): Promise<void> => {
        // console.log("Setting selected GPU to:", model); // Comment out confirmation log
        if (model === null || model === 'default') {
            store.delete(SELECTED_GPU_KEY);
        } else {
            store.set(SELECTED_GPU_KEY, model);
        }
    });

    // Added handlers for PowerShell GPU monitoring toggle
    ipcMain.handle("getPsGpuMonitoringEnabled", async (): Promise<boolean> => {
        return store.get(ENABLE_PS_GPU_KEY, false) as boolean;
    });

    ipcMain.handle("setPsGpuMonitoringEnabled", async (_event: Electron.IpcMainInvokeEvent, isEnabled: boolean): Promise<void> => {
        store.set(ENABLE_PS_GPU_KEY, isEnabled);
    });

    // --- Added Handlers for Manual VRAM Override ---
    ipcMain.handle("get-manual-gpu-vram", async (): Promise<number | null> => {
        return store.get(MANUAL_GPU_VRAM_MB_KEY, null) as number | null;
    });

    ipcMain.handle("set-manual-gpu-vram", async (_event: Electron.IpcMainInvokeEvent, vramMb: number | null): Promise<void> => {
        if (vramMb === null || typeof vramMb !== 'number' || vramMb <= 0) {
            store.delete(MANUAL_GPU_VRAM_MB_KEY);
            console.log("Cleared manual GPU VRAM override.");
        } else {
            store.set(MANUAL_GPU_VRAM_MB_KEY, vramMb);
            console.log(`Set manual GPU VRAM override to: ${vramMb} MB`);
        }
    });
    // --- End IPC Handlers ---

    // --- Added Scanner Trigger Handler ---
    ipcMain.handle('trigger-scan', async () => {
        await scanMediaFolders(mainWindow);
        return { status: 'Manual scan triggered' };
    });

    // Add handler for scanning a single folder
    ipcMain.handle('trigger-folder-scan', async (_event, folderPath: string) => {
        await scanSingleFolder(folderPath, mainWindow);
        return { status: 'Single folder scan triggered' };
    });
    // --- End Scanner Trigger Handler ---

    // Gather hardware info on startup
    gatherAndStoreHardwareInfo();

    // Add new IPC handlers for hardware info
    ipcMain.handle('get-hardware-info', async () => {
        if (!db) throw new Error("Database not initialized");
        const stmt = db.prepare('SELECT * FROM hardware_info ORDER BY device_type, priority DESC');
        return stmt.all();
    });

    ipcMain.handle('update-hardware-priority', async (_event, deviceId: number, priority: number) => {
        if (!db) throw new Error("Database not initialized");
        const stmt = db.prepare('UPDATE hardware_info SET priority = ? WHERE id = ?');
        return stmt.run(priority, deviceId);
    });

    ipcMain.handle('update-hardware-enabled', async (_event, deviceId: number, isEnabled: boolean) => {
        if (!db) throw new Error("Database not initialized");
        const stmt = db.prepare('UPDATE hardware_info SET is_enabled = ? WHERE id = ?');
        return stmt.run(isEnabled, deviceId);
    });

    ipcMain.handle('refresh-hardware-info', async () => {
        await gatherAndStoreHardwareInfo();
        const stmt = db.prepare('SELECT * FROM hardware_info ORDER BY device_type, priority DESC');
        return stmt.all();
    });

    // --- Workflow Management Handlers ---

    ipcMain.handle('get-workflows', async (): Promise<Workflow[]> => {
        if (!db) throw new Error("Database not initialized");
        try {
            const stmt = db.prepare('SELECT id, name, description FROM workflows ORDER BY name');
            return stmt.all() as Workflow[];
        } catch (error) {
            console.error("Error fetching workflows:", error);
            throw error;
        }
    });

    ipcMain.handle('get-workflow-details', async (_event, workflowId: number): Promise<WorkflowDetails | null> => {
        if (!db) throw new Error("Database not initialized");
        try {
            const workflowStmt = db.prepare('SELECT id, name, description FROM workflows WHERE id = ?');
            const workflow = workflowStmt.get(workflowId) as Workflow | undefined;
            if (!workflow) return null;

            const nodesStmt = db.prepare('SELECT node_id as id, node_type as type, position_x, position_y, data FROM workflow_nodes WHERE workflow_id = ?');
            // Add explicit type for the result of nodesStmt.all()
            const nodesData = nodesStmt.all(workflowId) as { id: string; type: string; position_x: number; position_y: number; data: string | null }[];
            const nodes = nodesData.map(n => ({
                id: n.id,
                type: n.type,
                position: { x: n.position_x, y: n.position_y },
                data: n.data ? JSON.parse(n.data) : {} // Ensure data is parsed
            }));

            const edgesStmt = db.prepare('SELECT edge_id as id, source_node_id as source, target_node_id as target FROM workflow_edges WHERE workflow_id = ?');
            // Add explicit type for the result of edgesStmt.all()
            const edgesData = edgesStmt.all(workflowId) as { id: string; source: string; target: string }[];

            return {
                ...workflow,
                nodes: nodes as Node[], // Assert type after mapping
                edges: edgesData as Edge[], // Use the typed data
            };
        } catch (error) {
            console.error(`Error fetching details for workflow ${workflowId}:`, error);
            throw error;
        }
    });

    ipcMain.handle('save-workflow', async (_event, workflowData: { id?: number; name: string; description: string; nodes: Node[]; edges: Edge[] }): Promise<number> => {
        if (!db) throw new Error("Database not initialized");
        const { id, name, description, nodes, edges } = workflowData;

        // Use a transaction for atomicity
        const transaction = db.transaction(() => {
            let workflowId: number;

            if (id) { // Update existing workflow
                workflowId = id;
                const updateWorkflowStmt = db.prepare(`
                    UPDATE workflows 
                    SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `);
                updateWorkflowStmt.run(name, description, workflowId);

                // Clear existing nodes and edges for simplicity, then re-insert
                db.prepare('DELETE FROM workflow_nodes WHERE workflow_id = ?').run(workflowId);
                db.prepare('DELETE FROM workflow_edges WHERE workflow_id = ?').run(workflowId);
            } else { // Insert new workflow
                const insertWorkflowStmt = db.prepare('INSERT INTO workflows (name, description) VALUES (?, ?)');
                const info = insertWorkflowStmt.run(name, description);
                workflowId = Number(info.lastInsertRowid); // Get the new ID
            }

            // Insert nodes
            const insertNodeStmt = db.prepare(`
                INSERT INTO workflow_nodes (workflow_id, node_id, node_type, label, description, position_x, position_y, data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            nodes.forEach(node => {
                insertNodeStmt.run(
                    workflowId,
                    node.id,
                    node.type || 'default', // Ensure type is provided
                    node.data?.label || 'Unknown',
                    node.data?.description || '',
                    node.position.x,
                    node.position.y,
                    JSON.stringify(node.data || {}) // Store data as JSON string
                );
            });

            // Insert edges
            const insertEdgeStmt = db.prepare(`
                INSERT INTO workflow_edges (workflow_id, edge_id, source_node_id, target_node_id)
                VALUES (?, ?, ?, ?)
            `);
            edges.forEach(edge => {
                insertEdgeStmt.run(
                    workflowId,
                    edge.id,
                    edge.source,
                    edge.target
                );
            });

            return workflowId; // Return the ID of the saved/updated workflow
        });

        try {
            const savedWorkflowId = transaction();
            console.log(`Workflow ${id ? 'updated' : 'saved'} with ID: ${savedWorkflowId}`);
            return savedWorkflowId;
        } catch (error) {
            console.error(`Error saving workflow (ID: ${id}):`, error);
            throw error;
        }
    });

    ipcMain.handle('delete-workflow', async (_event, workflowId: number): Promise<{ changes: number }> => {
        if (!db) throw new Error("Database not initialized");
        try {
            // Due to CASCADE DELETE, deleting from workflows will also delete related nodes and edges
            const stmt = db.prepare('DELETE FROM workflows WHERE id = ?');
            const info = stmt.run(workflowId);
            console.log(`Deleted workflow ID: ${workflowId}, changes: ${info.changes}`);
            return { changes: info.changes };
        } catch (error) {
            console.error(`Error deleting workflow ${workflowId}:`, error);
            throw error;
        }
    });
    // --- End Workflow Management Handlers ---

    // --- FFprobe Handler ---
    ipcMain.handle('probe-file', async (_event, filePath: string) => {
        if (!filePath) {
            console.warn("Probe request received without a file path.");
            return null;
        }
        console.log(`[Main Process] Received probe request for: ${filePath}`);
        try {
            // Ensure the file exists before probing
            await fs.access(filePath, fs.constants.R_OK);
            const probeData = await probeFile(filePath); // Use existing probeFile function
            console.log(`[Main Process] Probe successful for: ${filePath}`);
            console.log("[Main Process] Full ffprobe result:", JSON.stringify(probeData, null, 2));
            return probeData;
        } catch (error) {
            console.error(`[Main Process] Error probing file ${filePath}:`, error);
            // Return null or throw an error that the renderer can catch
            // Returning null might be safer for the UI
            return null; 
        }
    });

    // --- Encoding Handlers ---
    // Add handlers for file dialogs
    ipcMain.handle('dialog:showOpen', async (_event, options) => {
        if (!mainWindow) {
            throw new Error('Main window not available');
        }
        // Ensure options are passed correctly
        return dialog.showOpenDialog(mainWindow, options);
    });

    ipcMain.handle('dialog:showSave', async (_event, options) => {
        if (!mainWindow) {
            throw new Error('Main window not available');
        }
        // Ensure options are passed correctly
        return dialog.showSaveDialog(mainWindow, options);
    });

    // Add the new handler that accepts options
    ipcMain.handle('start-encoding-process', async (event, options: EncodingOptions) => {
        console.log(`[Main Process] Encoding request received for: ${options.inputPath} → ${options.outputPath}`);
        console.log(`[Main Process] Options:`, options);
        
        try {
            // Probe the file to get info and check if it was already processed
            const probeData = await probeFile(options.inputPath);
            
            // Note: We don't need to show a dialog here because the UI component in ManualEncode.tsx
            // already shows a dialog for already processed files before initiating this IPC call.
            // Just log the status for tracking
            if (probeData?.processedByRecodarr?.processed) {
                console.log(`[Main Process] File has already been processed by Recodarr: ${options.inputPath}`);
                console.log(`[Main Process] Previously encoded: ${probeData.processedByRecodarr.date || 'Unknown'}`);
                console.log(`[Main Process] Video codec: ${probeData.processedByRecodarr.videoCodec || 'Unknown'}`);
                console.log(`[Main Process] Audio codec: ${probeData.processedByRecodarr.audioCodec || 'Unknown'}`);
                // Since the UI is handling the dialog, we just continue with encoding here
            } else {
                console.log(`[Main Process] File has not been processed before or no processing metadata found`);
            }

            const jobId = crypto.randomUUID(); // Generate Job ID
            console.log(`[Main Process] Generated Job ID: ${jobId}`);

            // Rest of the encoding process...
            const isOverwrite = options.overwriteInput ?? (options.inputPath === options.outputPath);
            console.log(`[Main Process] Overwrite mode determined: ${isOverwrite}`);

            // Find the part where encoding progress is forwarded to the renderer
            const progressCallback = (progress: EncodingProgress) => {
                try {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('encodingProgress', { ...progress, jobId }); // Include jobId in progress updates
                    }
                } catch (error) {
                    console.error(`[Encoding Progress] Error sending progress update:`, error);
                }
            };

            // Merge received options with the progress callback, overwrite flag, jobId, and log path
            const optionsWithCallback: EncodingOptions = {
                ...options,
                overwriteInput: isOverwrite, // Pass the determined flag
                progressCallback: progressCallback,
                jobId: jobId, // Pass jobId
                logDirectoryPath: logDir // Pass log directory path
            };

            console.log('[Main Process] Calling startEncodingProcess with options:', JSON.stringify(optionsWithCallback, null, 2));

            // Call the actual encoding function from ffmpegUtils
            const result = await startEncodingProcess(optionsWithCallback);

            console.log('[Main Process] Encoding process finished with result:', result);

            // Prepare the result object to send back to UI, always include jobId
            let finalResult: any = { ...result, jobId: jobId }; // Ensure jobId is always returned

            // --- Post-Encoding Update (Conditional) --- 
            if (result.success && result.outputPath) {
                try {
                    console.log(`[Main Process] Encoding/Rename successful for Job ID ${jobId}. Final path: ${result.outputPath}`);
                    const probeData = await probeFile(result.outputPath); // Probe the final file
                    
                    if (probeData) {
                        if (isOverwrite) {
                            console.log(`[Main Process] Overwrite mode: Updating database record for original input path: ${options.inputPath}`);
                            // Pass original input path for DB update when overwriting
                            await updateMediaAfterEncoding(probeData, jobId, options.inputPath);
                            console.log(`[Main Process] Database updated successfully for Job ID ${jobId}.`);
                            mainWindow?.webContents.send('encodingProgress', {
                                jobId,
                                status: `Overwrite complete! Reduction: ${result.reductionPercent?.toFixed(1) ?? 'N/A'}%. DB Updated. File: ${result.outputPath}`
                            });
                        } else {
                            // Saved as new file, don't update original DB record
                            console.log(`[Main Process] Save As New mode: Database record for original file not updated. New file at: ${result.outputPath}`);
                            mainWindow?.webContents.send('encodingProgress', {
                                jobId,
                                status: `Save As New complete! Reduction: ${result.reductionPercent?.toFixed(1) ?? 'N/A'}%. File: ${result.outputPath}`
                            });
                        }
                    } else {
                        console.warn(`[Main Process] Probe failed for final file ${result.outputPath}. Database not updated.`);
                        mainWindow?.webContents.send('encodingProgress', {
                            jobId,
                            status: `Encoding complete but probe failed. Output: ${result.outputPath}`
                        });
                    }
                } catch (updateError) {
                    console.error(`[Main Process] Error during post-encoding probe/update for Job ID ${jobId}:`, updateError);
                    mainWindow?.webContents.send('encodingProgress', {
                        jobId,
                        status: isOverwrite 
                            ? `Overwrite complete but DB update failed. File: ${result.outputPath}`
                            : `Save As New complete but post-encode step failed. File: ${result.outputPath}`
                    });
                }
            } else if (!result.success) {
                // Send failure status update
                mainWindow?.webContents.send('encodingProgress', {
                    jobId,
                    status: `Encoding failed: ${result.error}`
                });
            }
            // --- End Post-Encoding Update --- 

            return finalResult; // Return the result including the jobId
        } catch (error) {
            console.error('[Main Process] Error in start-encoding-process:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });

    // --- Add New Handler for Reading Logs ---
    ipcMain.handle('get-encoding-log', async (_event, jobId: string): Promise<string | null> => {
        if (!jobId) {
            console.warn("[get-encoding-log] Received request without a Job ID.");
            return null;
        }
        const logFilePath = path.join(logDir, `${jobId}.log`);
        console.log(`[get-encoding-log] Attempting to read log file: ${logFilePath}`);
        try {
            // Ensure file exists before reading
            await fs.access(logFilePath, fs.constants.R_OK);
            const logContent = await fs.readFile(logFilePath, 'utf-8');
            console.log(`[get-encoding-log] Successfully read log file for Job ID: ${jobId}`);
            return logContent;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.error(`[get-encoding-log] Log file not found for Job ID ${jobId} at path: ${logFilePath}`);
                return `Log file not found for Job ID: ${jobId}`;
            }
            console.error(`[get-encoding-log] Error reading log file ${logFilePath}:`, error);
            return `Error reading log file for Job ID ${jobId}: ${error.message}`;
        }
    });
    // --- End New Handler ---

    // Helper function to update media DB after encoding
    async function updateMediaAfterEncoding(probeData: any, jobId: string, targetDbFilePath: string): Promise<void> {
        if (!db) {
            console.error("Database not initialized, cannot update media after encoding.");
            return;
        }
        // We use targetDbFilePath (original input path in overwrite mode) for WHERE clause,
        // but probeData still contains info about the *newly created* file (size, codecs).
        if (!probeData?.format) { // Check format object exists
            console.warn("Skipping DB update after encoding due to missing format info in probe data.");
            return;
        }

        const fileSize = probeData.format.size ? parseInt(probeData.format.size, 10) : null;

        let videoCodec: string | null = null;
        let audioCodec: string | null = null;
        let resolutionWidth: number | null = null;
        let resolutionHeight: number | null = null;
        let audioChannels: number | null = null;

        if (probeData.streams && Array.isArray(probeData.streams)) {
            const videoStream = probeData.streams.find((s: any) => s.codec_type === 'video');
            const audioStream = probeData.streams.find((s: any) => s.codec_type === 'audio');
            videoCodec = videoStream?.codec_name ?? null;
            audioCodec = audioStream?.codec_name ?? null;
            resolutionWidth = videoStream?.width ?? null;
            resolutionHeight = videoStream?.height ?? null;
            audioChannels = audioStream?.channels ?? null;
        }
                
        console.log(`[DB Update] Attempting to update media for file path in DB: ${targetDbFilePath} with Job ID: ${jobId}`);
        console.log(`[DB Update] New Data: Size=${fileSize}, VideoCodec=${videoCodec}, AudioCodec=${audioCodec}, Resolution=${resolutionWidth}x${resolutionHeight}, Channels=${audioChannels}`);

        // Use a specific UPDATE statement targeting the targetDbFilePath
        const updateSql = `
            UPDATE media 
            SET currentSize = ?, 
                videoCodec = ?, 
                audioCodec = ?, 
                resolutionWidth = ?, 
                resolutionHeight = ?, 
                audioChannels = ?, 
                encodingJobId = ?, 
                lastSizeCheckAt = CURRENT_TIMESTAMP 
            WHERE filePath = ?
        `;
        try {
            const updateStmt = db.prepare(updateSql);
            // Use new data from probeData, but use targetDbFilePath for the WHERE condition
            const info = updateStmt.run(fileSize, videoCodec, audioCodec, resolutionWidth, resolutionHeight, audioChannels, jobId, targetDbFilePath);

            if (info.changes > 0) {
                console.log(`[DB Update] Successfully updated media record for ${targetDbFilePath} (Job ID: ${jobId}). Changes: ${info.changes}`);
            } else {
                console.warn(`[DB Update] No media record found or updated for filePath: ${targetDbFilePath}. Original file might not be in library.`);
            }
        } catch (error) {
            console.error(`[DB Update] Error updating media record for ${targetDbFilePath} (Job ID: ${jobId}):`, error);
            throw error; // Re-throw to be caught by the caller
        }
    }

    // Keep the old subscription handlers (can be removed if subscribeEncodingProgress in preload is robust)
    let encodingProgressEventSender: Electron.IpcMainEvent['sender'] | null = null;
    ipcMain.on('subscribeEncodingProgress', (event) => {
        console.log('[Main Process] Renderer subscribed via ipcMain.on.');
        encodingProgressEventSender = event.sender; // Store sender
    });

    ipcMain.on('unsubscribeEncodingProgress', () => {
        console.log('[Main Process] Renderer unsubscribed via ipcMain.on.');
        encodingProgressEventSender = null;
    });
    // --- End Encoding Handlers ---

    // Add new handler for getting initial logs
    ipcMain.handle('get-initial-logs', async () => {
        return getLogBuffer();
    });

    // Add handler for custom confirmation dialog
    ipcMain.handle('show-confirmation-dialog', async (_event, options) => {
        console.log(`[Main Process] Received request to show confirmation dialog:`, options);
        
        try {
            if (!mainWindow || mainWindow.isDestroyed()) {
                console.error('[Main Process] Cannot show dialog - main window not available');
                return { confirmed: false, error: 'Main window not available' };
            }
            
            // Default options if not provided
            const dialogOpts = {
                type: 'question',
                buttons: ['Cancel', 'Confirm'],
                defaultId: 0,
                title: options.title || 'Confirmation',
                message: options.message || 'Please confirm this action',
                detail: options.detail || '',
                ...options
            };
            
            console.log(`[Main Process] Showing confirmation dialog`);
            const result = await dialog.showMessageBox(mainWindow, dialogOpts);
            console.log(`[Main Process] Dialog result:`, result);
            
            // User confirmed if they clicked the second button (index 1)
            return { 
                confirmed: result.response === 1,
                response: result.response
            };
        } catch (error) {
            console.error(`[Main Process] Error showing confirmation dialog:`, error);
            return { confirmed: false, error: String(error) };
        }
    });

    // --- Encoding Preset Handlers ---
    ipcMain.handle('get-presets', async () => {
        if (!db) throw new Error("Database not initialized");
        try {
            const stmt = db.prepare('SELECT * FROM encoding_presets ORDER BY name');
            const presets = stmt.all();
            
            // Process the results to handle serialized data and backward compatibility
            return presets.map((preset: any) => {
                const result = { ...preset };

                // Deserialize or construct audioLanguageOrder
                if (typeof result.audioLanguageOrder === 'string') {
                    try {
                        result.audioLanguageOrder = JSON.parse(result.audioLanguageOrder);
                    } catch (e) {
                        console.error(`Error parsing audioLanguageOrder for preset ${preset.id}:`, e);
                        result.audioLanguageOrder = null; // Fallback on error
                    }
                } else if (result.audioLanguageOrder === null || result.audioLanguageOrder === undefined) {
                    // Backward compatibility: Construct order from old fields if new field is missing
                    console.warn(`Preset ${preset.id} missing audioLanguageOrder, attempting fallback from old fields.`);
                    let order: string[] = [];
                    const preferredLangs = typeof preset.preferredAudioLanguages === 'string' ? JSON.parse(preset.preferredAudioLanguages || '[]') : (preset.preferredAudioLanguages || []);
                    const keepOriginal = Boolean(preset.keepOriginalAudio ?? true); // Default true
                    const defaultLang = preset.defaultAudioLanguage || 'original';

                    if (defaultLang !== 'original' && preferredLangs.includes(defaultLang)) {
                        order.push(defaultLang);
                    }
                    if (keepOriginal) {
                        order.push('original');
                    }
                    preferredLangs.forEach((lang: string) => {
                        if (!order.includes(lang)) {
                            order.push(lang);
                        }
                    });
                    // Ensure 'original' is present if keepOriginal was true but wasn't the default
                    if (keepOriginal && defaultLang !== 'original' && !order.includes('original')){
                        order.push('original');
                    }
                    // Remove duplicates just in case
                    result.audioLanguageOrder = [...new Set(order)];
                    console.log(`Constructed fallback order for ${preset.id}:`, result.audioLanguageOrder);
                }

                // Deserialize subtitleLanguageOrder
                if (typeof result.subtitleLanguageOrder === 'string') {
                    try {
                        result.subtitleLanguageOrder = JSON.parse(result.subtitleLanguageOrder);
                    } catch (e) {
                        console.error(`Error parsing subtitleLanguageOrder for preset ${preset.id}:`, e);
                        result.subtitleLanguageOrder = null; // Fallback on error
                    }
                } else if (result.subtitleLanguageOrder === null || result.subtitleLanguageOrder === undefined) {
                    // Default to empty array for new installations
                    result.subtitleLanguageOrder = [];
                }

                // Deserialize subtitleTypeOrder
                if (typeof result.subtitleTypeOrder === 'string') {
                    try {
                        result.subtitleTypeOrder = JSON.parse(result.subtitleTypeOrder);
                    } catch (e) {
                        console.error(`Error parsing subtitleTypeOrder for preset ${preset.id}:`, e);
                        result.subtitleTypeOrder = null; // Fallback on error
                    }
                } else if (result.subtitleTypeOrder === null || result.subtitleTypeOrder === undefined) {
                    // Default to empty array for new installations
                    result.subtitleTypeOrder = [];
                }

                // Clean up old fields from the result sent to UI
                delete result.preferredAudioLanguages;
                delete result.keepOriginalAudio;
                delete result.defaultAudioLanguage;
                
                return result;
            });
        } catch (error) {
            console.error("Error fetching encoding presets:", error);
            throw error;
        }
    });

    ipcMain.handle('save-preset', async (_event, preset: any) => {
        if (!db) throw new Error("Database not initialized");
        // Destructure known fields, including the new ones
        const { id, name, audioLanguageOrder, subtitleLanguageOrder, subtitleTypeOrder, ...settings } = preset;
        console.log(`Received save request for preset ID: ${id}, Name: ${name}`);

        // Process settings for storage
        const processedSettings = { ...settings };
        
        // Serialize array fields to JSON strings
        let serializedAudioOrder: string | null = null;
        let serializedSubtitleLangOrder: string | null = null;
        let serializedSubtitleTypeOrder: string | null = null;
        
        // Serialize the audioLanguageOrder field
        if (Array.isArray(audioLanguageOrder)) {
            serializedAudioOrder = JSON.stringify(audioLanguageOrder);
        } else if (audioLanguageOrder === undefined || audioLanguageOrder === null) {
            serializedAudioOrder = null; // Explicitly null if missing or null
        }
        
        // Serialize the subtitleLanguageOrder field
        if (Array.isArray(subtitleLanguageOrder)) {
            serializedSubtitleLangOrder = JSON.stringify(subtitleLanguageOrder);
        } else if (subtitleLanguageOrder === undefined || subtitleLanguageOrder === null) {
            serializedSubtitleLangOrder = null;
        }
        
        // Serialize the subtitleTypeOrder field
        if (Array.isArray(subtitleTypeOrder)) {
            serializedSubtitleTypeOrder = JSON.stringify(subtitleTypeOrder);
        } else if (subtitleTypeOrder === undefined || subtitleTypeOrder === null) {
            serializedSubtitleTypeOrder = null;
        }
        
        // Remove potentially interfering old audio fields from settings if they exist
        delete processedSettings.preferredAudioLanguages;
        delete processedSettings.keepOriginalAudio;
        delete processedSettings.defaultAudioLanguage;
        
        // Ensure other optional fields are null if undefined before saving
        Object.keys(processedSettings).forEach(key => {
            if (processedSettings[key] === undefined) {
                processedSettings[key] = null;
            }
        });

        try {
            const existingPreset = db.prepare('SELECT id FROM encoding_presets WHERE id = ?').get(id) as { id: string } | undefined;

            if (existingPreset) {
                 console.log(`Updating existing preset ID: ${id}`);
                const updateFields = Object.keys(processedSettings);
                // Add all serialized fields explicitly
                const setClauses = [
                    'audioLanguageOrder = @audioLanguageOrder',
                    'subtitleLanguageOrder = @subtitleLanguageOrder',
                    'subtitleTypeOrder = @subtitleTypeOrder',
                    ...updateFields.map(key => `${key} = @${key}`)
                ].join(', ');
                const sql = `UPDATE encoding_presets SET name = @name, ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`;
                const stmt = db.prepare(sql);
                // Include all serialized fields in params
                const params = { 
                    id, 
                    name, 
                    audioLanguageOrder: serializedAudioOrder,
                    subtitleLanguageOrder: serializedSubtitleLangOrder,
                    subtitleTypeOrder: serializedSubtitleTypeOrder,
                    ...processedSettings 
                };
                console.log("Update Params:", params);
                const info = stmt.run(params);
                console.log(`Update result: Changes=${info.changes}`);
                // Return the original preset structure received from UI
                return { id, name, audioLanguageOrder, subtitleLanguageOrder, subtitleTypeOrder, ...settings }; 
            } else {
                 console.log(`Inserting new preset with ID: ${id}, Name: ${name}`);
                const insertFields = Object.keys(processedSettings).filter(key => processedSettings[key] !== null);
                
                // Add serialized fields explicitly if they're not null
                const columns = [
                    'id', 
                    'name', 
                    ...(serializedAudioOrder !== null ? ['audioLanguageOrder'] : []),
                    ...(serializedSubtitleLangOrder !== null ? ['subtitleLanguageOrder'] : []),
                    ...(serializedSubtitleTypeOrder !== null ? ['subtitleTypeOrder'] : []),
                    ...insertFields
                ];
                
                const placeholders = columns.map(key => `@${key}`).join(', ');
                const sql = `INSERT INTO encoding_presets (${columns.join(', ')}) VALUES (${placeholders})`;
                const stmt = db.prepare(sql);
                
                // Define params with a more flexible type signature
                const params: { [key: string]: any } = { id, name };
                
                if (serializedAudioOrder !== null) params['audioLanguageOrder'] = serializedAudioOrder;
                if (serializedSubtitleLangOrder !== null) params['subtitleLanguageOrder'] = serializedSubtitleLangOrder;
                if (serializedSubtitleTypeOrder !== null) params['subtitleTypeOrder'] = serializedSubtitleTypeOrder;
                
                insertFields.forEach(key => params[key] = processedSettings[key]);
                console.log("Insert Params:", params);
                
                const info = stmt.run(params);
                console.log(`Insert result: Changes=${info.changes}, LastInsertRowid=${info.lastInsertRowid}`);
                
                // Return the original preset structure received from UI
                return { id, name, audioLanguageOrder, subtitleLanguageOrder, subtitleTypeOrder, ...settings };
            }
        } catch (error) {
            console.error(`Error saving preset (ID: ${id}, Name: ${name}):`, error);
             if (error instanceof Error && error.message.includes('UNIQUE constraint failed: encoding_presets.name')) {
                 throw new Error(`Preset name "${name}" already exists. Please choose a different name.`);
             }
            throw error;
        }
    });

    ipcMain.handle('delete-preset', async (_event, id: string) => {
        if (!db) throw new Error("Database not initialized");
        try {
            const stmt = db.prepare('DELETE FROM encoding_presets WHERE id = ?');
            const info = stmt.run(id);
            console.log(`Deleted preset ID: ${id}, Changes: ${info.changes}`);
            return info; // Return info about deletion (e.g., info.changes)
        } catch (error) {
            console.error(`Error deleting preset ${id}:`, error);
            throw error;
        }
    });
    // --- End Encoding Preset Handlers ---
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  // Always quit the app when all windows are closed, even on macOS
  // This ensures the npm run dev process also terminates
  app.quit()
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  // For simplicity, we won't re-create the window here, but you could add
  // the window creation logic from the 'ready' event if needed.
  // if (BrowserWindow.getAllWindows().length === 0) {
  //   createWindow() // Assuming createWindow is extracted from 'ready'
  // }
})

// Optional: Close the database connection gracefully on quit
app.on('will-quit', () => {
    // Stop all polling/interval functions
    stopWatching();
    
    // Clear system stats timer
    if (systemStatsTimer) {
        clearInterval(systemStatsTimer);
        systemStatsTimer = null;
    }
    
    // Stop resource polling from test.js
    stopPolling();
    
    // Close database
    if (db) {
        console.log("Closing database connection.");
        db.close();
    }
});

// Keep track of system stats timer
let systemStatsTimer: NodeJS.Timeout | null = null;
