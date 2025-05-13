/// <reference types="../types" />
import electron from "electron";
// Explicitly import types that ARE working and needed
import type { 
    EventPayloadMapping, 
    WatchedFolder, 
    Statistics, 
    SystemStats, 
    GpuInfo, 
    HardwareInfo, 
    // Workflow,  // Removed
    // WorkflowDetails,  // Removed
    StaticData,
    // LogEntry // Add LogEntry if defined in types.d.ts - Removed
} from "../types.js" assert { "resolution-mode": "import" }; 
import { Node, Edge } from 'reactflow'; // Keep reactflow types if needed

// Define the type for the electron API exposed on the window object
// Match this with the IElectronAPI in types.d.ts
// Use the globally defined Window.electron type if possible, or redefine locally
type ElectronApi = LocalElectronApi;

// --- Manually define types needed for the API --- 
// These should match src/types.d.ts but are defined locally

// Local definition for UnsubscribeFunction
type UnsubscribeFunction = () => void;

// --- Add LogEntry type if not imported from types.d.ts ---
interface LocalLogEntry {
    timestamp: string;
    level: 'log' | 'warn' | 'error' | 'debug' | 'verbose'; 
    message: string;
}
// --- End LogEntry --- 

// --- Add back missing ProbeData structure --- 
interface StreamInfo {
    index: number;
    codec_name?: string;
    codec_long_name?: string;
    codec_type: 'video' | 'audio' | 'subtitle' | 'data' | 'attachment';
    width?: number;
    height?: number;
    pix_fmt?: string;
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
    tags?: { language?: string; title?: string; [key: string]: string | undefined };
    [key: string]: any; 
}

interface FormatInfo {
    filename: string;
    nb_streams: number;
    format_name: string;
    format_long_name: string;
    start_time?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
    probe_score?: number;
    tags?: { [key: string]: string | undefined };
    [key: string]: any; 
}

interface ProbeData {
    streams: StreamInfo[];
    format: FormatInfo;
}
// --- End ProbeData --- 

interface EncodingProgress {
    percent?: number;
    fps?: number;
    elapsed?: number; // in seconds
    frame?: number;
    totalFrames?: number;
    status?: string;
}

interface EncodingOptions {
    inputPath: string;
    outputPath: string;
    videoCodec?: string; 
    videoPreset?: string; 
    videoQuality?: number | string; 
    lookAhead?: number; 
    pixelFormat?: string; 
    audioCodec?: string; 
    audioBitrate?: string; 
    audioFilter?: string; 
    subtitleCodec?: string; 
    mapSubtitle?: string[];
    hwAccel?: 'auto' | 'qsv' | 'nvenc' | 'cuda' | 'vaapi' | 'videotoolbox' | 'none';
    mapVideo?: string; 
    mapAudio?: string; 
    audioOptions?: string[];
    duration?: number; 
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
}

interface DialogOptions {
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>;
    filters?: Array<{ name: string; extensions: string[] }>;
}

interface SaveDialogOptions {
    filters?: Array<{ name: string; extensions: string[] }>;
}

interface DialogResult {
    canceled: boolean;
    filePaths: string[];
}

interface SaveDialogResult {
    canceled: boolean;
    filePath?: string;
}

// Define finalizeParams interface
interface FinalizeEncodedFileParams {
    tempFilePath: string;
    finalFilePath: string;
    jobId: string;
    isOverwrite: boolean;
    originalFilePath?: string;
}

// Define finalizeResult interface
interface FinalizeEncodedFileResult {
    success: boolean;
    finalPath?: string;
    probeData?: any;
    message?: string;
    error?: string;
}

