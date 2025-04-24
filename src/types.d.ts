// --- FFprobe Types --- 
export interface StreamInfo {
    index: number;
    codec_name?: string;
    codec_long_name?: string;
    codec_type: 'video' | 'audio' | 'subtitle' | 'data' | 'attachment';
    // Video specific
    width?: number;
    height?: number;
    pix_fmt?: string;
    // Audio specific
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
    // Common
    tags?: { [key: string]: string; language?: string; title?: string };
    // Add other relevant fields from ffprobe output as needed
    [key: string]: any; // Allow other properties
}

export interface FormatInfo {
    filename: string;
    nb_streams: number;
    format_name: string;
    format_long_name: string;
    start_time?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
    probe_score?: number;
    tags?: { [key: string]: string };
    // Add other relevant fields
    [key: string]: any; // Allow other properties
}

export interface ProbeData {
    streams: StreamInfo[];
    format: FormatInfo;
}


// --- Encoding Types --- 
export interface EncodingProgress {
    percent?: number;
}

export interface EncodingOptions {
    inputPath: string;
    outputPath: string;
    // Video options
    videoCodec?: string; 
    videoPreset?: string; 
    videoQuality?: number | string; 
    lookAhead?: number; 
    pixelFormat?: string; 
    mapVideo?: string; 
    // Audio options
    audioCodec?: string; 
    audioBitrate?: string; 
    audioFilter?: string; 
    mapAudio?: string; 
    // Subtitle options
    subtitleCodec?: string; 
    mapSubtitle?: string[];
    // General options
    hwAccel?: 'auto' | 'qsv' | 'nvenc' | 'cuda' | 'vaapi' | 'videotoolbox' | 'none';
    duration?: number; 
    // Removed outputOptions
    // outputOptions: string[]; 
    // Removed progressCallback - main process only
}

export interface EncodingResult {
    success: boolean;
    outputPath?: string;
    error?: string;
    initialSizeMB?: number;
    finalSizeMB?: number;
    reductionPercent?: number;
}

// --- Dialog Types --- (Keep existing)
interface DialogOptions {
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>;
    filters?: Array<{ name: string; extensions: string[] }>;
}

interface SaveDialogOptions {
    defaultPath?: string; // Add optional defaultPath
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

// --- Electron API Interface --- 
// Add other existing/required types if not already present
export interface GpuInfo { vendor: string; model: string; memoryTotal: number | null };
export interface Workflow {}; // Placeholder
export interface WorkflowDetails {}; // Placeholder
export interface HardwareInfo {}; // Placeholder
export interface Statistics {}; // Placeholder
export interface SystemStats {}; // Placeholder
export interface StaticData {}; // Placeholder
export interface WatchedFolder {}; // Placeholder
export interface EventPayloadMapping { 'scan-status-update': any }; // Placeholder
export type UnsubscribeFunction = () => void;
// End other existing types

export interface IElectronAPI {
    // File Dialog Methods
    showOpenDialog: (options: DialogOptions) => Promise<DialogResult>;
    showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogResult>;

    // FFprobe Method
    probeFile: (filePath: string) => Promise<ProbeData | null>;

    // Encoding Process Methods
    startEncodingProcess: (options: EncodingOptions) => Promise<EncodingResult>; // Options type is updated
    subscribeEncodingProgress: (callback: (data: { progress?: number; status?: string }) => void) => UnsubscribeFunction;
    unsubscribeEncodingProgress: () => void;

    // --- Include other existing API methods --- 
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
    saveWorkflow: (workflowData: { id?: number; name: string; description: string; nodes: any[]; edges: any[] }) => Promise<number>; // Use any for Node/Edge if reactflow types aren't imported
    deleteWorkflow: (id: number) => Promise<{ changes: number }>;
    // --- End other existing API methods --- 
}

// Extend the Window interface
declare global {
    interface Window {
        electron: IElectronAPI;
    }
} 