import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent, clipboard, systemPreferences, nativeTheme, shell, Tray, Menu } from 'electron';
import { isDev } from "./util.js";
import { getPreloadPath, getUIPath, getIconPath, getSplashPath } from "./pathResolver.js";
import { getStaticData, pollResources, stopPolling } from "./test.js";
import si from 'systeminformation';
import Store from 'electron-store';
import { exec } from 'child_process';
import { Buffer } from 'buffer';
import path from 'path';
import Database from 'better-sqlite3'; // Keep for type usage if necessary
import fs from 'fs/promises';
import fsSync from 'fs';
import { Node, Edge } from 'reactflow';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { startEncodingProcess } from './ffmpegUtils.js';
import { probeFile } from './ffprobeUtils.js';
import { WatchedFolder, scanMediaFolders, scanSingleFolder } from './scannerUtils.js';
import crypto from 'crypto';
import { setMainWindow, captureConsoleLogs, getLogBuffer } from './logger.js';
import { getPresets, savePreset, deletePreset } from './presetDatabase.js';
import { FileWatcher } from './fileWatcherUtils.js';
import TaskScheduler from './schedulerUtils.js';
import { initializeDatabase, getDbInstance, registerDbIpcHandlers, updateMediaAfterEncoding as updateMediaDb } from './dbUtils.js';
import { registerAppIpcHandlers } from './ipcHandlers.js';
import { initializeSystemUtils, startSystemStatsPolling, stopSystemStatsPolling } from './systemUtils.js';
import type { GpuInfo, SystemStats, HardwareInfo, EncodingProgress, EncodingResult, EncodingOptions } from '../types.js'; // Import types

// Local type definitions removed, now imported from ../types.js

// --- FFMPEG Configuration ---
console.log(`[FFMPEG Config] Path from ffmpeg-static: ${ffmpegStatic}`);
try {
    ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
    console.log(`[FFMPEG Config] Successfully set ffmpeg path.`);
} catch (error) {
    console.error(`[FFMPEG Config] Error setting ffmpeg path:`, error);
}
// --- End FFMPEG Configuration ---

const store = new Store();
const SELECTED_GPU_KEY = 'selectedGpuModel';
const ENABLE_PS_GPU_KEY = 'enablePsGpuMonitoring';
const WATCHED_FOLDERS_KEY = 'watchedFolders';
const MANUAL_GPU_VRAM_MB_KEY = 'manualGpuVramMb';

let isScanning = false;
let fileWatcher: FileWatcher | null = null;
let splashScreen: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let taskScheduler: TaskScheduler | null = null;
const APP_STARTUP_TIMEOUT = 30000;

