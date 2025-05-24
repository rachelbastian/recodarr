import { ipcMain, dialog, shell, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import si from 'systeminformation';
import Store from 'electron-store';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import crypto from 'crypto';
import { Node, Edge } from 'reactflow'; // For workflow types

import { getStaticData } from "./test.js"; // Assuming this is still relevant
import { probeFile } from './ffprobeUtils.js';
import { startEncodingProcess } from './ffmpegUtils.js';
import { WatchedFolder, scanMediaFolders, scanSingleFolder } from './scannerUtils.js';
import { getLogBuffer } from './logger.js';
import { getPresets, savePreset, deletePreset } from './presetDatabase.js';
import { FileWatcher } from './fileWatcherUtils.js'; // For type if needed
import TaskScheduler from './schedulerUtils.js'; // For type
import { getDbInstance, updateMediaAfterEncoding as updateMediaDb } from './dbUtils.js'; // For DB operations
import { executeWorkflow } from './workflowExecutor.js'; // Import the workflow executor

// Types that might be shared or defined here if specific to IPC
interface GpuInfo { vendor: string; model: string; memoryTotal: number | null };
interface EncodingOptions { // Ensure this matches the one in main.ts or a shared types file
    inputPath: string;
    outputPath: string;
    overwriteInput?: boolean;
    hwAccel?: 'auto' | 'qsv' | 'nvenc' | 'cuda' | 'vaapi' | 'videotoolbox' | 'none';
    duration?: number;
    outputOptions: string[];
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
    jobId?: string;
    logDirectoryPath?: string;
    progressCallback?: (progress: any) => void; // Consider a more specific type for progress
}

interface FileWatcherRef {
  instance: FileWatcher | null;
}

interface IsScanningRef {
  value: boolean;
}

export function registerAppIpcHandlers(
    ipcMainInstance: typeof ipcMain,
    mainWindowInstance: BrowserWindow | null,
    storeInstance: Store,
    appGetPath: (name: 'userData') => string,
    fileWatcherRef: FileWatcherRef,
    isScanningRef: IsScanningRef,
    logDirInstance: string,
    taskSchedulerInstance: TaskScheduler | null
) {
    const db = getDbInstance(); // Get DB instance for handlers that need it

    // Static Data
    ipcMainInstance.handle("getStaticData", () => getStaticData());

    // Watched Folder Management
    ipcMainInstance.handle('get-watched-folders', async () => storeInstance.get('watchedFolders', []) as WatchedFolder[]);
    
    ipcMainInstance.handle('add-watched-folder', async (_event, folderInfo: Omit<WatchedFolder, 'path'>): Promise<WatchedFolder | null> => {
        if (!mainWindowInstance) throw new Error("Main window not available");
        const result = await dialog.showOpenDialog(mainWindowInstance, { properties: ['openDirectory'] });
        if (result.canceled || result.filePaths.length === 0) return null;
        const folderPath = result.filePaths[0];
        const currentFolders = storeInstance.get('watchedFolders', []) as WatchedFolder[];
        if (currentFolders.some(f => f.path === folderPath)) throw new Error(`Folder already being watched: ${folderPath}`);
        const newFolder: WatchedFolder = { path: folderPath, ...folderInfo };
        currentFolders.push(newFolder);
        storeInstance.set('watchedFolders', currentFolders);
        if (fileWatcherRef.instance) fileWatcherRef.instance.watchPath(folderPath);
        console.log(`Added watched folder: ${JSON.stringify(newFolder)}`);
        return newFolder;
    });

    ipcMainInstance.handle('remove-watched-folder', async (_event, folderPath: string): Promise<void> => {
        const currentFolders = storeInstance.get('watchedFolders', []) as WatchedFolder[];
        const folderToRemove = currentFolders.find(f => f.path === folderPath);

        if (!folderToRemove) {
            console.warn(`Attempted to remove non-existent watched folder: ${folderPath}`);
            return;
        }

        const libraryNameToRemove = folderToRemove.libraryName;

        const updatedFolders = currentFolders.filter(f => f.path !== folderPath);
        storeInstance.set('watchedFolders', updatedFolders);

        if (fileWatcherRef.instance) {
            fileWatcherRef.instance.unwatchPath(folderPath);
        }
        console.log(`Removed watched folder from store and watcher: ${folderPath}`);

        // Now, remove associated media items from the database
        if (libraryNameToRemove) {
            try {
                const currentDb = getDbInstance(); // Ensure you have access to the DB instance
                const result = currentDb.prepare('DELETE FROM media WHERE libraryName = ?').run(libraryNameToRemove);
                console.log(`Removed ${result.changes} media items from database for library: ${libraryNameToRemove}`);
            } catch (dbError) {
                console.error(`Error removing media items from database for library ${libraryNameToRemove}:`, dbError);
                // Decide if you want to throw an error here or just log it
            }
        } else {
            console.warn(`Could not determine libraryName for folderPath: ${folderPath}. Media items in DB might not be cleaned up if they were associated with a different name structure.`);
        }
    });

    // GPU and System Settings
    ipcMainInstance.handle("getAvailableGpus", async (): Promise<GpuInfo[]> => { try { const g = await si.graphics(); return g.controllers.filter(gpu => !gpu.vendor?.includes('Microsoft')).map(gpu => ({ vendor: gpu.vendor ?? 'Unknown', model: gpu.model ?? 'Unknown', memoryTotal: gpu.memoryTotal ?? null })); } catch (e) { console.error("Error fetching GPUs:", e); return []; } });
    ipcMainInstance.handle("getSelectedGpu", async () => storeInstance.get('selectedGpuModel', null) as string | null);
    ipcMainInstance.handle("setSelectedGpu", async (_event, model: string | null) => { if (model === null || model === 'default') storeInstance.delete('selectedGpuModel'); else storeInstance.set('selectedGpuModel', model); });
    ipcMainInstance.handle("getPsGpuMonitoringEnabled", async () => storeInstance.get('enablePsGpuMonitoring', false) as boolean);
    ipcMainInstance.handle("setPsGpuMonitoringEnabled", async (_event, isEnabled: boolean) => storeInstance.set('enablePsGpuMonitoring', isEnabled));
    ipcMainInstance.handle("get-manual-gpu-vram", async () => storeInstance.get('manualGpuVramMb', null) as number | null);
    ipcMainInstance.handle("set-manual-gpu-vram", async (_event, vramMb: number | null) => { if (vramMb === null || typeof vramMb !== 'number' || vramMb <= 0) { storeInstance.delete('manualGpuVramMb'); console.log("Cleared manual GPU VRAM override."); } else { storeInstance.set('manualGpuVramMb', vramMb); console.log(`Set manual GPU VRAM override to: ${vramMb} MB`); } });

    // Scanner Triggers
    ipcMainInstance.handle('trigger-scan', async () => { 
        const currentDb = getDbInstance(); 
        await scanMediaFolders(currentDb, mainWindowInstance, storeInstance.get('watchedFolders', []) as WatchedFolder[], isScanningRef); 
        return { status: 'Manual scan triggered' }; 
    });
    ipcMainInstance.handle('trigger-folder-scan', async (_event, folderPath: string) => { 
        const currentDb = getDbInstance(); 
        await scanSingleFolder(currentDb, folderPath, mainWindowInstance, storeInstance.get('watchedFolders', []) as WatchedFolder[], isScanningRef); 
        return { status: 'Single folder scan triggered' }; 
    });
    ipcMainInstance.handle('force-rescan-all', async () => { if (fileWatcherRef.instance) { await fileWatcherRef.instance.forceRescan(); return { status: 'Force rescan of all watched folders triggered' }; } return { status: 'FileWatcher not available, rescan not triggered' }; });
    
    // Hardware Info
    ipcMainInstance.handle('get-hardware-info', async () => getDbInstance().prepare('SELECT * FROM hardware_info ORDER BY device_type, priority DESC').all());
    ipcMainInstance.handle('update-hardware-priority', async (_event, deviceId: number, priority: number) => getDbInstance().prepare('UPDATE hardware_info SET priority = ? WHERE id = ?').run(priority, deviceId));
    ipcMainInstance.handle('update-hardware-enabled', async (_event, deviceId: number, isEnabled: boolean) => getDbInstance().prepare('UPDATE hardware_info SET is_enabled = ? WHERE id = ?').run(isEnabled, deviceId));
    ipcMainInstance.handle('refresh-hardware-info', async () => getDbInstance().prepare('SELECT * FROM hardware_info ORDER BY device_type, priority DESC').all());

    // FFprobe
    ipcMainInstance.handle('probe-file', async (_event, filePath: string) => { if (!filePath) { console.warn("Probe request no path."); return null; } try { await fs.access(filePath, fs.constants.R_OK); const data = await probeFile(filePath); console.log(`Probe successful: ${filePath}`); return data; } catch (e) { console.error(`Error probing ${filePath}:`, e); return null; } });

    // Encoding
    ipcMainInstance.handle('dialog:showOpen', async (_event, opts) => { if (!mainWindowInstance) throw new Error('Main window N/A'); return dialog.showOpenDialog(mainWindowInstance, opts); });
    ipcMainInstance.handle('dialog:showSave', async (_event, opts) => { if (!mainWindowInstance) throw new Error('Main window N/A'); return dialog.showSaveDialog(mainWindowInstance, opts); });
    
    ipcMainInstance.handle('start-encoding-process', async (_event, options: EncodingOptions) => {
        console.log(`Encoding request: ${options.inputPath} → ${options.outputPath}`);
        try {
            const probeData = await probeFile(options.inputPath);
            if (probeData?.processedByRecodarr?.processed) console.log(`File already processed: ${options.inputPath}`); else console.log(`File not processed or no metadata: ${options.inputPath}`);
            const jobId = options.jobId || crypto.randomUUID();
            const isOverwrite = options.overwriteInput ?? (options.inputPath === options.outputPath);
            const progressCallback = (progress: any) => { if (mainWindowInstance && !mainWindowInstance.isDestroyed()) mainWindowInstance.webContents.send('encodingProgress', { ...progress, jobId }); };
            const fullOptions: EncodingOptions = { ...options, overwriteInput: isOverwrite, progressCallback, jobId, logDirectoryPath: logDirInstance };
            const result = await startEncodingProcess(fullOptions);
            console.log('Encoding finished:', result);
            let finalResult: any = { ...result, jobId };
            if (result.success && result.outputPath) {
                try {
                    const currentPD = await probeFile(result.outputPath);
                    if (currentPD) mainWindowInstance?.webContents.send('encodingProgress', { jobId, status: `Completed. Reduction: ${result.reductionPercent?.toFixed(1) ?? 'N/A'}%.` });
                    else mainWindowInstance?.webContents.send('encodingProgress', { jobId, status: `Succeeded but probe failed. Output: ${result.outputPath}` });
                } catch (updateError) { console.error(`Post-encoding probe error Job ID ${jobId}:`, updateError); mainWindowInstance?.webContents.send('encodingProgress', { jobId, status: `Succeeded but post-probe failed. Output: ${result.outputPath}` });}
            } else if (!result.success) mainWindowInstance?.webContents.send('encodingProgress', { jobId, status: `Encoding failed: ${result.error}` });
            return finalResult;
        } catch (e) { console.error('Error in start-encoding-process:', e); return { success: false, error: e instanceof Error ? e.message : String(e), jobId: options.jobId }; }
    });

    ipcMainInstance.handle('get-encoding-log', async (_event, jobId: string) => {
        if (!jobId) { console.warn("get-encoding-log no Job ID."); return null; }
        const logFilePath = path.join(logDirInstance, `${jobId}.log`);
        try { await fs.access(logFilePath, fs.constants.R_OK); return await fs.readFile(logFilePath, 'utf-8'); }
        catch (e: any) { if (e.code === 'ENOENT') return `Log not found: ${jobId}`; console.error(`Error reading log ${logFilePath}:`, e); return `Error reading log: ${e.message}`; }
    });
    
    // General
    ipcMainInstance.handle('get-initial-logs', async () => getLogBuffer());
    ipcMainInstance.handle('show-confirmation-dialog', async (_event, options) => {
        try { if (!mainWindowInstance || mainWindowInstance.isDestroyed()) { console.error('Cannot show dialog - main window N/A'); return { confirmed: false, error: 'Main window not available' }; }
            const dialogOpts = { type: 'question', buttons: ['Cancel', 'Confirm'], defaultId: 0, title: options.title || 'Confirmation', message: options.message || 'Please confirm', detail: options.detail || '', ...options };
            const result = await dialog.showMessageBox(mainWindowInstance, dialogOpts); return { confirmed: result.response === 1, response: result.response };
        } catch (e) { console.error(`Error showing confirmation dialog:`, e); return { confirmed: false, error: String(e) }; }
    });

    // Encoding Presets
    ipcMainInstance.handle('get-presets', async () => getPresets(getDbInstance()));
    ipcMainInstance.handle('save-preset', async (_event, preset: any) => savePreset(getDbInstance(), preset));
    ipcMainInstance.handle('delete-preset', async (_event, id: string) => deletePreset(getDbInstance(), id));

    // Queue Handlers
    const queueDataPath = path.join(appGetPath('userData'), 'queue.json');
    ipcMainInstance.handle('load-queue-data', async () => { try { await fs.access(queueDataPath, fs.constants.R_OK); const data = await fs.readFile(queueDataPath, 'utf-8'); return JSON.parse(data); } catch (e) { console.log(`Queue data file not found or error:`, e); return { jobs: [] }; } });
    ipcMainInstance.handle('save-queue-data', async (_event, data) => { if (!data || typeof data !== 'object' || !Array.isArray(data.jobs)) { data = { jobs: [] }; console.warn("Invalid queue data, created empty.");} try { await fs.writeFile(queueDataPath, JSON.stringify(data, null, 2), 'utf-8'); return { success: true }; } catch (e) { console.error(`Error saving queue data:`, e); return { success: false, error: String(e) }; } });
    ipcMainInstance.handle('get-file-size', async (_event, filePath) => { if (!filePath) { console.error("get-file-size no path"); return undefined; } try { await fs.access(filePath, fs.constants.R_OK); const stats = await fs.stat(filePath); if (!stats.isFile()) return undefined; return stats.size; } catch (e) { console.error(`Error getting file size ${filePath}:`, e); return undefined; } });
    ipcMainInstance.handle('start-encoding', async (_event, opts: EncodingOptions) => { try { return await startEncodingProcess(opts); } catch (e) { console.error(`Error starting encoding from queue:`, e); return { success: false, error: String(e), jobId: opts.jobId }; } });
    ipcMainInstance.handle('open-encoding-log', async (_event, jobId) => { try { const logFilePath = path.join(logDirInstance, `${jobId}.log`); await fs.access(logFilePath, fs.constants.R_OK); await shell.openPath(logFilePath); return { success: true }; } catch (e) { console.error(`Error opening log file for ${jobId}:`, e); return { success: false, error: String(e) }; } });
    
    // File Operations
    ipcMainInstance.handle('replace-file', async (_event: IpcMainInvokeEvent, sourcePath: string, destinationPath: string): Promise<boolean> => {
        try {
            console.log(`[IPC Handler] Replacing file: ${destinationPath} with ${sourcePath}`);
            if (!sourcePath || !destinationPath) { console.error(`[IPC Handler] Invalid paths: source=${sourcePath}, destination=${destinationPath}`); return false; }
            if (sourcePath === destinationPath) { console.log(`[IPC Handler] Source and destination are the same, no replacement needed`); return true; }
            try {
                const sourceStats = await fs.stat(sourcePath);
                if (!sourceStats.isFile() || sourceStats.size === 0) { console.error(`[IPC Handler] Source file is not valid: ${sourcePath}, size: ${sourceStats.size}`); return false; }
            } catch (error) { console.error(`[IPC Handler] Error accessing source file: ${sourcePath}`, error); return false; }
            const timestamp = new Date().getTime();
            const backupPath = `${destinationPath}.backup-${timestamp}`;
            let backupCreated = false;
            if (fsSync.existsSync(destinationPath)) {
                try {
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try { await fs.rename(destinationPath, backupPath); backupCreated = true; console.log(`[IPC Handler] Created backup at: ${backupPath} (attempt ${attempt})`); break;
                        } catch (backupError) { if (attempt < 3) { await new Promise(resolve => setTimeout(resolve, 500)); } else throw backupError; }
                    }
                } catch (backupError) { console.error(`[IPC Handler] Failed to create backup:`, backupError); }
            }
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await fs.copyFile(sourcePath, destinationPath);
                    const sourceSize = (await fs.stat(sourcePath)).size; const destSize = (await fs.stat(destinationPath)).size;
                    if (sourceSize !== destSize) { if (attempt < 3) { await new Promise(resolve => setTimeout(resolve, 500)); continue; } throw new Error(`File size mismatch: Source=${sourceSize}, Dest=${destSize}`); }
                    console.log(`[IPC Handler] Successfully replaced file (attempt ${attempt})`);
                    try { await fs.unlink(sourcePath); } catch (cleanupError) { console.warn(`[IPC Handler] Could not remove source file:`, cleanupError); }
                    if (backupCreated && fsSync.existsSync(backupPath)) { try { await fs.unlink(backupPath); } catch (cleanupError) { console.warn(`[IPC Handler] Could not remove backup file:`, cleanupError); } }
                    return true;
                } catch (copyError) {
                    if (attempt < 3) { await new Promise(resolve => setTimeout(resolve, 500)); }
                    else { console.error(`[IPC Handler] All replacement attempts failed:`, copyError); if (backupCreated && fsSync.existsSync(backupPath)) { try { await fs.rename(backupPath, destinationPath); console.log(`[IPC Handler] Restored original from backup`); } catch (restoreError) { console.error(`[IPC Handler] Failed to restore from backup:`, restoreError); } } throw copyError; }
                }
            }
            return false;
        } catch (error) { console.error(`[IPC Handler] Fatal error in replaceFile:`, error); return false; }
    });
    ipcMainInstance.handle('delete-file', async (_event, filePath: string): Promise<boolean> => { try { if (fsSync.existsSync(filePath)) { await fs.unlink(filePath); return true; } return false; } catch (e) { console.error(`Error deleting ${filePath}:`, e); return false; } });
    
    ipcMainInstance.handle('finalize-encoded-file', async (_event, params: { tempFilePath: string, finalFilePath: string, jobId: string, isOverwrite: boolean, originalFilePath?: string }) => {
        console.log(`Finalizing: temp=${params.tempFilePath}, final=${params.finalFilePath}, job=${params.jobId}`);
        try {
            if (!params.tempFilePath || !params.finalFilePath) return { success: false, error: "Missing file paths" };
            const tempStats = await fs.stat(params.tempFilePath);
            if (!tempStats.isFile() || tempStats.size === 0) return { success: false, error: `Temp file invalid: ${params.tempFilePath}` };
            const probeData = await probeFile(params.tempFilePath);
            if (!probeData) return { success: false, error: "Failed to probe temp file" };
            let success = false;
            if (params.tempFilePath !== params.finalFilePath) {
                // Using simplified move for now, ensure robust logic is in place if this is used
                await fs.copyFile(params.tempFilePath, params.finalFilePath);
                await fs.unlink(params.tempFilePath);
                success = true;
            } else success = true;
            if (success && params.isOverwrite) {
                const dbPathToUse = params.originalFilePath || params.finalFilePath;
                try { await updateMediaDb(getDbInstance(), probeData, params.jobId, dbPathToUse); }
                catch (dbError) { console.error(`DB update failed post-finalize:`, dbError); }
            }
            return { success: true, finalPath: params.finalFilePath, probeData, message: `Finalized: ${params.finalFilePath}` };
        } catch (e) { console.error(`Error finalizing file:`, e); return { success: false, error: `Finalize error: ${e instanceof Error ? e.message : String(e)}` }; }
    });

    // File Watcher Status & Control
    ipcMainInstance.handle('get-file-watcher-status', async () => { if (!fileWatcherRef.instance) return { isActive: false, isReady: false, isScanning: false, lastScanTime: null, watchedFolders: storeInstance.get('watchedFolders', []) as WatchedFolder[], watchedFolderCount: 0, networkDriveStatus: [] }; const status = fileWatcherRef.instance.getWatcherStatus(); return { ...status, watchedFolders: storeInstance.get('watchedFolders', []) as WatchedFolder[] }; });
    ipcMainInstance.handle('check-network-connectivity', async () => { if (!fileWatcherRef.instance) return { success: false, error: 'File watcher N/A' }; try { await fileWatcherRef.instance.forceRescan(); return { success: true, status: fileWatcherRef.instance.getWatcherStatus() }; } catch (e) { console.error('Error checking network connectivity:', e); return { success: false, error: String(e) }; } });
    ipcMainInstance.handle('trigger-deep-scan', async () => { if (!fileWatcherRef.instance) return { success: false, error: 'File watcher N/A' }; try { await fileWatcherRef.instance.forceRescan(); return { success: true, message: 'Deep scan triggered' }; } catch (e) { console.error('Error triggering deep scan:', e); return { success: false, error: String(e) }; } });
    ipcMainInstance.handle('trigger-cleanup-deleted-files', async () => { if (!fileWatcherRef.instance) return { success: false, error: 'File watcher N/A' }; try { await fileWatcherRef.instance.cleanupDeletedFiles(); return { success: true, message: 'DB cleanup completed' }; } catch (e) { console.error('Error triggering cleanup:', e); return { success: false, error: String(e) }; } });

    // Workflow Management
    ipcMainInstance.handle('save-workflow', async (_event, workflow: { id: string, name: string, description?: string | null, nodes: Node[], edges: Edge[] }) => {
        const { id, name, description, nodes, edges } = workflow;
        console.log(`Saving workflow: id=${id}, name=${name}, nodes=${nodes.length}, edges=${edges.length}`);
        const currentDb = getDbInstance();
        const result = currentDb.transaction(() => {
            const existing = currentDb.prepare('SELECT id FROM workflows WHERE name = ? AND id != ?').get(name, id);
            if (existing) throw new Error(`Workflow name "${name}" already exists.`);
            const current = currentDb.prepare('SELECT id FROM workflows WHERE id = ?').get(id);
            if (current) {
                currentDb.prepare('UPDATE workflows SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, description, id);
                currentDb.prepare('DELETE FROM workflow_nodes WHERE workflow_id = ?').run(id);
                currentDb.prepare('DELETE FROM workflow_edges WHERE workflow_id = ?').run(id);
            } else {
                currentDb.prepare('INSERT INTO workflows (id, name, description) VALUES (?, ?, ?)').run(id, name, description);
            }
            const insertNode = currentDb.prepare('INSERT INTO workflow_nodes (workflow_id, node_id, node_type, label, description, position_x, position_y, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            for (const node of nodes) insertNode.run(id, node.id, node.type || 'default', node.data?.label || '', node.data?.description || '', node.position.x, node.position.y, JSON.stringify(node.data || {}));
            const insertEdge = currentDb.prepare('INSERT INTO workflow_edges (workflow_id, edge_id, source_node_id, target_node_id) VALUES (?, ?, ?, ?)');
            for (const edge of edges) insertEdge.run(id, edge.id, edge.source, edge.target);
            return { success: true, id };
        })();
        
        // Reload workflow tasks in the scheduler after saving the workflow
        if (taskSchedulerInstance && result.success) {
            try {
                await taskSchedulerInstance.reloadWorkflowTasks();
                console.log(`[Save Workflow] Scheduler reloaded workflow tasks for workflow: ${name}`);
            } catch (error) {
                console.error(`[Save Workflow] Error reloading workflow tasks for workflow ${name}:`, error);
                // Don't fail the save operation if scheduler reload fails
            }
        }
        
        return result;
    });
    ipcMainInstance.handle('get-workflows', async () => getDbInstance().prepare('SELECT id, name, description, created_at, updated_at, is_active FROM workflows ORDER BY updated_at DESC').all());
    ipcMainInstance.handle('get-workflow', async (_event, workflowId: string) => {
        const currentDb = getDbInstance();
        const workflow = currentDb.prepare('SELECT id, name, description, created_at, updated_at, is_active FROM workflows WHERE id = ?').get(workflowId);
        if (!workflow) return { id: workflowId, name: 'New Workflow', description: '', nodes: [], edges: [] };
        const nodes = currentDb.prepare('SELECT node_id, node_type, label, description, position_x, position_y, data FROM workflow_nodes WHERE workflow_id = ?').all(workflowId);
        const edges = currentDb.prepare('SELECT edge_id, source_node_id, target_node_id FROM workflow_edges WHERE workflow_id = ?').all(workflowId);
        return { ...workflow, nodes: nodes.map((n: any) => ({ id: n.node_id, type: n.node_type, position: { x: n.position_x, y: n.position_y }, data: JSON.parse(n.data) })), edges: edges.map((e: any) => ({ id: e.edge_id, source: e.source_node_id, target: e.target_node_id })) };
    });
    ipcMainInstance.handle('delete-workflow', async (_event, workflowId: string) => {
        const currentDb = getDbInstance();
        return currentDb.transaction(() => {
            currentDb.prepare('DELETE FROM workflow_nodes WHERE workflow_id = ?').run(workflowId);
            currentDb.prepare('DELETE FROM workflow_edges WHERE workflow_id = ?').run(workflowId);
            return currentDb.prepare('DELETE FROM workflows WHERE id = ?').run(workflowId).changes > 0;
        })();
    });
    ipcMainInstance.handle('execute-manual-workflow', async (_event, workflowId: string, triggerNodeId: string) => {
        console.log(`Manual run request received: workflow=${workflowId}, trigger=${triggerNodeId}`);
        const currentDb = getDbInstance();
        const executionId = crypto.randomUUID(); // Generate a unique ID for this execution

        try {
            // Call the dedicated workflow executor, now passing the executionId
            const result = await executeWorkflow(workflowId, triggerNodeId, currentDb, mainWindowInstance, executionId);
            console.log(`Workflow execution result: Success=${result.success}, Message=${result.message}, ExecutionID=${executionId}`);
            return { ...result, executionId }; // Return the result from the executor, including executionId

        } catch (error) {
            // Catch any unexpected errors during the executor call itself
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Critical error during manual workflow execution for ${workflowId} (ExecutionID: ${executionId}):`, error);
            
            // Attempt to log failure to DB even if executeWorkflow itself failed catastrophically before it could log
            try {
                currentDb.prepare(
                    'INSERT INTO workflow_executions (id, workflow_id, trigger_node_id, started_at, completed_at, status, error_message) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'), ?, ?)'
                ).run(executionId, workflowId, triggerNodeId, 'error', `Critical executor error: ${errorMsg}`);
            } catch (dbError) {
                console.error(`Failed to log critical executor error to DB for ExecutionID ${executionId}:`, dbError);
            }

            // Attempt to notify UI if possible
            mainWindowInstance?.webContents.send('workflow-status', { workflowId, executionId, status: 'error', message: `Critical Error: ${errorMsg}` });
            return { success: false, message: `Critical error executing workflow: ${errorMsg}`, executionId };
        }
    });

    // Workflow Execution Logs
    ipcMainInstance.handle('get-workflow-executions', async (_event, limit: number = 50) => {
        console.log(`[IPC Handler] Request received for workflow executions (limit: ${limit})`);
        const currentDb = getDbInstance();
        try {
            const stmt = currentDb.prepare(`
                SELECT
                    we.id,
                    we.workflow_id,
                    w.name AS workflow_name,
                    we.started_at,
                    we.completed_at,
                    we.status,
                    we.error_message,
                    we.trigger_node_id
                FROM workflow_executions we
                JOIN workflows w ON we.workflow_id = w.id
                ORDER BY we.started_at DESC
                LIMIT ?
            `);
            const results = stmt.all(limit);
            console.log(`[IPC Handler] Found ${results.length} workflow execution records.`);
            return results;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[IPC Handler] Error fetching workflow executions:`, error);
            // It's better to return an empty array or throw an error that the frontend can handle
            // Throwing might be better for indicating a real issue
            throw new Error(`Failed to fetch workflow executions: ${errorMsg}`);
            // return []; // Alternatively, return empty array on error
        }
    });

    // Scheduler IPC Handlers
    if (taskSchedulerInstance) {
        ipcMainInstance.handle('scheduler:getAllTasks', async () => taskSchedulerInstance.getAllTasks());
        ipcMainInstance.handle('scheduler:addTask', async (_, task) => taskSchedulerInstance.addTask(task));
        ipcMainInstance.handle('scheduler:updateTask', async (_, taskId, updates) => taskSchedulerInstance.updateTask(taskId, updates));
        ipcMainInstance.handle('scheduler:toggleTask', async (_, taskId, enabled) => taskSchedulerInstance.toggleTaskEnabled(taskId, enabled));
        ipcMainInstance.handle('scheduler:deleteTask', async (_, taskId) => taskSchedulerInstance.deleteTask(taskId));
        ipcMainInstance.handle('scheduler:runTaskNow', async (_, taskId) => taskSchedulerInstance.runTaskNow(taskId));
        ipcMainInstance.handle('scheduler:getConfigValue', async (_, key) => storeInstance.get(key));
        ipcMainInstance.handle('scheduler:setConfigValue', async (_, key, value) => { storeInstance.set(key, value); return true; });
        ipcMainInstance.handle('scheduler:reloadWorkflowTasks', async () => taskSchedulerInstance.reloadWorkflowTasks());
        
        // Debug handler to check scheduler status
        ipcMainInstance.handle('scheduler:debug', async () => {
            const allTasks = taskSchedulerInstance.getAllTasks();
            const debugInfo = {
                schedulerInitialized: true,
                totalTasks: allTasks.length,
                enabledTasks: allTasks.filter(t => t.enabled).length,
                activeJobs: (taskSchedulerInstance as any).jobs?.size || 0, // Access private jobs map
                tasks: allTasks.map(task => ({
                    id: task.id,
                    name: task.name,
                    type: task.type,
                    enabled: task.enabled,
                    cronExpression: task.cronExpression,
                    lastRun: task.lastRun?.toISOString(),
                    nextRun: task.nextRun?.toISOString(),
                    parameters: task.parameters
                }))
            };
            console.log('[Scheduler Debug]', debugInfo);
            return debugInfo;
        });
    } else {
        console.warn("[IPC Setup] TaskScheduler instance not available, scheduler IPC handlers not registered.");
        
        // Add debug handler that reports scheduler not available
        ipcMainInstance.handle('scheduler:debug', async () => ({
            schedulerInitialized: false,
            error: 'TaskScheduler instance not available'
        }));
    }

    console.log("[IPC Handlers] All application IPC handlers registered.");
}
