import { app, BrowserWindow, ipcMain, dialog } from "electron"
import { isDev } from "./util.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";
import { getStaticData, pollResources } from "./test.js";
import si from 'systeminformation';
import Store from 'electron-store';
import { exec } from 'child_process';
import { Buffer } from 'buffer';
import path from 'path';
import Database from 'better-sqlite3';

// Initialize electron-store
const store = new Store();
const SELECTED_GPU_KEY = 'selectedGpuModel';
const ENABLE_PS_GPU_KEY = 'enablePsGpuMonitoring'; // Key for the toggle
const WATCHED_FOLDERS_KEY = 'watchedFolders'; // Added key for watched folders

// --- Define Watched Folder Type --- Added
interface WatchedFolder {
    path: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
}
// --- End Define Watched Folder Type ---

// --- Database Setup ---
let db: Database.Database;
// --- End Database Setup ---

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
            const preferredGpuModel = store.get(SELECTED_GPU_KEY) as string | null;
            const targetGpu = findGpu(gpuData.controllers, preferredGpuModel);
            gpuMemoryTotalSiMb = targetGpu?.memoryTotal ?? null;
        } catch (siError) {
             console.error("Error fetching GPU graphics info via systeminformation:", siError);
        }

        return {
            cpuLoad: cpuData.currentLoad,
            memLoad: (memData.active / memData.total) * 100,
            gpuLoad: gpuLoadPs,             // Null if PS monitoring is disabled or fails
            gpuMemoryUsed: gpuMemoryUsedPsMb, // Null if PS monitoring is disabled or fails
            gpuMemoryTotal: gpuMemoryTotalSiMb,
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
    try {
        const dbPath = path.join(app.getPath('userData'), 'media_database.db');
        console.log(`Initializing database at: ${dbPath}`);
        db = new Database(dbPath, { verbose: console.log });

        // Create media table if it doesn't exist
        db.exec(`
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                filePath TEXT UNIQUE NOT NULL,
                addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                originalSize INTEGER,          -- Renamed from 'size'
                videoCodec TEXT,
                audioCodec TEXT,
                libraryName TEXT,
                libraryType TEXT CHECK( libraryType IN ('TV','Movies','Anime') ), -- Added CHECK constraint
                -- Placeholders for future encoding features
                newSize INTEGER,
                encodingJobId TEXT,
                encodingNodeId TEXT,
                -- Ensure filePath is unique
                UNIQUE(filePath)
            );
        `);
        console.log("Database initialized and media table checked/created.");

        // Example: Add FTS5 virtual table for full-text search (optional but recommended)
        // Update FTS table definition if needed based on searchable fields
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
        console.error("Failed to initialize database:", err);
        // Handle error appropriately - maybe show an error dialog to the user
        // For now, we'll let the app continue but DB functionality will be broken
    }
    // --- End Initialize Database ---

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

    // --- Watched Folder Management Handlers --- Added Section
    ipcMain.handle('get-watched-folders', async (): Promise<WatchedFolder[]> => {
        return store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
    });

    ipcMain.handle('add-watched-folder', async (_event, folderInfo: Omit<WatchedFolder, 'path'>): Promise<WatchedFolder | null> => {
        if (!mainWindow) throw new Error("Main window not available");

        // Open dialog to select folder
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null; // User cancelled
        }

        const folderPath = result.filePaths[0];
        const currentFolders = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];

        // Check if folder path already exists
        if (currentFolders.some(f => f.path === folderPath)) {
            console.warn(`Attempted to add duplicate watched folder: ${folderPath}`);
            // Optionally throw an error or return a specific indicator
            throw new Error(`Folder already being watched: ${folderPath}`);
        }

        const newFolder: WatchedFolder = {
            path: folderPath,
            libraryName: folderInfo.libraryName,
            libraryType: folderInfo.libraryType
        };

        currentFolders.push(newFolder);
        store.set(WATCHED_FOLDERS_KEY, currentFolders);
        console.log(`Added watched folder: ${JSON.stringify(newFolder)}`);
        return newFolder;
    });

    ipcMain.handle('remove-watched-folder', async (_event, folderPath: string): Promise<void> => {
        const currentFolders = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
        const updatedFolders = currentFolders.filter(f => f.path !== folderPath);

        if (currentFolders.length === updatedFolders.length) {
            console.warn(`Attempted to remove non-existent watched folder: ${folderPath}`);
            // Optionally throw an error
            return; 
        }

        store.set(WATCHED_FOLDERS_KEY, updatedFolders);
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
    if (db) {
        console.log("Closing database connection.");
        db.close();
    }
});
