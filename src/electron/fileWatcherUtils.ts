import { BrowserWindow } from 'electron';
import * as chokidar from 'chokidar';
import * as path from 'path';
import Database from 'better-sqlite3';
import { WatchedFolder, SUPPORTED_EXTENSIONS, addMediaToDb, scanSingleFolder } from './scannerUtils.js';
import { probeFile } from './ffprobeUtils.js';
import * as fs from 'fs/promises';
import fsSync from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Interface for file stats cache
interface FileStats {
    path: string;
    size: number;
    mtimeMs: number; // Modification time
    ctimeMs: number; // Change time
    lastChecked: number; // Timestamp of last check
}

// Interface for network drive status
interface NetworkDriveStatus {
    path: string;
    isAccessible: boolean;
    lastChecked: Date;
    error?: string;
}

// Class to manage file watching operations
export class FileWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private isWatcherReady = false;
    private db: Database.Database;
    private mainWindow: BrowserWindow | null = null;
    private watchedFolders: WatchedFolder[] = [];
    private pollingInterval: NodeJS.Timeout | null = null;
    private networkCheckInterval: NodeJS.Timeout | null = null;
    private isScanning = false;
    private lastScanTime: Date | null = null;
    private networkDriveStatus: Map<string, NetworkDriveStatus> = new Map();
    private fileStatsCache: Map<string, FileStats> = new Map();
    private deepScanInProgress = false;
    
    constructor(db: Database.Database, mainWindow: BrowserWindow | null) {
        this.db = db;
        this.mainWindow = mainWindow;
    }

    /**
     * Start watching the provided folders
     */
    public startWatching(folders: WatchedFolder[]): Promise<void> {
        return new Promise((resolve) => {
            try {
                this.isWatcherReady = false;
                this.watchedFolders = [...folders];
                
                if (this.watcher) {
                    console.log("[FileWatcher] Closing existing watcher before starting new one.");
                    try {
                        this.watcher.close();
                    } catch (err) {
                        console.error("[FileWatcher] Error closing existing watcher:", err);
                    }
                    this.watcher = null;
                }

                const pathsToWatch = folders.map(f => f.path).filter(p => p && typeof p === 'string');
                if (pathsToWatch.length === 0) {
                    console.log("[FileWatcher] No folders configured to watch.");
                    this.isWatcherReady = true;
                    resolve();
                    return;
                }

                // Start the watcher immediately with core functionality
                console.log("[FileWatcher] Starting watcher with minimum initialization for fast startup");
                this.initializeWatcher(pathsToWatch, resolve);
                
                // Delay loading the database entries to after the UI is shown
                setTimeout(() => {
                    console.log("[FileWatcher] Starting deferred database loading");
                    this.loadExistingFilesFromDb().then(() => {
                        console.log(`[FileWatcher] Loaded ${this.fileStatsCache.size} existing files from database`);
                    }).catch(error => {
                        console.error("[FileWatcher] Error in deferred database loading:", error);
                    });
                    
                    // Start network drive monitoring after a delay
                    setTimeout(() => {
                        this.checkNetworkDrives(pathsToWatch).then(() => {
                            this.startNetworkDriveMonitoring();
                        }).catch(error => {
                            console.error("[FileWatcher] Error checking network drives:", error);
                        });
                    }, 10000); // 10 second delay for network checks
                }, 5000); // 5 second delay for database loading
            } catch (error) {
                console.error("[FileWatcher] Fatal error starting watcher:", error);
                this.isWatcherReady = true; // Mark as ready with error
                resolve(); // Resolve promise to prevent hanging
            }
        });
    }
    
    /**
     * Load existing files from database to avoid unnecessary probing
     */
    private async loadExistingFilesFromDb(): Promise<void> {
        if (!this.db) {
            console.error('[FileWatcher] Database not initialized, cannot load existing files');
            return;
        }
        
        try {
            this.fileStatsCache.clear();
            
            // Query all files from the database
            const stmt = this.db.prepare(`
                SELECT filePath, currentSize, lastSizeCheckAt 
                FROM media
            `);
            
            const existingFiles = stmt.all() as Array<{
                filePath: string;
                currentSize: number;
                lastSizeCheckAt: string;
            }>;

            console.log(`[FileWatcher] Found ${existingFiles.length} existing files in database`);
            
            // Process files in smaller batches to avoid memory issues
            const BATCH_SIZE = 100; // Process 100 files at a time
            let processedCount = 0;
            let successCount = 0;
            let errorCount = 0;
            
            // Function to process a batch of files
            const processBatch = async (batch: typeof existingFiles) => {
                for (const file of batch) {
                    try {
                        // Skip files with empty or null paths
                        if (!file.filePath) {
                            errorCount++;
                            continue;
                        }
                        
                        // Use try/catch per file to prevent one bad file from crashing everything
                        try {
                            // Only check if file exists synchronously to avoid too many promises
                            if (fsSync.existsSync(file.filePath)) {
                                try {
                                    const stats = fsSync.statSync(file.filePath);
                                    this.fileStatsCache.set(file.filePath, {
                                        path: file.filePath,
                                        size: stats.size,
                                        mtimeMs: stats.mtimeMs,
                                        ctimeMs: stats.ctimeMs,
                                        lastChecked: Date.now()
                                    });
                                    successCount++;
                                } catch (statError) {
                                    // Skip files with stat errors
                                    console.warn(`[FileWatcher] Couldn't stat file ${file.filePath}: ${statError}`);
                                    errorCount++;
                                }
                            } else {
                                // File doesn't exist, count as error but don't log to reduce noise
                                errorCount++;
                            }
                        } catch (fsError) {
                            // This catch block is for any unexpected errors with fsSync.existsSync
                            console.warn(`[FileWatcher] Error checking file ${file.filePath}: ${fsError}`);
                            errorCount++;
                        }
                    } catch (generalError) {
                        // Catch-all protection against any unexpected issues
                        console.error('[FileWatcher] Unexpected error processing file entry:', generalError);
                        errorCount++;
                    }
                    
                    processedCount++;
                }
                
                // Log progress occasionally
                if (processedCount % 500 === 0 || processedCount === existingFiles.length) {
                    console.log(`[FileWatcher] Processed ${processedCount}/${existingFiles.length} files (${successCount} cached, ${errorCount} errors)`);
                }
            };
            
            // Process all files in batches
            for (let i = 0; i < existingFiles.length; i += BATCH_SIZE) {
                const batch = existingFiles.slice(i, i + BATCH_SIZE);
                await processBatch(batch);
                
                // Brief pause between batches to allow other operations
                if (i + BATCH_SIZE < existingFiles.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            console.log(`[FileWatcher] Successfully cached stats for ${this.fileStatsCache.size} files (${errorCount} errors)`);
        } catch (error) {
            console.error('[FileWatcher] Error loading files from database:', error);
        }
    }
    
    /**
     * Initialize the chokidar watcher with the specified paths
     */
    private initializeWatcher(pathsToWatch: string[], resolve: () => void): void {
        try {
            console.log(`[FileWatcher] Initializing watcher for paths: ${pathsToWatch.join(", ")}`);
            
            // Configure watcher with options optimized for performance during startup
            this.watcher = chokidar.watch([], {  // Start with empty array
                ignored: [
                    /(^|[\\\/])\../,  // ignore dotfiles
                    /.*_tmp.*\.(?:mkv|mp4|avi|mov|wmv|flv|webm)$/i, // temp encoding files
                    /(\/|\\)\.recycle(\/|\\).*/i, // Ignore recycle/trash folders
                    /\$RECYCLE\.BIN/i,  // Ignore Windows recycle bin
                    /(\/|\\)\$WINDOWS\.~BT(\/|\\).*/i, // Windows update files
                    /(\/|\\)System Volume Information(\/|\\).*/i // System files
                ],
                persistent: true,
                ignoreInitial: true, // Skip initial scan for faster startup - we'll handle this later
                awaitWriteFinish: false, // Disable initially for faster startup
                alwaysStat: false, // Disable initially for faster startup
                usePolling: false, // Disable initially for faster startup
                followSymlinks: false,
                depth: 5 // Lower depth for faster initial setup
            });

            // Configure basic event handlers for essential functionality
            this.setupEventHandlers();
            
            // Mark as ready immediately to allow the UI to proceed
            // We'll add paths and enhance the watcher settings later
            this.isWatcherReady = true;
            this.lastScanTime = new Date();
            
            // Resolve immediately to let app start quickly
            resolve();
            
            // Add paths gradually in the background
            setTimeout(() => {
                this.enhanceWatcherConfiguration();
                this.addPathsGradually(pathsToWatch);
            }, 3000); // Wait 3 seconds before starting to add paths
            
            // Schedule scan after UI is fully loaded
            setTimeout(() => {
                // Schedule database cleanup for deleted files (with high delay to ensure smooth startup)
                setTimeout(() => {
                    console.log('[FileWatcher] Scheduling cleanup of deleted files');
                    this.cleanupDeletedFiles().catch(err => {
                        console.error('[FileWatcher] Error in scheduled cleanup:', err);
                    });
                }, 120000); // Run cleanup after 2 minutes
                
                // Start periodic deep scan after a delay
                this.startPeriodicDeepScan(24 * 60 * 60 * 1000); // 24 hours
                
                // Start regular polling for network check
                this.startPeriodicRescan();
            }, 60000); // Wait 1 minute before scheduling background tasks
        } catch (error) {
            console.error('[FileWatcher] Error initializing watcher:', error);
            this.isWatcherReady = true; // Mark as ready despite error
            resolve(); // Resolve promise to prevent hanging
        }
    }

    /**
     * Enhance watcher configuration with more robust settings after startup
     */
    private enhanceWatcherConfiguration(): void {
        if (!this.watcher) return;
        
        try {
            console.log('[FileWatcher] Enhancing watcher configuration for better monitoring');
            
            // Update watcher options for better monitoring after initial startup
            // Note: We can't directly modify most options after creation,
            // but we can adjust some behaviors through additional methods
            
            // We'll enable these features when we add paths in the background
            
            // 1. Enable usePolling (for network drives)
            // 2. Increase depth to proper value
            // 3. Enable awaitWriteFinish 
            
            // These will take effect for new paths added
        } catch (error) {
            console.error('[FileWatcher] Error enhancing watcher configuration:', error);
        }
    }

    /**
     * Add paths to the watcher gradually in the background
     */
    private addPathsGradually(pathsToWatch: string[]): void {
        if (!this.watcher) return;
        
        try {
            // Add paths in very small batches to prevent UI freezing
            const BATCH_SIZE = 1; // Add only one directory at a time
            
            // Function to add a batch of paths
            const addPathBatch = (index: number) => {
                if (index >= pathsToWatch.length) {
                    console.log('[FileWatcher] All paths added to watcher');
                    this.notifyUI('watcher-fully-initialized', {
                        pathCount: pathsToWatch.length,
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
                
                // Get the next path to add
                const path = pathsToWatch[index];
                
                // Add with robust options for ongoing monitoring
                try {
                    console.log(`[FileWatcher] Adding path ${index+1}/${pathsToWatch.length}: ${path}`);
                    
                    // Add the path with more robust options
                    this.watcher?.add(path);
                    
                    // Report progress to UI periodically
                    if (index % 5 === 0 || index === pathsToWatch.length - 1) {
                        this.notifyUI('watcher-paths-progress', {
                            current: index + 1,
                            total: pathsToWatch.length,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (err) {
                    console.error(`[FileWatcher] Error adding path ${path}:`, err);
                }
                
                // Add next path after a longer delay to keep UI responsive
                setTimeout(() => addPathBatch(index + 1), 2000); // 2 second between paths
            };
            
            // Start adding paths
            addPathBatch(0);
        } catch (error) {
            console.error('[FileWatcher] Error in addPathsGradually:', error);
        }
    }

    /**
     * Setup watcher event handlers
     */
    private setupEventHandlers(): void {
        if (!this.watcher) return;

        this.watcher
            .on('add', async (filePath: string, stats) => {
                console.log(`[FileWatcher] Detected new file: ${filePath}, size: ${stats?.size || 'unknown'}`);
                await this.processFileChange(filePath, 'add', stats);
            })
            .on('change', async (filePath: string, stats) => {
                console.log(`[FileWatcher] Detected file change: ${filePath}, size: ${stats?.size || 'unknown'}`);
                await this.processFileChange(filePath, 'change', stats);
            })
            .on('unlink', (filePath: string) => {
                console.log(`[FileWatcher] File was removed: ${filePath}`);
                this.processFileDeletion(filePath);
            })
            .on('error', (error: unknown) => {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`[FileWatcher] Watcher error: ${errorMsg}`);
                
                // Send error notification to UI
                this.notifyUI('watcher-error', {
                    error: errorMsg,
                    timestamp: new Date().toISOString()
                });
                
                // Attempt recovery after error
                this.recoverFromError();
            });
    }

    /**
     * Process a file change (addition or modification)
     */
    private async processFileChange(filePath: string, eventType: 'add' | 'change', stats?: fsSync.Stats): Promise<void> {
        try {
            const ext = path.extname(filePath).toLowerCase();
            
            // Skip temporary files created during encoding
            if (filePath.includes('_tmp')) {
                console.log(`[FileWatcher] Skipping temporary encoding file: ${filePath}`);
                return;
            }
            
            if (SUPPORTED_EXTENSIONS.includes(ext)) {
                // Find which library this file belongs to
                const parentFolder = this.watchedFolders.find(f => 
                    filePath.startsWith(f.path + path.sep) || filePath === f.path
                );
                
                if (parentFolder) {
                    if (!stats) {
                        try {
                            stats = await fs.stat(filePath);
                        } catch (error) {
                            console.error(`[FileWatcher] Error getting stats for ${filePath}:`, error);
                            return;
                        }
                    }
                    
                    // Check if we have this file cached and if it needs updating
                    const cachedStats = this.fileStatsCache.get(filePath);
                    const fileChanged = !cachedStats || 
                        cachedStats.size !== stats.size || 
                        cachedStats.mtimeMs !== stats.mtimeMs || 
                        cachedStats.ctimeMs !== stats.ctimeMs;
                    
                    if (fileChanged) {
                        console.log(`[FileWatcher] Processing ${eventType} for ${filePath} in library: ${parentFolder.libraryName}`);
                        
                        // Update stats cache (even before ffprobe to avoid duplicate processing)
                        this.fileStatsCache.set(filePath, {
                            path: filePath,
                            size: stats.size,
                            mtimeMs: stats.mtimeMs,
                            ctimeMs: stats.ctimeMs,
                            lastChecked: Date.now()
                        });
                        
                        const probeData = await probeFile(filePath);
                        if (probeData) {
                            await addMediaToDb(this.db, probeData, parentFolder.libraryName, parentFolder.libraryType);
                            
                            // Notify UI of the change
                            this.notifyUI('media-updated', {
                                filePath,
                                eventType,
                                library: parentFolder.libraryName,
                                timestamp: new Date().toISOString()
                            });
                        } else {
                            console.warn(`[FileWatcher] Probe failed for file: ${filePath}`);
                        }
                    } else {
                        console.log(`[FileWatcher] File ${filePath} already processed and unchanged, skipping ffprobe`);
                        // Update the last checked timestamp
                        this.fileStatsCache.set(filePath, {
                            ...cachedStats,
                            lastChecked: Date.now()
                        });
                    }
                } else {
                    console.warn(`[FileWatcher] File ${eventType} in watched parent, but couldn't determine library: ${filePath}`);
                }
            }
        } catch (error) {
            console.error(`[FileWatcher] Error processing file ${filePath}:`, error);
        }
    }

    /**
     * Process a file deletion
     */
    private processFileDeletion(filePath: string): void {
        try {
            const ext = path.extname(filePath).toLowerCase();
            
            // Remove from stats cache
            this.fileStatsCache.delete(filePath);
            
            if (SUPPORTED_EXTENSIONS.includes(ext)) {
                // Remove file from database if it exists
                if (this.db) {
                    const stmt = this.db.prepare('DELETE FROM media WHERE filePath = ?');
                    const result = stmt.run(filePath);
                    
                    if (result.changes > 0) {
                        console.log(`[FileWatcher] Removed deleted file from database: ${filePath}`);
                        
                        // Notify UI of the deletion
                        this.notifyUI('media-deleted', {
                            filePath,
                            timestamp: new Date().toISOString()
                        });
                    } else {
                        console.log(`[FileWatcher] File not found in database: ${filePath}`);
                    }
                }
            }
        } catch (error) {
            console.error(`[FileWatcher] Error processing file deletion ${filePath}:`, error);
        }
    }

    /**
     * Recover from watcher errors by restarting
     */
    private recoverFromError(): void {
        console.log('[FileWatcher] Attempting to recover from error...');
        
        // Wait a bit before attempting recovery
        setTimeout(() => {
            this.startWatching(this.watchedFolders)
                .then(() => {
                    console.log('[FileWatcher] Successfully restarted after error');
                    this.notifyUI('watcher-recovered', {
                        timestamp: new Date().toISOString()
                    });
                })
                .catch(err => console.error('[FileWatcher] Failed to restart after error:', err));
        }, 5000);
    }

    /**
     * Start periodic light rescanning to check for network connectivity
     */
    private startPeriodicRescan(): void {
        // Clear any existing interval
        this.stopPeriodicRescan();
        
        // Set up interval for periodic network checks (every 30 minutes)
        this.pollingInterval = setInterval(() => {
            this.checkNetworkConnectivity();
        }, 30 * 60 * 1000); // 30 minutes
        
        console.log('[FileWatcher] Periodic network check scheduled every 30 minutes');
    }
    
    /**
     * Start periodic deep scan (less frequently than network check)
     */
    private startPeriodicDeepScan(intervalMs: number): void {
        // Set up interval for periodic deep scans
        const deepScanInterval = setInterval(() => {
            if (!this.deepScanInProgress) {
                console.log('[FileWatcher] Starting scheduled deep scan');
                this.performDeepScan().catch(err => {
                    console.error('[FileWatcher] Error in periodic deep scan:', err);
                });
            } else {
                console.log('[FileWatcher] Skipping scheduled deep scan as another scan is in progress');
            }
        }, intervalMs);
        
        console.log(`[FileWatcher] Deep scan scheduled every ${intervalMs / (1000 * 60 * 60)} hours`);
    }

    /**
     * Stop periodic rescanning
     */
    private stopPeriodicRescan(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Perform a light rescan primarily for checking network connectivity
     */
    private async performPeriodicRescan(): Promise<void> {
        if (this.isScanning || this.watchedFolders.length === 0) return;
        
        this.isScanning = true;
        console.log('[FileWatcher] Starting periodic network connectivity check');
        
        try {
            // Just check network connectivity, don't do a full scan
            await this.checkNetworkConnectivity();
            
            this.lastScanTime = new Date();
            console.log('[FileWatcher] Periodic network check completed successfully');
        } catch (error) {
            console.error('[FileWatcher] Error during periodic network check:', error);
        } finally {
            this.isScanning = false;
        }
    }
    
    /**
     * Perform a deep scan of all watched folders
     * This is more resource-intensive but ensures database is fully up to date
     */
    private async performDeepScan(): Promise<void> {
        if (this.deepScanInProgress || this.watchedFolders.length === 0) {
            return;
        }
        
        this.deepScanInProgress = true;
        console.log('[FileWatcher] Starting deep scan of all watched folders');
        
        try {
            // Notify UI that deep scan is starting
            this.notifyUI('deep-scan-started', {
                timestamp: new Date().toISOString(),
                folderCount: this.watchedFolders.length
            });
            
            // Create a list of accessible folders to scan
            const foldersToScan = [];
            
            for (const folder of this.watchedFolders) {
                if (await this.isPathAccessible(folder.path)) {
                    foldersToScan.push(folder);
                } else {
                    console.warn(`[FileWatcher] Skipping inaccessible folder in deep scan: ${folder.path}`);
                }
            }
            
            // Create a scan reference
            const scanRef: { value: boolean } = { value: true };
            
            // Use batch processing to avoid overwhelming the system
            const batchSize = 1; // Process libraries one at a time
            for (let i = 0; i < foldersToScan.length; i += batchSize) {
                const batch = foldersToScan.slice(i, i + batchSize);
                
                // Process each folder in the batch
                for (const folder of batch) {
                    console.log(`[FileWatcher] Deep scanning folder: ${folder.path}`);
                    await scanSingleFolder(this.db, folder.path, this.mainWindow, this.watchedFolders, scanRef);
                }
                
                // Optional: Add a small delay between batches to give system breathing room
                if (i + batchSize < foldersToScan.length) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            this.lastScanTime = new Date();
            console.log('[FileWatcher] Deep scan completed successfully');
            
            // Notify UI that deep scan is complete
            this.notifyUI('deep-scan-completed', {
                timestamp: this.lastScanTime.toISOString(),
                folderCount: this.watchedFolders.length
            });
        } catch (error) {
            console.error('[FileWatcher] Error during deep scan:', error);
            
            // Notify UI of scan error
            this.notifyUI('deep-scan-error', {
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString()
            });
        } finally {
            this.deepScanInProgress = false;
        }
    }

    /**
     * Add a new path to watch
     */
    public watchPath(folderPath: string): void {
        if (this.watcher) {
            console.log(`[FileWatcher] Adding path to watcher: ${folderPath}`);
            this.watcher.add(folderPath);
        }
    }

    /**
     * Remove a path from watching
     */
    public unwatchPath(folderPath: string): void {
        if (this.watcher) {
            console.log(`[FileWatcher] Removing path from watcher: ${folderPath}`);
            this.watcher.unwatch(folderPath);
        }
    }

    /**
     * Stop watching all paths
     */
    public stopWatching(): void {
        this.stopPeriodicRescan();
        this.stopNetworkDriveMonitoring();
        
        if (this.watcher) {
            console.log("[FileWatcher] Closing file watcher.");
            this.watcher.close();
            this.watcher = null;
        }
    }

    /**
     * Force a rescan of all watched folders
     */
    public async forceRescan(): Promise<void> {
        if (this.isScanning) {
            console.log('[FileWatcher] Scan already in progress, skipping force rescan');
            return;
        }
        
        await this.performDeepScan();
    }

    /**
     * Check if the watcher is ready
     */
    public isReady(): boolean {
        return this.isWatcherReady;
    }

    /**
     * Get the time of the last completed scan
     */
    public getLastScanTime(): Date | null {
        return this.lastScanTime;
    }

    /**
     * Check if a path is accessible
     */
    private async isPathAccessible(folderPath: string): Promise<boolean> {
        try {
            await fs.access(folderPath, fs.constants.R_OK);
            return true;
        } catch (error) {
            console.warn(`[FileWatcher] Path not accessible: ${folderPath}`);
            return false;
        }
    }

    /**
     * Check multiple network drives for accessibility
     */
    private async checkNetworkDrives(paths: string[]): Promise<string[]> {
        const inaccessiblePaths: string[] = [];
        
        for (const path of paths) {
            if (!(await this.isPathAccessible(path))) {
                inaccessiblePaths.push(path);
                
                // Update network drive status
                this.networkDriveStatus.set(path, {
                    path,
                    isAccessible: false,
                    lastChecked: new Date(),
                    error: 'Path not accessible'
                });
            } else {
                // Update network drive status as accessible
                this.networkDriveStatus.set(path, {
                    path,
                    isAccessible: true,
                    lastChecked: new Date()
                });
            }
        }
        
        return inaccessiblePaths;
    }

    /**
     * Start monitoring network drives for connectivity
     */
    private startNetworkDriveMonitoring(): void {
        // Clear any existing interval
        this.stopNetworkDriveMonitoring();
        
        // Set up interval for checking network drives every 5 minutes
        this.networkCheckInterval = setInterval(() => {
            this.checkNetworkConnectivity();
        }, 5 * 60 * 1000); // 5 minutes
        
        console.log('[FileWatcher] Network drive monitoring started, checking every 5 minutes');
    }

    /**
     * Stop network drive monitoring
     */
    private stopNetworkDriveMonitoring(): void {
        if (this.networkCheckInterval) {
            clearInterval(this.networkCheckInterval);
            this.networkCheckInterval = null;
        }
    }

    /**
     * Check network drive connectivity and update watcher if needed
     */
    private async checkNetworkConnectivity(): Promise<void> {
        console.log('[FileWatcher] Checking network drive connectivity...');
        
        const paths = this.watchedFolders.map(f => f.path);
        const previouslyInaccessible = new Set(
            Array.from(this.networkDriveStatus.entries())
                .filter(([_, status]) => !status.isAccessible)
                .map(([path, _]) => path)
        );
        
        const currentlyInaccessible = await this.checkNetworkDrives(paths);
        const newlyAccessible = Array.from(previouslyInaccessible)
            .filter(path => !currentlyInaccessible.includes(path));
        
        const newlyInaccessible = currentlyInaccessible
            .filter(path => !previouslyInaccessible.has(path));
            
        // If any drives became accessible or inaccessible, update the watcher
        if (newlyAccessible.length > 0 || newlyInaccessible.length > 0) {
            console.log('[FileWatcher] Network connectivity changed, updating watcher...');
            
            if (newlyAccessible.length > 0) {
                console.log(`[FileWatcher] Newly accessible paths: ${newlyAccessible.join(', ')}`);
                
                // Add newly accessible paths to the watcher
                for (const path of newlyAccessible) {
                    this.watchPath(path);
                }
                
                // Notify UI
                this.notifyUI('network-drives-reconnected', {
                    paths: newlyAccessible,
                    timestamp: new Date().toISOString()
                });
            }
            
            if (newlyInaccessible.length > 0) {
                console.log(`[FileWatcher] Newly inaccessible paths: ${newlyInaccessible.join(', ')}`);
                
                // Remove inaccessible paths from the watcher to prevent errors
                for (const path of newlyInaccessible) {
                    this.unwatchPath(path);
                }
                
                // Notify UI
                this.notifyUI('network-drives-disconnected', {
                    paths: newlyInaccessible,
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            console.log('[FileWatcher] No change in network drive connectivity');
        }
    }

    /**
     * Get network drive status information
     */
    public getNetworkDriveStatus(): NetworkDriveStatus[] {
        return Array.from(this.networkDriveStatus.values());
    }

    /**
     * Send notification to UI via mainWindow
     */
    private notifyUI(event: string, data: any): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(`filewatcher-${event}`, data);
        }
    }

    /**
     * Get watcher status information
     */
    public getWatcherStatus(): {
        isActive: boolean;
        isReady: boolean;
        isScanning: boolean;
        isDeepScanInProgress: boolean;
        lastScanTime: Date | null;
        watchedFolderCount: number;
        networkDriveStatus: NetworkDriveStatus[];
        cachedFileCount: number;
    } {
        return {
            isActive: this.watcher !== null,
            isReady: this.isWatcherReady,
            isScanning: this.isScanning,
            isDeepScanInProgress: this.deepScanInProgress,
            lastScanTime: this.lastScanTime,
            watchedFolderCount: this.watchedFolders.length,
            networkDriveStatus: this.getNetworkDriveStatus(),
            cachedFileCount: this.fileStatsCache.size
        };
    }

    /**
     * Perform a cleanup of the database, removing entries for files that no longer exist
     */
    public async cleanupDeletedFiles(): Promise<void> {
        if (!this.db) {
            console.error('[FileWatcher] Database not initialized, cannot cleanup');
            return;
        }
        
        if (this.isScanning) {
            console.log('[FileWatcher] Scan in progress, deferring cleanup');
            return;
        }
        
        try {
            console.log('[FileWatcher] Starting database cleanup for deleted files');
            this.notifyUI('cleanup-started', {
                timestamp: new Date().toISOString()
            });
            
            // Get all file paths from the database
            const stmt = this.db.prepare('SELECT id, filePath FROM media');
            const files = stmt.all() as Array<{ id: number; filePath: string }>;
            
            console.log(`[FileWatcher] Found ${files.length} files in database to check`);
            
            // Process in small batches to avoid freezing the app
            const BATCH_SIZE = 50;
            let deletedCount = 0;
            let processedCount = 0;
            let batchNumber = 0;
            
            // Delete statement (prepared once outside the loop)
            const deleteStmt = this.db.prepare('DELETE FROM media WHERE id = ?');
            
            for (let i = 0; i < files.length; i += BATCH_SIZE) {
                batchNumber++;
                const batch = files.slice(i, i + BATCH_SIZE);
                
                // Start a transaction for better performance
                this.db.transaction(() => {
                    for (const file of batch) {
                        processedCount++;
                        
                        // Skip files with empty or null paths
                        if (!file.filePath) continue;
                        
                        try {
                            // Check if file exists
                            if (!fsSync.existsSync(file.filePath)) {
                                // File doesn't exist, remove from database
                                deleteStmt.run(file.id);
                                deletedCount++;
                                
                                // Also remove from our cache if it exists
                                this.fileStatsCache.delete(file.filePath);
                                
                                // Debug logging (limit to avoid flooding logs)
                                if (deletedCount <= 20 || deletedCount % 100 === 0) {
                                    console.log(`[FileWatcher] Removed deleted file from database: ${file.filePath}`);
                                }
                            }
                        } catch (error) {
                            console.warn(`[FileWatcher] Error checking file existence: ${file.filePath}`, error);
                        }
                    }
                })();
                
                // Log progress periodically
                if (batchNumber % 10 === 0 || (i + BATCH_SIZE) >= files.length) {
                    console.log(`[FileWatcher] Cleanup progress: ${processedCount}/${files.length} files checked, ${deletedCount} deleted`);
                    
                    // Notify UI of progress
                    this.notifyUI('cleanup-progress', {
                        processedCount,
                        totalCount: files.length,
                        deletedCount,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Pause between batches to avoid blocking UI
                if (i + BATCH_SIZE < files.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            console.log(`[FileWatcher] Cleanup completed: ${deletedCount} deleted files removed from database`);
            
            // Notify UI of completion
            this.notifyUI('cleanup-completed', {
                processedCount,
                deletedCount,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('[FileWatcher] Error during cleanup:', error);
            
            // Notify UI of error
            this.notifyUI('cleanup-error', {
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString()
            });
        }
    }
} 