function setupTray() {
    if (process.platform !== 'win32') return;
    tray = new Tray(getIconPath());
    tray.setToolTip('Recodarr');
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open Recodarr', click: () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } } },
        { type: 'separator' },
        { label: 'Restart App', click: () => { app.relaunch(); app.exit(); } },
        { type: 'separator' },
        { label: 'Exit', click: () => { app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
    console.log('[Main Process] System tray icon created');
}

function startWatching(folders: WatchedFolder[]) {
    if (!fileWatcher) {
        console.log("[Main Process] Creating new FileWatcher instance");
        try {
            fileWatcher = new FileWatcher(getDbInstance(), mainWindow);
        } catch (error) {
            console.error("[Main Process] Failed to create FileWatcher, DB not ready?", error);
            // Handle error, maybe retry or notify user
            return;
        }
    }
    const SPLASH_SCREEN_DURATION = 3000;
    console.log(`[Main Process] Splash screen will be visible for ${SPLASH_SCREEN_DURATION/1000} seconds`);
    setTimeout(() => closeSplashScreen(), SPLASH_SCREEN_DURATION);
    fileWatcher.startWatching(folders)
        .then(() => console.log("[Main Process] FileWatcher initialized and ready"))
        .catch(error => console.error("[Main Process] Error initializing FileWatcher:", error));
}

function closeSplashScreen() {
    if (splashScreen && !splashScreen.isDestroyed()) {
        console.log("Closing splash screen and showing main window...");
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        splashScreen.close();
        splashScreen = null;
    }
}

function stopWatching() { if (fileWatcher) { console.log("Closing file watcher."); fileWatcher.stopWatching(); fileWatcher = null; } }
function watchPath(folderPath: string) { if (fileWatcher) fileWatcher.watchPath(folderPath); }
function unwatchPath(folderPath: string) { if (fileWatcher) fileWatcher.unwatchPath(folderPath); }

// runPsCommand, findGpu, getSystemStats, pollSystemStats, and systemStatsTimer are moved to systemUtils.ts

app.on("ready", async () => {
    captureConsoleLogs();
    if (!dialog || typeof dialog.showMessageBox !== 'function') console.error("dialog API is not properly initialized!");
    else console.log("dialog API is available and properly initialized");

    splashScreen = new BrowserWindow({ width: 400, height: 400, transparent: false, frame: false, resizable: false, center: true, show: true, backgroundColor: '#232836', icon: getIconPath(), webPreferences: { nodeIntegration: false, contextIsolation: true } });
    console.log(`Loading splash screen from: ${getSplashPath()}`);
    splashScreen.loadFile(getSplashPath());

    mainWindow = new BrowserWindow({ width: 1450, height: 750, icon: getIconPath(), show: false, backgroundColor: '#232836', titleBarStyle: 'default', titleBarOverlay: process.platform === 'win32' ? { color: '#686b76', symbolColor: '#ffffff', height: 32 } : false, webPreferences: { preload: getPreloadPath() } });
    setMainWindow(mainWindow);

    const logDir = path.join(app.getPath('userData'), 'encoding_logs');
    try {
        await fs.mkdir(logDir, { recursive: true });
        console.log(`[Main Process] Encoding logs directory ensured: ${logDir}`);
    } catch (dirError) {
        console.error(`[Main Process] Failed to create encoding log directory ${logDir}:`, dirError);
    }

    try {
        initializeSystemUtils(store); // Initialize system utils with the store

        await initializeDatabase(name => app.getPath(name)); // Correctly pass app.getPath
        registerDbIpcHandlers(ipcMain);
        console.log("[Main Process] Database initialized and IPC handlers registered via dbUtils.");

        // Initialize Task Scheduler
        taskScheduler = new TaskScheduler(getDbInstance(), mainWindow);
        await taskScheduler.initialize().catch(err => console.error('Failed to initialize task scheduler:', err));

        // Start File Watcher (this initializes the global `fileWatcher` variable)
        const initialFoldersToWatch = store.get(WATCHED_FOLDERS_KEY, []) as WatchedFolder[];
        startWatching(initialFoldersToWatch); 

        // Create refs and register app IPC handlers.
        const fileWatcherRef = { instance: fileWatcher };
        const isScanningRef = { value: isScanning };

        registerAppIpcHandlers(
            ipcMain,
            mainWindow,
            store,
            name => app.getPath(name), // Correctly pass app.getPath here as well
            fileWatcherRef,
            isScanningRef,
            logDir,
            taskScheduler
        );
        
        if (isDev()) mainWindow.loadURL("http://localhost:3524");
        else mainWindow.loadFile(getUIPath());

        pollResources(mainWindow); // This is from test.js, keep if still needed
        startSystemStatsPolling(mainWindow); // Use the new function from systemUtils

        setTimeout(() => { 
            const fwInstance = fileWatcherRef.instance; 
            if ((!fwInstance || !fwInstance.isReady()) && splashScreen && !splashScreen.isDestroyed()) { 
                console.log("Timeout for watcher. Showing main window..."); 
                closeSplashScreen(); 
            } 
        }, APP_STARTUP_TIMEOUT);
        
        setupTray();

    } catch (appInitError) {
        console.error(`[Main Process] Critical error during app initialization:`, appInitError);
        if (dialog) dialog.showErrorBox("Application Error", `A critical error occurred during startup: ${appInitError instanceof Error ? appInitError.message : String(appInitError)}. The application will now close.`);
        app.quit();
    }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (taskScheduler) taskScheduler.shutdown();
    app.quit();
  }
});

app.on('activate', () => { /* Standard macOS activate behavior can be added if needed */ });

app.on('will-quit', () => {
    stopWatching(); 
    stopSystemStatsPolling(); // Use the new function
    stopPolling(); // This is from test.js
    if (tray) { tray.destroy(); tray = null; }
    try {
        const dbInstance = getDbInstance();
        if (dbInstance) { console.log("Closing database connection."); dbInstance.close(); }
    } catch (error) { console.warn("[Main Process] Failed to get DB instance on quit, or DB already closed:", error); }
});

// systemStatsTimer, findGpu, getSystemStats, pollSystemStats are moved to systemUtils.ts
// setupSchedulerIpcHandlers function is removed as its logic is now in ipcHandlers.ts
