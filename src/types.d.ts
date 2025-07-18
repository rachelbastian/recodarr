import { Node, Edge } from 'reactflow';

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
    processedByRecodarr?: {
        processed: boolean;
        date: string;
        videoCodec: string;
        audioCodec: string;
    };
}


// --- Encoding Types --- 
export interface EncodingProgress {
    percent?: number;
}

export interface EncodingOptions {
    inputPath: string;
    outputPath: string;
    overwriteInput?: boolean; // Flag for overwriting input
    // Video options
    videoCodec?: string; 
    videoPreset?: string; 
    videoQuality?: number | string; 
    lookAhead?: number; 
    pixelFormat?: string; 
    mapVideo?: string; 
    videoFilter?: string; // For resolution/scaling
    resolution?: string; // For explicit resolution
    // Audio options
    audioCodec?: string; 
    audioBitrate?: string; 
    audioFilter?: string; 
    mapAudio?: string; 
    audioOptions?: string[]; // For additional audio codec options
    // Subtitle options
    subtitleCodec?: string; 
    mapSubtitle?: string[]; // Array for multiple subtitle tracks
    // General options
    hwAccel?: 'auto' | 'qsv' | 'nvenc' | 'cuda' | 'vaapi' | 'videotoolbox' | 'none';
    duration?: number;
    // --- For logging ---
    jobId?: string;
    logDirectoryPath?: string;
    // Internal callback
    progressCallback?: (progress: EncodingProgress) => void;
    metadataOutput?: string[]; // Added for custom output metadata
}

export interface EncodingResult {
    success: boolean;
    outputPath?: string;
    error?: string;
    initialSizeMB?: number;
    finalSizeMB?: number;
    reductionPercent?: number;
    jobId?: string; // Add jobId for tracking
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
// --- Copied from root types.d.ts ---
export interface GpuInfo { 
    vendor: string; 
    model: string; 
    memoryTotal: number | null; // Added total memory detected by SI
};

// Workflow interfaces are disabled but kept for reference
/*
export interface Workflow {
    id: number;
    name: string;
    description: string;
};
export interface WorkflowDetails extends Workflow {
    nodes: Node[]; // Make sure Node/Edge are imported if needed here
    edges: Edge[];
};
*/

export interface HardwareInfo {
    id: number;
    device_type: 'CPU' | 'GPU';
    vendor: string;
    model: string;
    cores_threads: number | null;
    base_clock_mhz: number | null;
    memory_mb: number | null;
    is_enabled: boolean;
    priority: number;
    added_at: string;
    last_updated: string;
};
export interface Statistics {
    cpuUsage: number;
    ramUsage: number;
    storageData: number;
};
export interface SystemStats {
    cpuLoad: number | null;
    memLoad: number | null;
    gpuLoad: number | null;
    gpuMemoryUsed: number | null;
    gpuMemoryTotal: number | null;
    gpuMemoryUsagePercent?: number | null; // Added optional GPU memory usage percentage
    // Additional Intel GPU metrics (when PresentMon is available)
    gpuTemperature?: number | null; // GPU temperature in Celsius
    gpuPowerDraw?: number | null; // GPU power draw in watts
    intelPresentMonActive?: boolean; // Indicates if Intel PresentMon is being used for metrics
    error?: string;
};
export interface StaticData {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
};
export interface WatchedFolder {
    path: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
};
// --- End Copied Types ---

// --- Copied EventPayloadMapping from root types.d.ts ---
declare interface EventPayloadMapping {
    'statistics': Statistics;
    'system-stats-update': SystemStats;
    'scan-status-update': { status: 'running' | 'finished' | 'error'; message: string };
    // Note: 'startEncoding' seems different from startEncodingProcess. Review needed.
    'startEncoding': { success: boolean; reduction?: number; error?: string }; 
    // Note: 'encodingProgress' payload might need more detail (status, fps, etc.) based on preload.
    'encodingProgress': { progress?: number; status?: string }; 
    getStaticData: StaticData;
    getAvailableGpus: GpuInfo[];
    getSelectedGpu: string | null;
    setSelectedGpu: void; 
    'db-query': any;
    'get-watched-folders': WatchedFolder[];
    'add-watched-folder': WatchedFolder | null; 
    'remove-watched-folder': void; 
    'trigger-scan': { status: string }; 
    'get-manual-gpu-vram': number | null;
    'set-manual-gpu-vram': void; 
    "get-hardware-info": HardwareInfo[];
    "update-hardware-priority": void;
    "update-hardware-enabled": void;
    "refresh-hardware-info": HardwareInfo[];
    // Workflow methods are disabled but kept for reference
    /*
    'get-workflows': Workflow[];
    'get-workflow-details': WorkflowDetails | null; 
    'save-workflow': number; 
    'delete-workflow': { changes: number }; 
    */
    'trigger-folder-scan': { status: string }; 
    // Add mappings for newer methods if needed (probe-file, start-encoding-process, etc.)
}
// --- End EventPayloadMapping ---

export type UnsubscribeFunction = () => void;
// End other existing types

export interface IElectronAPI {
    // File Dialog Methods
    showOpenDialog: (options: DialogOptions) => Promise<DialogResult>;
    showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogResult>;

