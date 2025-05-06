import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent, clipboard, systemPreferences, nativeTheme, shell, Tray, Menu } from 'electron';
import { isDev } from "./util.js";
import { getPreloadPath, getUIPath, getIconPath, getSplashPath } from "./pathResolver.js";
import { getStaticData, pollResources, stopPolling } from "./test.js";
import si from 'systeminformation';
import Store from 'electron-store';
import { exec, execFile } from 'child_process';
import { Buffer } from 'buffer';
import path from 'path';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import fsSync from 'fs';
import * as chokidar from 'chokidar';
import { Node, Edge } from 'reactflow';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { startEncodingProcess } from './ffmpegUtils.js';
import { probeFile } from './ffprobeUtils.js';
import { SUPPORTED_EXTENSIONS, WatchedFolder, addMediaToDb, processDirectory, scanMediaFolders, scanSingleFolder } from './scannerUtils.js';
import crypto from 'crypto';
import { setMainWindow, captureConsoleLogs, getLogBuffer } from './logger.js'; // Import logger functions
import { getPresets, savePreset, deletePreset, initializePresetTable } from './presetDatabase.js';
import { FileWatcher } from './fileWatcherUtils.js';
import TaskScheduler from './schedulerUtils.js';

// --- Define Types Locally within main.ts ---
// (Copied from src/types.d.ts)
interface GpuInfo { vendor: string; model: string; memoryTotal: number | null }; // Keep needed simple types
interface SystemStats { cpuLoad: number | null; memLoad: number | null; gpuLoad: number | null; gpuMemoryUsed: number | null; gpuMemoryTotal: number | null; gpuMemoryUsagePercent: number | null; error?: string };

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


// --- Database Setup ---
let db: Database.Database;
// --- End Database Setup ---

// --- Media Scanner & Watcher Constants & State ---
let isScanning = false;
let fileWatcher: FileWatcher | null = null;
let splashScreen: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null; // Add tray instance
let taskScheduler: TaskScheduler | null = null; // Add task scheduler instance
const APP_STARTUP_TIMEOUT = 30000; // 30 seconds max wait time for app to load
// --- End Media Scanner & Watcher Constants & State ---

// --- System Tray Setup Function ---
function setupTray() {
    if (process.platform !== 'win32') return; // Only for Windows
    
    // Create the tray icon
    tray = new Tray(getIconPath());
    tray.setToolTip('Recodarr');
    
    // Create the context menu
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Open Recodarr', 
            click: () => {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.show();
                    mainWindow.focus();
                }
            } 
        },
        { type: 'separator' },
        { 
            label: 'Restart App', 
            click: () => {
                app.relaunch();
                app.exit();
            } 
        },
        { type: 'separator' },
        { 
            label: 'Exit', 
            click: () => {
                app.quit();
            } 
        }
    ]);
    
    // Set the context menu
    tray.setContextMenu(contextMenu);
    
    // Optional: Add click behavior (single click opens app)
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
    
    console.log('[Main Process] System tray icon created');
}
// --- End System Tray Setup ---

// --- File System Watcher Functions ---
function startWatching(folders: WatchedFolder[]) {
    if (!fileWatcher) {
        console.log("[Main Process] Creating new FileWatcher instance");
        fileWatcher = new FileWatcher(db, mainWindow);
    }
    
    // Keep splash screen visible for a few seconds
    const SPLASH_SCREEN_DURATION = 3000; // 3 seconds
    console.log(`[Main Process] Splash screen will be visible for ${SPLASH_SCREEN_DURATION/1000} seconds`);
    
    setTimeout(() => {
        // Close splash screen after the delay
        closeSplashScreen();
    }, SPLASH_SCREEN_DURATION);
    
    // Initialize the watcher in the background
    fileWatcher.startWatching(folders)
        .then(() => {
            console.log("[Main Process] FileWatcher initialized and ready");
        })
        .catch(error => {
            console.error("[Main Process] Error initializing FileWatcher:", error);
        });
}

