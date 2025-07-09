import { BrowserWindow } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { probeFile } from './ffprobeUtils.js';

// Media file extensions we support
export const SUPPORTED_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'];

// Define Watched Folder Type
export interface WatchedFolder {
    path: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
}

/**
 * Adds or updates media information in the database
 * @param db The database instance
 * @param probeData FFprobe data for the media file
 * @param libraryName Name of the library the file belongs to
 * @param libraryType Type of the library (TV, Movies, Anime)
 */
export async function addMediaToDb(
    db: Database.Database, 
    probeData: any, 
    libraryName: string, 
    libraryType: WatchedFolder['libraryType']
): Promise<void> {
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

    // --- NEW LOGIC TO CHECK FOR OUR METADATA TAG ---
    let determinedEncodingJobId: string | null = null;
    if (probeData.format.tags && probeData.format.tags.PROCESSED_BY === 'Recodarr') {
        determinedEncodingJobId = 'APP_ENCODED_TAG'; // This will mark it as "Processed"
        console.log(`[Scanner] File ${filePath} contains PROCESSED_BY Recodarr tag. Setting encodingJobId.`);
    }
    // --- END OF NEW LOGIC ---

    try {
        // First check if the file already exists in the database
        const existingFile = db.prepare('SELECT id, originalSize, encodingJobId FROM media WHERE filePath = ?').get(filePath) as { id: number; originalSize: number; encodingJobId: string | null } | undefined;

        if (existingFile) {
            // Update currentSize, lastSizeCheckAt, and potentially encodingJobId for existing file
            const updateSql = `
                UPDATE media 
                SET currentSize = ?, 
                    lastSizeCheckAt = CURRENT_TIMESTAMP,
                    videoCodec = ?,
                    audioCodec = ?,
                    resolutionWidth = ?,
                    resolutionHeight = ?,
                    audioChannels = ?,
                    encodingJobId = ? 
                WHERE id = ?
            `;
            const updateStmt = db.prepare(updateSql);
            // Only update encodingJobId if it's newly determined or if the existing one is null
            const finalEncodingJobId = determinedEncodingJobId ?? existingFile.encodingJobId;
            updateStmt.run(fileSize, videoCodec, audioCodec, resolutionWidth, resolutionHeight, audioChannels, finalEncodingJobId, existingFile.id);
            console.log(`Updated existing file: ${title} - encodingJobId set to: ${finalEncodingJobId}`);
        } else {
            // Insert new file with both originalSize and currentSize set to the current size
            const insertSql = `
                INSERT INTO media (
                    title, filePath, originalSize, currentSize,
                    videoCodec, audioCodec, libraryName, libraryType,
                    resolutionWidth, resolutionHeight, audioChannels, encodingJobId
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                audioChannels,
                determinedEncodingJobId // Use the determined value here
            );
            if (info.changes > 0) {
                console.log(`Added to DB: ${title} (${libraryName})`);
            }
        }
    } catch (error) {
        console.error(`Error adding/updating media in DB (${filePath}):`, error);
    }
}

/**
 * Recursively processes a directory to find and add media files to the database
 * @param db The database instance
 * @param directoryPath Path to directory to scan
 * @param libraryName Name of the library the directory belongs to
 * @param libraryType Type of the library (TV, Movies, Anime)
 * @param window Optional BrowserWindow to send progress updates to
 */
export async function processDirectory(
    db: Database.Database,
    directoryPath: string, 
    libraryName: string, 
    libraryType: WatchedFolder['libraryType'], 
    window: BrowserWindow | null
): Promise<void> {
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
                await processDirectory(db, fullPath, libraryName, libraryType, window);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                // Skip temp files and process only supported video extensions
                if (SUPPORTED_EXTENSIONS.includes(ext) && !entry.name.includes('_tmp')) {
                    const probeData = await probeFile(fullPath);
                    if (probeData) {
                        await addMediaToDb(db, probeData, libraryName, libraryType);
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

/**
 * Scans all watched media folders and adds/updates files in the database
 * @param db The database instance
 * @param window BrowserWindow to send updates to
 * @param foldersToScan Array of folders to scan
 * @param isScanning Reference to a scanning state flag
 */
export async function scanMediaFolders(
    db: Database.Database,
    window: BrowserWindow | null, 
    foldersToScan: WatchedFolder[],
    isScanning: { value: boolean }
): Promise<void> {
    if (isScanning.value) {
        console.warn("Scan already in progress. Ignoring trigger.");
        return;
    }
    isScanning.value = true;
    console.log("Starting media scan...");
    if (window && !window.isDestroyed()) {
        window.webContents.send("scan-status-update", { status: 'running', message: 'Starting scan...' });
    }

    console.log(`Found ${foldersToScan.length} folders to scan.`);

    for (const folder of foldersToScan) {
        console.log(`Processing library: ${folder.libraryName} (${folder.libraryType}) at ${folder.path}`);
        await processDirectory(db, folder.path, folder.libraryName, folder.libraryType, window);
    }

    console.log("Media scan finished.");
    isScanning.value = false;
    if (window && !window.isDestroyed()) {
        window.webContents.send("scan-status-update", { status: 'finished', message: 'Scan complete.' });
    }
}

/**
 * Scans a single folder and adds/updates files in the database
 * @param db The database instance
 * @param folderPath Path to the folder to scan
 * @param window BrowserWindow to send updates to
 * @param foldersToScan Array of all watched folders
 * @param isScanning Reference to a scanning state flag
 */
export async function scanSingleFolder(
    db: Database.Database,
    folderPath: string, 
    window: BrowserWindow | null,
    foldersToScan: WatchedFolder[],
    isScanning: { value: boolean }
): Promise<void> {
    if (isScanning.value) {
        console.warn("Scan already in progress. Ignoring trigger.");
        return;
    }
    
    isScanning.value = true;
    console.log(`Starting scan for specific folder: ${folderPath}`);
    
    if (window && !window.isDestroyed()) {
        window.webContents.send("scan-status-update", { 
            status: 'running', 
            message: `Starting scan for folder: ${path.basename(folderPath)}...` 
        });
    }

    const folderToScan = foldersToScan.find(folder => folder.path === folderPath);
    
    if (!folderToScan) {
        console.warn(`Folder ${folderPath} not found in watched folders`);
        isScanning.value = false;
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
        await processDirectory(db, folderToScan.path, folderToScan.libraryName, folderToScan.libraryType, window);
        
        console.log(`Scan complete for folder: ${folderPath}`);
        isScanning.value = false;
        if (window && !window.isDestroyed()) {
            window.webContents.send("scan-status-update", { 
                status: 'finished', 
                message: `Scan complete for ${folderToScan.libraryName}.` 
            });
        }
    } catch (error) {
        console.error(`Error scanning folder ${folderPath}:`, error);
        isScanning.value = false;
        if (window && !window.isDestroyed()) {
            window.webContents.send("scan-status-update", { 
                status: 'error', 
                message: `Error scanning folder: ${error instanceof Error ? error.message : String(error)}` 
            });
        }
    }
} 