    // FFprobe Method
    probeFile: (filePath: string) => Promise<ProbeData | null>;

    // Encoding Process Methods
    startEncodingProcess: (options: EncodingOptions) => Promise<EncodingResult>; // Keep this one
    // Update callback signature to match preload.cts (includes status, fps, etc.)
    subscribeEncodingProgress: (callback: (data: { jobId?: string; progress?: number; status?: string; fps?: number; elapsed?: number; frame?: number; totalFrames?: number }) => void) => UnsubscribeFunction;
    unsubscribeEncodingProgress: () => void;
    getEncodingLog: (jobId: string) => Promise<string | null>; // Added from preload

    // Queue Methods
    loadQueueData: () => Promise<any>;
    saveQueueData: (data: any) => Promise<{ success: boolean }>;
    getFileSize: (filePath: string) => Promise<number | undefined>;
    startEncoding: (options: any) => Promise<any>;
    openEncodingLog: (jobId: string) => Promise<{ success: boolean; error?: string }>;
    replaceFile: (sourcePath: string, destinationPath: string) => Promise<boolean>;
    deleteFile: (filePath: string) => Promise<boolean>;
    finalizeEncodedFile: (params: { 
        tempFilePath: string; 
        finalFilePath: string; 
        jobId: string; 
        isOverwrite: boolean; 
        originalFilePath?: string 
    }) => Promise<{ 
        success: boolean; 
        finalPath?: string; 
        probeData?: any; 
        message?: string; 
        error?: string 
    }>;

    // --- Include other existing API methods (Copied/Verified from root & preload) --- 
    subscribeStatistics: (callback: (data: StatisticsData) => void) => UnsubscribeFunction;
    getStaticData: () => Promise<StaticData>;
    subscribeSystemStats: (callback: (data: SystemStatsData) => void) => UnsubscribeFunction;
    getAvailableGpus: () => Promise<GpuInfo[]>;
    getSelectedGpu: () => Promise<string | null>;
    setSelectedGpu: (model: string | null) => Promise<void>;
    getRunInBackground: () => Promise<boolean>;
    setRunInBackground: (enabled: boolean) => Promise<void>;
    getIntelPresentMonEnabled: () => Promise<boolean>;
    setIntelPresentMonEnabled: (enabled: boolean) => Promise<void>;
    dbQuery: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
    getWatchedFolders: () => Promise<WatchedFolder[]>;
    addWatchedFolder: (folderInfo: Omit<WatchedFolder, 'path'>) => Promise<WatchedFolder | null>;
    removeWatchedFolder: (folderPath: string) => Promise<void>;
    triggerScan: () => Promise<void>;
    triggerFolderScan: (folderPath: string) => Promise<void>;
    subscribeScanStatus: (callback: (data: ScanStatus) => void) => UnsubscribeFunction;
    getManualGpuVram: () => Promise<number | null>;
    setManualGpuVram: (vramMb: number | null) => Promise<void>;
    getHardwareInfo: () => Promise<HardwareInfo[]>;
    updateHardwarePriority: (deviceId: string, priority: number) => Promise<void>;
    updateHardwareEnabled: (deviceId: string, isEnabled: boolean) => Promise<void>;
    refreshHardwareInfo: () => Promise<void>;
    