// Function to close splash screen and show main window
function closeSplashScreen() {
    if (splashScreen && !splashScreen.isDestroyed()) {
        console.log("Closing splash screen and showing main window...");
        
        // Make main window visible
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Show the main window
            mainWindow.show();
            
            // Bring it to the front
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        }
        
        // Close the splash screen
        splashScreen.close();
        splashScreen = null;
    }
}

function stopWatching() {
    if (fileWatcher) {
        console.log("Closing file watcher.");
        fileWatcher.stopWatching();
        fileWatcher = null;
    }
}

function watchPath(folderPath: string) {
    if (fileWatcher) {
        fileWatcher.watchPath(folderPath);
    }
}

function unwatchPath(folderPath: string) {
    if (fileWatcher) {
        fileWatcher.unwatchPath(folderPath);
    }
}
// --- End File System Watcher Functions ---


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


app.on("ready", async () => {
    // Capture console logs as early as possible
    captureConsoleLogs();

    // Validate dialog API is available
    if (!dialog || typeof dialog.showMessageBox !== 'function') {
        console.error("dialog API is not properly initialized!");
    } else {
        console.log("dialog API is available and properly initialized");
    }

    // Create splash screen
    splashScreen = new BrowserWindow({
        width: 400,
        height: 400,
        transparent: false,
        frame: false,
        resizable: false,
        center: true,
        show: true,
        backgroundColor: '#232836', // Medium grey with slight navy tint
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Load splash screen HTML
    console.log(`Loading splash screen from: ${getSplashPath()}`);
    splashScreen.loadFile(getSplashPath());

    // Create main window but don't show it yet
    mainWindow = new BrowserWindow({
        // Shouldn't add contextIsolate or nodeIntegration because of security vulnerabilities
        width: 1450,
        height: 750,
        icon: getIconPath(),
        show: false, // Don't show initially
        backgroundColor: '#232836', // Medium grey with slight navy tint to match theme
        titleBarStyle: 'default',
        titleBarOverlay: process.platform === 'win32' ? {
            color: '#686b76', // Light grey title bar 
            symbolColor: '#ffffff', // White symbols (minimize, maximize, close buttons)
            height: 32 // Standard height for Windows title bar
        } : false,
        webPreferences: {
            preload: getPreloadPath(),
        }
    });

    // Set the main window instance in the logger
    setMainWindow(mainWindow);
    
    // Initialize queue handlers
    // initQueueHandlers(ipcMain, mainWindow); // REMOVED

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

        // Initialize preset table and migrations
        await initializePresetTable(db);

        // --- End Initialize Database ---

        // --- Start File Watcher ---
        const initialFolders = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
        startWatching(initialFolders);
        // --- End Start File Watcher ---

        // Load the main window content
        if (isDev()) mainWindow.loadURL("http://localhost:3524")
        else mainWindow.loadFile(getUIPath());

        // Start other services
        pollResources(mainWindow);
        pollSystemStats(mainWindow); // Start polling system stats

        // Set a timeout in case watcher never gets ready
        setTimeout(() => {
            if (!fileWatcher || !fileWatcher.isReady() && splashScreen && !splashScreen.isDestroyed()) {
                console.log("Timeout reached waiting for watcher. Showing main window...");
                closeSplashScreen();
            }
        }, APP_STARTUP_TIMEOUT);
        
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
            // Create a reference object for isScanning so it can be updated by the scanner functions
            const isScanningRef = { value: isScanning };
            const foldersToScan = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
            
            await scanMediaFolders(db, mainWindow, foldersToScan, isScanningRef);
            // Update the local isScanning variable from the reference
            isScanning = isScanningRef.value;
            
            return { status: 'Manual scan triggered' };
        });

        // Add handler for scanning a single folder
        ipcMain.handle('trigger-folder-scan', async (_event, folderPath: string) => {
            // Create a reference object for isScanning so it can be updated by the scanner functions
            const isScanningRef = { value: isScanning };
            const foldersToScan = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
            
            await scanSingleFolder(db, folderPath, mainWindow, foldersToScan, isScanningRef);
            // Update the local isScanning variable from the reference
            isScanning = isScanningRef.value;
            
            return { status: 'Single folder scan triggered' };
        });
        
        // Add new handler for force rescanning all watched folders
        ipcMain.handle('force-rescan-all', async () => {
            if (fileWatcher) {
                await fileWatcher.forceRescan();
                return { status: 'Force rescan of all watched folders triggered' };
            }
            return { status: 'FileWatcher not available, rescan not triggered' };
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

                // Use the job ID from options if provided, otherwise generate one
                const jobId = options.jobId || crypto.randomUUID(); 
                console.log(`[Main Process] Using Job ID: ${jobId} ${options.jobId ? '(provided in options)' : '(newly generated)'}`);

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
                        console.log(`[Main Process] Encoding successful for Job ID ${jobId}. Temporary output at: ${result.outputPath}`);
                        
                        if (isOverwrite) {
                            console.log(`[Main Process] Overwrite mode: Original file will be replaced through Queue Service's replaceFile`);
                            // Don't try to rename here - let the queue service handle it with its robust replaceFile
                            
                            // Just probe the temporary file
                            const probeData = await probeFile(result.outputPath);
                            if (probeData) {
                                console.log(`[Main Process] Temporary file successfully probed: ${result.outputPath}`);
                                mainWindow?.webContents.send('encodingProgress', {
                                    jobId,
                                    status: `Encoding completed with ${result.reductionPercent?.toFixed(1) ?? 'N/A'}% reduction. File replacement will be handled by queue service.`
                                });
                            } else {
                                console.warn(`[Main Process] Probe failed for temp file ${result.outputPath}. Will still attempt replacement.`);
                            }
                        } else {
                            // Non-overwrite mode (save as new) - we should still probe
                            const probeData = await probeFile(result.outputPath);
                            if (probeData) {
                                console.log(`[Main Process] New file successfully probed: ${result.outputPath}`);
                                mainWindow?.webContents.send('encodingProgress', {
                                    jobId,
                                    status: `Save As New complete! Reduction: ${result.reductionPercent?.toFixed(1) ?? 'N/A'}%. File: ${result.outputPath}`
                                });
                            } else {
                                console.warn(`[Main Process] Probe failed for new file ${result.outputPath}.`);
                            }
                        }
                    } catch (updateError) {
                        console.error(`[Main Process] Error during post-encoding probe for Job ID ${jobId}:`, updateError);
                        mainWindow?.webContents.send('encodingProgress', {
                            jobId,
                            status: `Encoding succeeded but probe failed. Output: ${result.outputPath}`
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
            return getPresets(db);
        });

        ipcMain.handle('save-preset', async (_event, preset: any) => {
            if (!db) throw new Error("Database not initialized");
            return savePreset(db, preset);
        });

        ipcMain.handle('delete-preset', async (_event, id: string) => {
            if (!db) throw new Error("Database not initialized");
            return deletePreset(db, id);
        });
        // --- End Encoding Preset Handlers ---

        // --- Queue Handlers ---
        // Path for storing queue data
        const queueDataPath = path.join(app.getPath('userData'), 'queue.json');

        // Handler to load saved queue data
        ipcMain.handle('load-queue-data', async () => {
            console.log(`[Main Process] Request to load queue data from: ${queueDataPath}`);
            try {
                // Check if the file exists
                try {
                    await fs.access(queueDataPath, fs.constants.R_OK);
                } catch (error) {
                    console.log(`[Main Process] Queue data file not found, returning empty array`);
                    return { jobs: [] };
                }

                // Read and parse the file
                const data = await fs.readFile(queueDataPath, 'utf-8');
                const queueData = JSON.parse(data);
                console.log(`[Main Process] Successfully loaded queue data with ${queueData.jobs?.length || 0} jobs`);
                return queueData;
            } catch (error) {
                console.error(`[Main Process] Error loading queue data:`, error);
                return { jobs: [], error: String(error) };
            }
        });

        // Handler to save queue data
        ipcMain.handle('save-queue-data', async (_event, data) => {
            // Validate data structure
            if (!data || typeof data !== 'object') {
                console.error(`[Main Process] Invalid data provided to save-queue-data: ${data}`);
                return { success: false, error: 'Invalid data structure provided' };
            }
            
            // Ensure jobs array exists, create empty array if missing
            if (!data.jobs || !Array.isArray(data.jobs)) {
                console.warn(`[Main Process] Missing or invalid jobs array in queue data, creating empty array`);
                data.jobs = [];
            }
            
            console.log(`[Main Process] Request to save queue data with ${data.jobs.length || 0} jobs`);
            try {
                // Serialize and save the data
                await fs.writeFile(queueDataPath, JSON.stringify(data, null, 2), 'utf-8');
                console.log(`[Main Process] Successfully saved queue data to: ${queueDataPath}`);
                return { success: true };
            } catch (error) {
                console.error(`[Main Process] Error saving queue data:`, error);
                return { success: false, error: String(error) };
            }
        });

        // Handler to get file size
        ipcMain.handle('get-file-size', async (_event, filePath) => {
            // Add validation for undefined or empty paths
            if (!filePath) {
                console.error(`[Main Process] Invalid file path provided to get-file-size: ${filePath}`);
                return undefined;
            }
            
            console.log(`[Main Process] Request to get file size for: ${filePath}`);
            try {
                // Check if the file exists first
                try {
                    await fs.access(filePath, fs.constants.R_OK);
                } catch (accessError) {
                    console.error(`[Main Process] File does not exist or is not readable: ${filePath}`);
                    return undefined;
                }
                
                const stats = await fs.stat(filePath);
                if (!stats.isFile()) {
                    console.error(`[Main Process] Path exists but is not a file: ${filePath}`);
                    return undefined;
                }
                
                const sizeInBytes = stats.size;
                console.log(`[Main Process] File size for ${filePath}: ${sizeInBytes} bytes`);
                return sizeInBytes;
            } catch (error) {
                console.error(`[Main Process] Error getting file size for ${filePath}:`, error);
                return undefined;
            }
        });

        // Handler to start an encoding job
        ipcMain.handle('start-encoding', async (_event, options) => {
            console.log(`[Main Process] Request to start encoding for: ${options.inputPath}`);
            try {
                // This reuses the existing startEncodingProcess handler
                return await startEncodingProcess(options);
            } catch (error) {
                console.error(`[Main Process] Error starting encoding:`, error);
                return { 
                    success: false, 
                    error: String(error),
                    jobId: options.jobId 
                };
            }
        });

        // Handler to open an encoding log
        ipcMain.handle('open-encoding-log', async (_event, jobId) => {
            console.log(`[Main Process] Request to open encoding log for job: ${jobId}`);
            try {
                const logFilePath = path.join(logDir, `${jobId}.log`);
                
                // Check if file exists
                try {
                    await fs.access(logFilePath, fs.constants.R_OK);
                } catch (error) {
                    console.error(`[Main Process] Log file not found: ${logFilePath}`);
                    return { success: false, error: `Log file not found for job ${jobId}` };
                }
                
                // Open the file with the default text editor
                await shell.openPath(logFilePath);
                console.log(`[Main Process] Successfully opened log file: ${logFilePath}`);
                return { success: true };
            } catch (error) {
                console.error(`[Main Process] Error opening log file:`, error);
                return { success: false, error: String(error) };
            }
        });
        // --- End Queue Handlers ---

        // Setup system tray
        setupTray();

        // --- End IPC Handler Registration ---

        // Add the replaceFile handler
        ipcMain.handle('replace-file', async (_event: IpcMainInvokeEvent, sourcePath: string, destinationPath: string): Promise<boolean> => {
            try {
                console.log(`[Main Process] Replacing file: ${destinationPath} with ${sourcePath}`);
                
                // Verify paths are not empty or the same
                if (!sourcePath || !destinationPath) {
                    console.error(`[Main Process] Invalid paths: source=${sourcePath}, destination=${destinationPath}`);
                    return false;
                }
                
                if (sourcePath === destinationPath) {
                    console.log(`[Main Process] Source and destination are the same, no replacement needed`);
                    return true;
                }
                
                // Check if source file exists and is readable
                try {
                    const sourceStats = await fs.stat(sourcePath);
                    if (!sourceStats.isFile() || sourceStats.size === 0) {
                        console.error(`[Main Process] Source file is not valid: ${sourcePath}, size: ${sourceStats.size}`);
                        return false;
                    }
                    console.log(`[Main Process] Source file verified: ${sourcePath}, size: ${sourceStats.size} bytes`);
                } catch (error) {
                    console.error(`[Main Process] Error accessing source file: ${sourcePath}`, error);
                    return false;
                }
                
                // Create a unique backup path with timestamp
                const timestamp = new Date().getTime();
                const backupPath = `${destinationPath}.backup-${timestamp}`;
                let backupCreated = false;
                
                // Check if destination exists
                if (fsSync.existsSync(destinationPath)) {
                    try {
                        // Create backup with retry logic
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            try {
                                await fs.rename(destinationPath, backupPath);
                                backupCreated = true;
                                console.log(`[Main Process] Created backup of original file at: ${backupPath} (attempt ${attempt})`);
                                break;
                            } catch (backupError) {
                                if (attempt < 3) {
                                    console.log(`[Main Process] Backup attempt ${attempt} failed, retrying in 500ms...`);
                                    // Wait before retry to handle potential file locks
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                } else {
                                    throw backupError;
                                }
                            }
                        }
                    } catch (backupError) {
                        console.error(`[Main Process] Failed to create backup:`, backupError);
                        // Try direct replacement if backup fails
                        console.log(`[Main Process] Attempting direct replacement without backup...`);
                    }
                }
                
                // Replace file with retry logic
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await fs.copyFile(sourcePath, destinationPath);
                        
                        // Verify the copy succeeded by comparing file sizes
                        const sourceSize = (await fs.stat(sourcePath)).size;
                        const destSize = (await fs.stat(destinationPath)).size;
                        
                        if (sourceSize !== destSize) {
                            console.error(`[Main Process] File size mismatch after copy: Source=${sourceSize}, Dest=${destSize}`);
                            if (attempt < 3) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                                continue;
                            }
                            throw new Error(`File size mismatch after copy: Source=${sourceSize}, Dest=${destSize}`);
                        }
                        
                        console.log(`[Main Process] Successfully replaced file (attempt ${attempt})`);
                        
                        // Delete source file after successful copy
                        try {
                            await fs.unlink(sourcePath);
                            console.log(`[Main Process] Removed source file: ${sourcePath}`);
                        } catch (cleanupError) {
                            console.warn(`[Main Process] Could not remove source file, but replacement was successful:`, cleanupError);
                        }
                        
                        // Remove the backup file if it was created and replacement was successful
                        if (backupCreated && fsSync.existsSync(backupPath)) {
                            try {
                                await fs.unlink(backupPath);
                                console.log(`[Main Process] Removed backup file: ${backupPath}`);
                            } catch (cleanupError) {
                                console.warn(`[Main Process] Could not remove backup file:`, cleanupError);
                            }
                        }
                        
                        return true;
                    } catch (copyError) {
                        if (attempt < 3) {
                            console.log(`[Main Process] Replace attempt ${attempt} failed, retrying in 500ms...`, copyError);
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } else {
                            console.error(`[Main Process] All replacement attempts failed:`, copyError);
                            
                            // Restore from backup if it exists and final attempt failed
                            if (backupCreated && fsSync.existsSync(backupPath)) {
                                try {
                                    await fs.rename(backupPath, destinationPath);
                                    console.log(`[Main Process] Restored original file from backup`);
                                } catch (restoreError) {
                                    console.error(`[Main Process] Failed to restore from backup:`, restoreError);
                                }
                            }
                            
                            throw copyError;
                        }
                    }
                }
                
                // This should never be reached due to the logic above
                return false;
            } catch (error) {
                console.error(`[Main Process] Fatal error in replaceFile:`, error);
                return false;
            }
        });

        // Add handler for deleting files
        ipcMain.handle('delete-file', async (_event: IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
            try {
                console.log(`[Main Process] Deleting file: ${filePath}`);
                
                // Check if file exists before attempting to delete
                if (fsSync.existsSync(filePath)) {
                    await fs.unlink(filePath);
                    console.log(`[Main Process] Successfully deleted file: ${filePath}`);
                    return true;
                } else {
                    console.log(`[Main Process] File does not exist, skipping deletion: ${filePath}`);
                    return false;
                }
            } catch (error) {
                console.error(`[Main Process] Error deleting file ${filePath}:`, error);
                return false;
            }
        });

        // --- App Event Listeners ---

        // New comprehensive handler to finalize encoded files
        ipcMain.handle('finalize-encoded-file', async (_event, params: { 
            tempFilePath: string, 
            finalFilePath: string, 
            jobId: string,
            isOverwrite: boolean,
            originalFilePath?: string
        }) => {
            console.log(`[Main Process] Finalizing encoded file:`);
            console.log(`[Main Process] - Temp file: ${params.tempFilePath}`);
            console.log(`[Main Process] - Final destination: ${params.finalFilePath}`);
            console.log(`[Main Process] - Job ID: ${params.jobId}`);
            console.log(`[Main Process] - Overwrite: ${params.isOverwrite}`);
            
            try {
                // Step 1: Validate that paths are provided and not undefined
                if (!params.tempFilePath) {
                    console.error(`[Main Process] Missing temp file path`);
                    return { success: false, error: "Temp file path is missing or undefined" };
                }
                
                if (!params.finalFilePath) {
                    console.error(`[Main Process] Missing final file path`);
                    return { success: false, error: "Final file path is missing or undefined" };
                }
                
                // Step 2: Check if temp file exists
                try {
                    const tempStats = await fs.stat(params.tempFilePath);
                    if (!tempStats.isFile() || tempStats.size === 0) {
                        console.error(`[Main Process] Temp file is invalid or empty: ${params.tempFilePath}`);
                        return { success: false, error: `Temp file is invalid or empty: ${params.tempFilePath}` };
                    }
                    console.log(`[Main Process] Temp file verified: ${params.tempFilePath}, size: ${tempStats.size} bytes`);
                } catch (error) {
                    console.error(`[Main Process] Couldn't access temp file: ${error instanceof Error ? error.message : String(error)}`);
                    return { success: false, error: `Couldn't access temp file: ${error instanceof Error ? error.message : String(error)}` };
                }
                
                // Step 3: Probe the temp file to get updated metadata
                console.log(`[Main Process] Probing temp file: ${params.tempFilePath}`);
                const probeData = await probeFile(params.tempFilePath);
                if (!probeData) {
                    console.error(`[Main Process] Failed to probe temp file: ${params.tempFilePath}`);
                    return { success: false, error: "Failed to probe temp file" };
                }
                
                // Step 4: Perform the file replacement
                let success = false;
                if (params.tempFilePath !== params.finalFilePath) {
                    console.log(`[Main Process] Moving ${params.tempFilePath} to ${params.finalFilePath}`);
                    
                    // Create a backup of the destination file if it exists (for safety)
                    let backupPath = "";
                    let backupCreated = false;
                    
                    if (fsSync.existsSync(params.finalFilePath)) {
                        backupPath = `${params.finalFilePath}.backup-${Date.now()}`;
                        try {
                            await fs.rename(params.finalFilePath, backupPath);
                            backupCreated = true;
                            console.log(`[Main Process] Created backup at: ${backupPath}`);
                        } catch (backupError) {
                            console.error(`[Main Process] Failed to create backup:`, backupError);
                            // Continue anyway - we'll try a direct replacement
                        }
                    }
                    
                    // Copy the temp file to the final destination
                    try {
                        await fs.copyFile(params.tempFilePath, params.finalFilePath);
                        
                        // Verify sizes match
                        const srcSize = (await fs.stat(params.tempFilePath)).size;
                        const destSize = (await fs.stat(params.finalFilePath)).size;
                        
                        if (srcSize !== destSize) {
                            throw new Error(`File size mismatch after copy: Temp=${srcSize}, Final=${destSize}`);
                        }
                        
                        // Copy succeeded, clean up
                        success = true;
                        console.log(`[Main Process] Successfully copied file to destination: ${params.finalFilePath}`);
                        
                        // Remove the temp file
                        try {
                            await fs.unlink(params.tempFilePath);
                            console.log(`[Main Process] Removed temp file: ${params.tempFilePath}`);
                        } catch (cleanupError) {
                            console.warn(`[Main Process] Could not remove temp file: ${cleanupError}`);
                            // Non-fatal error, continue
                        }
                        
                        // Remove backup if we created one
                        if (backupCreated) {
                            try {
                                await fs.unlink(backupPath);
                                console.log(`[Main Process] Removed backup: ${backupPath}`);
                            } catch (cleanupError) {
                                console.warn(`[Main Process] Could not remove backup: ${cleanupError}`);
                                // Non-fatal error, continue
                            }
                        }
                    } catch (copyError) {
                        console.error(`[Main Process] Error copying file:`, copyError);
                        
                        // Restore from backup if available
                        if (backupCreated) {
                            try {
                                await fs.rename(backupPath, params.finalFilePath);
                                console.log(`[Main Process] Restored original from backup`);
                            } catch (restoreError) {
                                console.error(`[Main Process] Failed to restore from backup:`, restoreError);
                            }
                        }
                        
                        return { success: false, error: `File copy failed: ${copyError instanceof Error ? copyError.message : String(copyError)}` };
                    }
                } else {
                    console.log(`[Main Process] Temp and final paths are the same, no move needed`);
                    success = true;
                }
                
                // Step 5: Update the database with the new file information
                if (success && params.isOverwrite) {
                    const dbPath = params.originalFilePath || params.finalFilePath;
                    
                    try {
                        // Add metadata for the encoded file
                        console.log(`[Main Process] Updating database for: ${dbPath}`);
                        await updateMediaAfterEncoding(probeData, params.jobId, dbPath);
                        console.log(`[Main Process] Database updated successfully`);
                    } catch (dbError) {
                        console.error(`[Main Process] Database update failed:`, dbError);
                        // Non-fatal error, continue with success
                    }
                }
                
                return { 
                    success: true, 
                    finalPath: params.finalFilePath,
                    probeData: probeData,
                    message: `File successfully finalized at: ${params.finalFilePath}`
                };
            } catch (error) {
                console.error(`[Main Process] Error finalizing encoded file:`, error);
                return { 
                    success: false, 
                    error: `Error finalizing encoded file: ${error instanceof Error ? error.message : String(error)}`
                };
            }
        });

        // Add new handler for file watcher status
        ipcMain.handle('get-file-watcher-status', async () => {
            if (!fileWatcher) {
                return {
                    isActive: false,
                    isReady: false,
                    isScanning: false,
                    lastScanTime: null,
                    watchedFolders: store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[],
                    watchedFolderCount: 0,
                    networkDriveStatus: []
                };
            }
            
            // Get comprehensive status from watcher
            const watcherStatus = fileWatcher.getWatcherStatus();
            
            return {
                ...watcherStatus,
                watchedFolders: store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[],
            };
        });

        // Add new handler for checking network drive connectivity
        ipcMain.handle('check-network-connectivity', async () => {
            if (!fileWatcher) {
                return {
                    success: false,
                    error: 'File watcher not initialized'
                };
            }
            
            try {
                // This will trigger the checkNetworkConnectivity method in the FileWatcher class
                // and update the watcher paths as needed
                await fileWatcher.forceRescan();
                
                // Return updated status
                return {
                    success: true,
                    status: fileWatcher.getWatcherStatus()
                };
            } catch (error) {
                console.error('[Main Process] Error checking network connectivity:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Add new handler for triggering a full deep scan
        ipcMain.handle('trigger-deep-scan', async () => {
            if (!fileWatcher) {
                return {
                    success: false,
                    error: 'File watcher not initialized'
                };
            }
            
            try {
                // This will trigger the full deep scan method in the FileWatcher class
                await fileWatcher.forceRescan();
                
                return {
                    success: true,
                    message: 'Deep scan has been triggered successfully'
                };
            } catch (error) {
                console.error('[Main Process] Error triggering deep scan:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Add new handler for cleanup of deleted files
        ipcMain.handle('trigger-cleanup-deleted-files', async () => {
            if (!fileWatcher) {
                return {
                    success: false,
                    error: 'File watcher not initialized'
                };
            }
            
            try {
                await fileWatcher.cleanupDeletedFiles();
                
                return {
                    success: true,
                    message: 'Database cleanup completed successfully'
                };
            } catch (error) {
                console.error('[Main Process] Error triggering cleanup:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Initialize the task scheduler
        taskScheduler = new TaskScheduler(db, mainWindow);
        taskScheduler.initialize().catch(err => {
            console.error('Failed to initialize task scheduler:', err);
        });

        // Set up IPC handlers for the scheduler
        setupSchedulerIpcHandlers();
    } catch (err) {
        console.error(`Failed to initialize database at path: ${dbPath || 'Unknown'}:`, err);
        // Handle error appropriately - maybe show an error dialog to the user
        // For now, we'll let the app continue but DB functionality will be broken
    }
    // --- End Initialize Database ---
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  // Always quit the app when all windows are closed, even on macOS
  // This ensures the npm run dev process also terminates
  if (process.platform !== 'darwin') {
    if (taskScheduler) {
      taskScheduler.shutdown();
    }
    app.quit()
  }
})

app.on('activate', () => {
  
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
    
    // Destroy tray icon if it exists
    if (tray) {
        tray.destroy();
        tray = null;
    }
    
    // Close database
    if (db) {
        console.log("Closing database connection.");
        db.close();
    }
});

// Keep track of system stats timer
let systemStatsTimer: NodeJS.Timeout | null = null;

// After runPsCommand function, let's add back the getSystemStats and pollSystemStats functions

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

// Set up IPC handlers for the scheduler
function setupSchedulerIpcHandlers() {
  // Get all tasks
  ipcMain.handle('scheduler:getAllTasks', async () => {
    if (!taskScheduler) {
      throw new Error('Task scheduler not initialized');
    }
    return taskScheduler.getAllTasks();
  });

  // Add a new task
  ipcMain.handle('scheduler:addTask', async (_, task) => {
    if (!taskScheduler) {
      throw new Error('Task scheduler not initialized');
    }
    return taskScheduler.addTask(task);
  });

  // Update a task
  ipcMain.handle('scheduler:updateTask', async (_, taskId, updates) => {
    if (!taskScheduler) {
      throw new Error('Task scheduler not initialized');
    }
    return taskScheduler.updateTask(taskId, updates);
  });

  // Toggle task enabled state
  ipcMain.handle('scheduler:toggleTask', async (_, taskId, enabled) => {
    if (!taskScheduler) {
      throw new Error('Task scheduler not initialized');
    }
    return taskScheduler.toggleTaskEnabled(taskId, enabled);
  });

  // Delete a task
  ipcMain.handle('scheduler:deleteTask', async (_, taskId) => {
    if (!taskScheduler) {
      throw new Error('Task scheduler not initialized');
    }
    return taskScheduler.deleteTask(taskId);
  });

  // Run a task now
  ipcMain.handle('scheduler:runTaskNow', async (_, taskId) => {
    if (!taskScheduler) {
      throw new Error('Task scheduler not initialized');
    }
    await taskScheduler.runTaskNow(taskId);
  });

  // Get config value
  ipcMain.handle('scheduler:getConfigValue', async (_, key) => {
    console.log(`[Main Process] Getting config value for key: ${key}`);
    return store.get(key);
  });

  // Set config value
  ipcMain.handle('scheduler:setConfigValue', async (_, key, value) => {
    console.log(`[Main Process] Setting config value for key: ${key} to:`, value);
    store.set(key, value);
    return true;
  });
}
