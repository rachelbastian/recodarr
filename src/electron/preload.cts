/// <reference types="../../types" />
import electron from "electron";
// Explicitly import types that ARE working and needed
import type { 
    EventPayloadMapping, 
    WatchedFolder, 
    Statistics, 
    SystemStats, 
    GpuInfo, 
    HardwareInfo, 
    Workflow, 
    WorkflowDetails, 
    StaticData,
} from "../../types.js" assert { "resolution-mode": "import" }; 
import { Node, Edge } from 'reactflow'; // Keep reactflow types if needed

// Define the type for the electron API exposed on the window object
// Match this with the IElectronAPI in types.d.ts
// Use the globally defined Window.electron type if possible, or redefine locally
type ElectronApi = LocalElectronApi;

// --- Manually define types needed for the API --- 
// These should match src/types.d.ts but are defined locally

// Local definition for UnsubscribeFunction
type UnsubscribeFunction = () => void;

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
    subscribeScanStatus: (callback: (payload: EventPayloadMapping['scan-status-update']) => void) => UnsubscribeFunction;
    getManualGpuVram: () => Promise<number | null>;
    setManualGpuVram: (vramMb: number | null) => Promise<void>;
    getHardwareInfo: () => Promise<HardwareInfo[]>;
    updateHardwarePriority: (deviceId: number, priority: number) => Promise<void>;
    updateHardwareEnabled: (deviceId: number, isEnabled: boolean) => Promise<void>;
    refreshHardwareInfo: () => Promise<HardwareInfo[]>;
    getWorkflows: () => Promise<Workflow[]>;
    getWorkflowDetails: (id: number) => Promise<WorkflowDetails | null>;
    saveWorkflow: (workflowData: { id?: number; name: string; description: string; nodes: Node[]; edges: Edge[] }) => Promise<number>;
    deleteWorkflow: (id: number) => Promise<{ changes: number }>;

    // Add the new methods with locally defined types
    probeFile: (filePath: string) => Promise<ProbeData | null>;
    startEncodingProcess: (options: EncodingOptions) => Promise<EncodingResult>;
    subscribeEncodingProgress: (callback: (data: { progress?: number; status?: string }) => void) => UnsubscribeFunction;
    unsubscribeEncodingProgress: () => void; 
    showOpenDialog: (options: DialogOptions) => Promise<DialogResult>; 
    showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogResult>; 
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
    subscribeScanStatus: (callback) => ipcOn("scan-status-update", callback),
    getManualGpuVram: () => ipcInvoke("get-manual-gpu-vram"),
    setManualGpuVram: (vramMb) => ipcInvoke("set-manual-gpu-vram", vramMb),
    getHardwareInfo: () => ipcInvoke("get-hardware-info"),
    updateHardwarePriority: (deviceId, priority) => ipcInvoke("update-hardware-priority", deviceId, priority),
    updateHardwareEnabled: (deviceId, isEnabled) => ipcInvoke("update-hardware-enabled", deviceId, isEnabled),
    refreshHardwareInfo: () => ipcInvoke("refresh-hardware-info"),
    getWorkflows: () => ipcInvoke('get-workflows'),
    getWorkflowDetails: (id) => ipcInvoke('get-workflow-details', id),
    saveWorkflow: (workflowData: any) => ipcInvoke('save-workflow', workflowData), // Use any if type causes issues
    deleteWorkflow: (id) => ipcInvoke('delete-workflow', id),
    
    // --- Implementations for New Methods ---
    probeFile: (filePath: string) => ipcInvoke('probe-file', filePath),
    startEncodingProcess: (options: EncodingOptions) => ipcInvoke('start-encoding-process', options), 
    subscribeEncodingProgress: (callback: (data: { progress?: number; status?: string }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
        electron.ipcRenderer.on('encodingProgress', listener);
        return () => {
            electron.ipcRenderer.removeListener('encodingProgress', listener);
        };
    },
    unsubscribeEncodingProgress: () => {
        electron.ipcRenderer.removeAllListeners('encodingProgress'); 
    },
    showOpenDialog: (options: DialogOptions) => ipcInvoke('dialog:showOpen', options), 
    showSaveDialog: (options: SaveDialogOptions) => ipcInvoke('dialog:showSave', options), 

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