    // Workflow methods
    getWorkflows: () => Promise<any[]>;
    getWorkflow: (id: string) => Promise<any>;
    saveWorkflow: (workflowData: { id: string; name: string; description?: string | null; nodes: Node[]; edges: Edge[] }) => Promise<any>;
    deleteWorkflow: (id: string) => Promise<boolean>;
    executeManualWorkflow: (workflowId: string, triggerNodeId: string) => Promise<{ success: boolean; message?: string }>;

    // Workflow Execution Logs
    getWorkflowExecutions: (limit?: number) => Promise<WorkflowExecutionLog[]>;

    // --- Logger API --- 
    subscribeToLogs: (callback: (logEntry: LocalLogEntry) => void) => UnsubscribeFunction;
    getInitialLogs: () => Promise<LocalLogEntry[]>;

    // --- Add New Methods ---
    showConfirmationDialog: (options: DialogOptions) => Promise<DialogResult>;

    // --- Encoding Presets --- 
    getPresets: () => Promise<EncodingPreset[]>;
    savePreset: (preset: EncodingPreset) => Promise<EncodingPreset>;
    deletePreset: (id: string) => Promise<{ changes: number }>;

    // --- Toast Notifications ---
    onShowToastNotification: (callback: (data: { title: string; type: 'info' | 'success' | 'warning' | 'error'; message: string }) => void) => () => void; // Returns an unsubscribe function

    // --- Performance History ---
    getPerformanceHistory: (startDate: string, endDate: string) => Promise<PerformanceHistoryRecord[]>;

    // --- Scheduler Debug ---
    debugScheduler: () => Promise<any>;
    reloadWorkflowTasks: () => Promise<void>;
}

// --- Add LogEntry type definition --- 
export interface LogEntry {
    timestamp: string;
    level: 'log' | 'warn' | 'error' | 'debug' | 'verbose';
    message: string;
    source?: string; // Added optional source
}

// Extend the Window interface
declare global {
    interface Window {
        electron: IElectronAPI;
    }
} 

// --- Add LocalLogEntry type definition --- 
export interface LocalLogEntry {
    timestamp: string;
    level: 'log' | 'warn' | 'error' | 'debug' | 'verbose';
    message: string;
} 

// --- Dialog Options & Result ---
export interface DialogOptions {
    type: 'none' | 'info' | 'error' | 'question' | 'warning';
    buttons: string[];
    title?: string;
    message: string;
    detail?: string;
    defaultId?: number;
    cancelId?: number;
}

export interface DialogResult {
    response: number;
    confirmed: boolean;
    error?: string;
} 

// --- Define EncodingPreset type here to be shared ---
// (Copied from Presets.tsx / preload.cts)
const VIDEO_CODECS = ['hevc_qsv', 'h264_qsv', 'av1_qsv', 'hevc_nvenc', 'h264_nvenc', 'av1_nvenc', 'libx265', 'libx264', 'copy'] as const;
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
    // --- Audio Language Preferences --- 
    // Replaced preferredAudioLanguages, keepOriginalAudio, defaultAudioLanguage
    audioLanguageOrder?: string[]; // Ordered array of lang codes (e.g., ['eng', 'original', 'jpn'])
    // --- Subtitle Preferences ---
    subtitleLanguageOrder?: string[]; // Ordered array of subtitle language codes in priority order
    subtitleTypeOrder?: string[]; // Ordered array of subtitle types (forced, sdh, cc, etc.) in priority order
    removeAllSubtitles?: boolean; // Flag to remove all subtitle streams from output
}
// --- End EncodingPreset type definition --- 

// Define PerformanceHistoryRecord (if not already defined globally elsewhere)
// Ensure this matches the definition in preload.cts and Dashboard.tsx
interface PerformanceHistoryRecord {
    timestamp: string;
    cpu_load: number | null;
    gpu_load: number | null;
    memory_load: number | null;
} 