// Define the API structure locally using locally defined types
type LocalElectronApi = {
    // Keep existing working methods
    subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
    getStaticData: () => Promise<StaticData>;
    subscribeSystemStats: (callback: (stats: SystemStats) => void) => UnsubscribeFunction;
    getAvailableGpus: () => Promise<GpuInfo[]>;
    getSelectedGpu: () => Promise<string | null>;
    setSelectedGpu: (model: string | null) => Promise<void>;
    getPsGpuMonitoringEnabled: () => Promise<boolean>;
    setPsGpuMonitoringEnabled: (isEnabled: boolean) => Promise<void>;
    dbQuery: (sql: string, params?: any[]) => Promise<any>;
    getWatchedFolders: () => Promise<WatchedFolder[]>;
    addWatchedFolder: (folderInfo: Omit<WatchedFolder, 'path'>) => Promise<WatchedFolder | null>;
    removeWatchedFolder: (folderPath: string) => Promise<void>;
    triggerScan: () => Promise<{ status: string }>;
    triggerFolderScan: (folderPath: string) => Promise<{ status: string }>;
    subscribeScanStatus: (callback: (payload: EventPayloadMapping['scan-status-update']) => void) => UnsubscribeFunction;
    getManualGpuVram: () => Promise<number | null>;
    setManualGpuVram: (vramMb: number | null) => Promise<void>;
    getHardwareInfo: () => Promise<HardwareInfo[]>;
    updateHardwarePriority: (deviceId: number, priority: number) => Promise<void>;
    updateHardwareEnabled: (deviceId: number, isEnabled: boolean) => Promise<void>;
    refreshHardwareInfo: () => Promise<HardwareInfo[]>;
    
    // Add scheduler-related methods
    getAllScheduledTasks: () => Promise<any[]>;
    addScheduledTask: (task: any) => Promise<any>;
    updateScheduledTask: (taskId: string, updates: any) => Promise<any>;
    toggleScheduledTask: (taskId: string, enabled: boolean) => Promise<any>;
    deleteScheduledTask: (taskId: string) => Promise<boolean>;
    runScheduledTaskNow: (taskId: string) => Promise<void>;
    getConfigValue: (key: string) => Promise<any>;
    setConfigValue: (key: string, value: any) => Promise<boolean>;
    
    // Workflow-related methods
    getWorkflows: () => Promise<any[]>;
    getWorkflow: (id: string) => Promise<any>;
    saveWorkflow: (workflowData: { id: string; name: string; description?: string | null; nodes: Node[]; edges: Edge[] }) => Promise<any>;
    deleteWorkflow: (id: string) => Promise<boolean>;
    executeManualWorkflow: (workflowId: string, triggerNodeId: string) => Promise<{ success: boolean; message?: string }>;

    // --- Workflow Execution Logs ---
    getWorkflowExecutions: (limit?: number) => Promise<any[]>;

    // --- Encoding Presets --- 
    getPresets: () => Promise<EncodingPreset[]>;
    savePreset: (preset: EncodingPreset) => Promise<string>;
    deletePreset: (id: string) => Promise<void>;
    
    // --- Encoding Methods --- 
    probeFile: (filePath: string) => Promise<any>;
    startEncodingProcess: (options: EncodingOptions) => Promise<any>;
    getEncodingLog: (jobId: string) => Promise<string | null>;
    subscribeEncodingProgress: (callback: (data: { progress?: number; status?: string; fps?: number; elapsed?: number; frame?: number; totalFrames?: number, jobId?: string }) => void) => UnsubscribeFunction;
    unsubscribeEncodingProgress: () => void;
    finalizeEncodedFile: (params: FinalizeEncodedFileParams) => Promise<FinalizeEncodedFileResult>;
    
    // --- Dialog Methods ---
    showOpenDialog: (options: DialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;
    showSaveDialog: (options: SaveDialogOptions) => Promise<{ canceled: boolean; filePath?: string }>;
    
    // --- Logger Methods ---
    subscribeToLogs: (callback: (logEntry: LocalLogEntry) => void) => UnsubscribeFunction;
    getInitialLogs: () => Promise<LocalLogEntry[]>;
    showConfirmationDialog: (options: DialogOptions) => Promise<DialogResult>;

    // --- Queue Methods ---
    loadQueueData: () => Promise<any>;
    saveQueueData: (data: any) => Promise<{ success: boolean }>;
    getFileSize: (filePath: string) => Promise<number | undefined>;
    startEncoding: (options: any) => Promise<any>;
    openEncodingLog: (jobId: string) => Promise<{ success: boolean; error?: string }>;
    replaceFile: (sourcePath: string, destinationPath: string) => Promise<boolean>;
    deleteFile: (filePath: string) => Promise<boolean>;
};

// Expose methods using the locally defined types
electron.contextBridge.exposeInMainWorld("electron", {
    // Keep existing implementations...
    subscribeStatistics: (callback) => ipcOn("statistics", callback),
    getStaticData: () => ipcInvoke("getStaticData"),
    subscribeSystemStats: (callback) => ipcOn("system-stats-update", callback),
    getAvailableGpus: () => ipcInvoke("getAvailableGpus"),
    getSelectedGpu: () => ipcInvoke("getSelectedGpu"),
    setSelectedGpu: (model) => ipcInvoke("setSelectedGpu", model),
    getPsGpuMonitoringEnabled: () => ipcInvoke("getPsGpuMonitoringEnabled"),
    setPsGpuMonitoringEnabled: (isEnabled) => ipcInvoke("setPsGpuMonitoringEnabled", isEnabled),
    dbQuery: (sql, params = []) => ipcInvoke("db-query", sql, params),
    getWatchedFolders: () => ipcInvoke('get-watched-folders'),
    addWatchedFolder: (folderInfo) => ipcInvoke('add-watched-folder', folderInfo),
    removeWatchedFolder: (folderPath) => ipcInvoke('remove-watched-folder', folderPath),
    triggerScan: () => ipcInvoke('trigger-scan'),
    triggerFolderScan: (folderPath) => ipcInvoke('trigger-folder-scan', folderPath),
    subscribeScanStatus: (callback) => ipcOn("scan-status-update", callback),
    getManualGpuVram: () => ipcInvoke("get-manual-gpu-vram"),
    setManualGpuVram: (vramMb) => ipcInvoke("set-manual-gpu-vram", vramMb),
    getHardwareInfo: () => ipcInvoke("get-hardware-info"),
    updateHardwarePriority: (deviceId, priority) => ipcInvoke("update-hardware-priority", deviceId, priority),
    updateHardwareEnabled: (deviceId, isEnabled) => ipcInvoke("update-hardware-enabled", deviceId, isEnabled),
    refreshHardwareInfo: () => ipcInvoke("refresh-hardware-info"),
    
    // Add scheduler-related methods
    getAllScheduledTasks: () => ipcInvoke('scheduler:getAllTasks'),
    addScheduledTask: (task) => ipcInvoke('scheduler:addTask', task),
    updateScheduledTask: (taskId, updates) => ipcInvoke('scheduler:updateTask', taskId, updates),
    toggleScheduledTask: (taskId, enabled) => ipcInvoke('scheduler:toggleTask', taskId, enabled),
    deleteScheduledTask: (taskId) => ipcInvoke('scheduler:deleteTask', taskId),
    runScheduledTaskNow: (taskId) => ipcInvoke('scheduler:runTaskNow', taskId),
    getConfigValue: (key) => ipcInvoke('scheduler:getConfigValue', key),
    setConfigValue: (key, value) => ipcInvoke('scheduler:setConfigValue', key, value),
    
    // Workflow-related methods
    getWorkflows: () => ipcInvoke('get-workflows'),
    getWorkflow: (id: string) => ipcInvoke('get-workflow', id),
    saveWorkflow: (workflowData: { id: string; name: string; description?: string | null; nodes: Node[]; edges: Edge[] }) => ipcInvoke('save-workflow', workflowData),
    deleteWorkflow: (id: string) => ipcInvoke('delete-workflow', id),
    executeManualWorkflow: (workflowId: string, triggerNodeId: string) => ipcInvoke('execute-manual-workflow', workflowId, triggerNodeId),

    // --- Workflow Execution Logs ---
    getWorkflowExecutions: (limit: number = 50) => ipcInvoke('get-workflow-executions', limit),
    
    // --- Encoding Preset Implementations ---
    getPresets: () => ipcInvoke('get-presets'),
    savePreset: (preset) => ipcInvoke('save-preset', preset),
    deletePreset: (id) => ipcInvoke('delete-preset', id),
    
    // --- Implementations for New Methods ---
    probeFile: (filePath: string) => ipcInvoke('probe-file', filePath),
    startEncodingProcess: (options: EncodingOptions) => ipcInvoke('start-encoding-process', options), 
    getEncodingLog: (jobId: string) => ipcInvoke('get-encoding-log', jobId),
    subscribeEncodingProgress: (callback: (data: { progress?: number; status?: string; fps?: number; elapsed?: number; frame?: number; totalFrames?: number }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, data: any) => {
            console.log('[Preload] Received encoding progress:', data);
            callback(data);
        };
        electron.ipcRenderer.on('encodingProgress', listener);
        return () => {
            electron.ipcRenderer.removeListener('encodingProgress', listener);
        };
    },
    unsubscribeEncodingProgress: () => {
        electron.ipcRenderer.removeAllListeners('encodingProgress'); 
    },
    finalizeEncodedFile: (params: FinalizeEncodedFileParams) => ipcInvoke('finalize-encoded-file', params),
    showOpenDialog: (options: DialogOptions) => ipcInvoke('dialog:showOpen', options), 
    showSaveDialog: (options: SaveDialogOptions) => ipcInvoke('dialog:showSave', options), 

    // --- Logger Methods --- 
    subscribeToLogs: (callback: (logEntry: LocalLogEntry) => void) => {
        // Use the ipcOn helper which returns an unsubscribe function
        return ipcOn<LocalLogEntry>('log-message', callback);
    },
    getInitialLogs: () => ipcInvoke<LocalLogEntry[]>('get-initial-logs'),

    // Add function to show confirmation dialog
    showConfirmationDialog: (options: DialogOptions) => ipcInvoke('show-confirmation-dialog', options),

    // --- Queue Methods ---
    loadQueueData: () => ipcInvoke('load-queue-data'),
    saveQueueData: (data) => ipcInvoke('save-queue-data', data),
    getFileSize: (filePath) => ipcInvoke('get-file-size', filePath),
    startEncoding: (options) => ipcInvoke('start-encoding', options),
    openEncodingLog: (jobId) => ipcInvoke('open-encoding-log', jobId),
    replaceFile: (sourcePath, destinationPath) => ipcInvoke('replace-file', sourcePath, destinationPath),
    deleteFile: (filePath) => ipcInvoke('delete-file', filePath),

} satisfies LocalElectronApi); // Satisfy against the local type

// --- Helper Functions ---
// (Keep existing helpers ipcInvoke, ipcOn)

// Generic ipcInvoke
function ipcInvoke<T = any>(channel: string, ...args: any[]): Promise<T> {
    return electron.ipcRenderer.invoke(channel, ...args);
}

// Generic ipcOn with cleanup function
// Use the locally defined UnsubscribeFunction type here
function ipcOn<T = any>(channel: string, callback: (payload: T) => void): UnsubscribeFunction {
    const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
    electron.ipcRenderer.on(channel, listener);
    // Return an unsubscribe function
    return () => electron.ipcRenderer.removeListener(channel, listener);
}

// --- Add EncodingPreset type locally if not imported ---
// (Copied from Presets.tsx for preload context)
const VIDEO_CODECS = ['hevc_qsv', 'h264_qsv', 'av1_qsv', 'libx265', 'libx264', 'copy'] as const;
type VideoCodec = typeof VIDEO_CODECS[number];
const VIDEO_PRESETS = ['veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'ultrafast'] as const;
type VideoPreset = typeof VIDEO_PRESETS[number];
const VIDEO_RESOLUTIONS = ['original', '480p', '720p', '1080p', '1440p', '2160p'] as const;
type VideoResolution = typeof VIDEO_RESOLUTIONS[number];
const AUDIO_CODECS_CONVERT = ['libopus', 'aac', 'eac3'] as const;
type AudioCodecConvert = typeof AUDIO_CODECS_CONVERT[number];
const SUBTITLE_CODECS_CONVERT = ['srt', 'mov_text'] as const;
type SubtitleCodecConvert = typeof SUBTITLE_CODECS_CONVERT[number];
const HW_ACCEL_OPTIONS = ['auto', 'qsv', 'nvenc', 'cuda', 'none'] as const;
type HwAccel = typeof HW_ACCEL_OPTIONS[number];
const AUDIO_LAYOUT_OPTIONS = ['stereo', 'mono', 'surround5_1'] as const;
type AudioLayout = typeof AUDIO_LAYOUT_OPTIONS[number];

interface EncodingPreset {
    id: string;
    name: string;
    videoCodec?: VideoCodec;
    videoPreset?: VideoPreset;
    videoQuality?: number;
    videoResolution?: VideoResolution;
    hwAccel?: HwAccel;
    audioCodecConvert?: AudioCodecConvert;
    audioBitrate?: string;
    selectedAudioLayout?: AudioLayout;
    subtitleCodecConvert?: SubtitleCodecConvert;
    audioLanguageOrder?: string[];
}
// --- End EncodingPreset local type definition ---
