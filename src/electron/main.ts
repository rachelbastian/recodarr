import { app, BrowserWindow, ipcMain, dialog } from "electron"
import { isDev } from "./util.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";
import { getStaticData, pollResources } from "./test.js";
import si from 'systeminformation';
import Store from 'electron-store';
import { exec, execFile } from 'child_process';
import { Buffer } from 'buffer';
import path from 'path';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import ffprobeStatic from 'ffprobe-static';
import * as chokidar from 'chokidar';

// Initialize electron-store
const store = new Store();
const SELECTED_GPU_KEY = 'selectedGpuModel';
const ENABLE_PS_GPU_KEY = 'enablePsGpuMonitoring'; // Key for the toggle
const WATCHED_FOLDERS_KEY = 'watchedFolders'; // Added key for watched folders

// --- Define Watched Folder Type ---
interface WatchedFolder {
    path: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
}
// --- End Define Watched Folder Type ---

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
        ignored: /(^|[\\\/])\../, // ignore dotfiles
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
    const ffprobePath = ffprobeStatic.path;
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
                console.error(`ffprobe error for ${filePath}:`, error.message);
                // Don't reject, just return null if ffprobe fails
                return resolve(null); 
            }
            if (stderr) {
                // Usually contains warnings, can be ignored unless debugging
                // console.warn(`ffprobe stderr for ${filePath}:`, stderr);
            }
            try {
                const probeData = JSON.parse(stdout);
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

    if (probeData.streams && Array.isArray(probeData.streams)) {
        const videoStream = probeData.streams.find((s: any) => s.codec_type === 'video');
        const audioStream = probeData.streams.find((s: any) => s.codec_type === 'audio');
        videoCodec = videoStream?.codec_name ?? null;
        audioCodec = audioStream?.codec_name ?? null;
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
                    audioCodec = ?
                WHERE id = ?
            `;
            const updateStmt = db.prepare(updateSql);
            updateStmt.run(fileSize, videoCodec, audioCodec, existingFile.id);
            console.log(`Updated size for existing file: ${title}`);
        } else {
            // Insert new file with both originalSize and currentSize set to the current size
            const insertSql = `
                INSERT INTO media (
                    title, filePath, originalSize, currentSize,
                    videoCodec, audioCodec, libraryName, libraryType
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
                libraryType
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
                if (SUPPORTED_EXTENSIONS.includes(ext)) {
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

// --- End Media Scanner Functions ---

// Updated function to use PowerShell's -EncodedCommand
function runPsCommand(command: string): Promise<string> {
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

        // Check if PowerShell GPU monitoring is enabled for GPU *Load*
        const psGpuEnabled = store.get(ENABLE_PS_GPU_KEY, false) as boolean;

        let gpuLoadPs: number | null = null;
        // Removed gpuMemoryUsedPsMb as we'll get used memory from SI

        // Only run PS commands for GPU Load if enabled
        if (psGpuEnabled) {
            // Define PS command for GPU Utilisation
            const gpuUtilCommand = `(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage').CounterSamples | Where-Object {$_.CookedValue -ne $null} | Measure-Object -Sum CookedValue | Select-Object -ExpandProperty Sum`;
            // Removed gpuMemUsedCommand

            try {
                // Fetch only GPU Utilisation via PS
                const gpuUtilOutput = await runPsCommand(gpuUtilCommand);
                gpuLoadPs = gpuUtilOutput ? parseFloat(gpuUtilOutput) : null;
            } catch (psCounterError) {
                console.error("Error executing PowerShell Get-Counter command for GPU Util:", psCounterError);
                // Ensure load value is null if PS fails even when enabled
                gpuLoadPs = null;
            }
        }

        // Fetch GPU Memory (Used and Total) via systeminformation
        let gpuMemoryTotalSiMb: number | null = null;
        let gpuMemoryUsedSiMb: number | null = null; // Added variable for used memory from SI

        try {
            const gpuData = await si.graphics();
            const preferredGpuModel = store.get(SELECTED_GPU_KEY) as string | null;
            const targetGpu = findGpu(gpuData.controllers, preferredGpuModel); // Assumes findGpu selects the correct controller
            
            if (targetGpu) {
                 // Use memoryTotal and memoryUsed if available, otherwise fallback to vram
                 // Note: systeminformation types might not list vramUsed, but it can exist on some platforms.
                 // We'll cast to 'any' to attempt access, falling back to null if not present.
                 gpuMemoryTotalSiMb = targetGpu.memoryTotal ?? targetGpu.vram ?? null;
                 gpuMemoryUsedSiMb = targetGpu.memoryUsed ?? (targetGpu as any).vramUsed ?? null;
            } else {
                 console.warn("Could not find target GPU for memory stats.");
            }

        } catch (siError) {
             console.error("Error fetching GPU graphics info via systeminformation:", siError);
        }

        return {
            cpuLoad: cpuData.currentLoad,
            memLoad: (memData.active / memData.total) * 100,
            gpuLoad: gpuLoadPs,                // Still sourced from PS if enabled
            gpuMemoryUsed: gpuMemoryUsedSiMb,  // Now sourced from systeminformation
            gpuMemoryTotal: gpuMemoryTotalSiMb, // Sourced from systeminformation
        };
    } catch (e: unknown) {
        console.error("Error fetching system stats:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            cpuLoad: null,
            memLoad: null,
            gpuLoad: null,
            gpuMemoryUsed: null,
            gpuMemoryTotal: null,
            error: errorMessage
        };
    }
}

// Added function to poll system stats and send to renderer
function pollSystemStats(window: BrowserWindow) {
    setInterval(async () => {
        const stats = await getSystemStats();
        if (window && !window.isDestroyed()) {
            window.webContents.send("system-stats-update", stats);
        }
    }, 2000); // Poll every 2 seconds
}

app.on("ready", () => {
    const mainWindow = new BrowserWindow({
        // Shouldn't add contextIsolate or nodeIntegration because of security vulnerabilities
        webPreferences: {
            preload: getPreloadPath(),
        }
    });

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
                -- Placeholders for future encoding features
                encodingJobId TEXT,
                encodingNodeId TEXT,
                -- Ensure filePath is unique
                UNIQUE(filePath)
            );
        `);

        // Migration: Add new columns if they don't exist
        // We need to check each column separately as SQLite doesn't support ADD COLUMN IF NOT EXISTS
        interface TableColumn {
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
        }
        
        console.log("Checking existing columns for 'media' table...");
        const tableInfo = db.prepare('PRAGMA table_info(media)').all() as TableColumn[];
        const columns = tableInfo.map(col => col.name);
        console.log(`Found columns: ${columns.join(', ')}`);

        const migrations = [];
        
        if (!columns.includes('currentSize')) {
            migrations.push(`
                ALTER TABLE media 
                ADD COLUMN currentSize INTEGER NOT NULL 
                DEFAULT 0 
            `);
        }

        if (!columns.includes('lastSizeCheckAt')) {
            migrations.push(`
                ALTER TABLE media 
                ADD COLUMN lastSizeCheckAt DATETIME NOT NULL 
                DEFAULT CURRENT_TIMESTAMP
            `);
        }

        // Execute migrations in a transaction
        if (migrations.length > 0) {
            console.log('Starting database migration transaction...');
            db.exec('BEGIN TRANSACTION;');
            try {
                migrations.forEach((migration, index) => {
                    console.log(`Executing migration ${index + 1}/${migrations.length}: ${migration.trim().substring(0, 100)}...`);
                    db.exec(migration);
                });
                // If the currentSize column was just added in this transaction,
                // populate it from originalSize for all existing rows.
                if (!columns.includes('currentSize')) {
                    console.log("Executing UPDATE to populate 'currentSize' from 'originalSize'...");
                    const updateInfo = db.exec(`
                        UPDATE media SET currentSize = COALESCE(originalSize, 0)
                    `);
                    console.log(`'currentSize' update executed.`); // Rows affected might not be easily available with db.exec
                }
                db.exec('COMMIT;');
                console.log('Database migration transaction committed successfully.');
            } catch (error) {
                db.exec('ROLLBACK;');
                console.error('Error during database migration, transaction rolled back:', error);
                throw error; // Re-throw to prevent using partially migrated DB
            }
        } else {
            console.log('No database migrations needed.');
        }

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
                .map(gpu => ({ vendor: gpu.vendor ?? 'Unknown', model: gpu.model ?? 'Unknown' }));
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
    // --- End IPC Handlers ---

    // --- Added Scanner Trigger Handler ---
    ipcMain.handle('trigger-scan', async () => {
        await scanMediaFolders(mainWindow);
        return { status: 'Manual scan triggered' };
    });
    // --- End Scanner Trigger Handler ---
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
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
    stopWatching();
    if (db) {
        console.log("Closing database connection.");
        db.close();
    }
});
