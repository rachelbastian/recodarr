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
    // Add getEncodingLog method
    getEncodingLog: (jobId: string) => Promise<string | null>; 
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
export interface Workflow {
    id: number;
    name: string;
    description: string;
};
export interface WorkflowDetails extends Workflow {
    nodes: Node[]; // Make sure Node/Edge are imported if needed here
    edges: Edge[];
};
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
    getPsGpuMonitoringEnabled: boolean;
    setPsGpuMonitoringEnabled: void; 
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
    'get-workflows': Workflow[];
    'get-workflow-details': WorkflowDetails | null; 
    'save-workflow': number; 
    'delete-workflow': { changes: number }; 
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

    // --- Include other existing API methods (Copied/Verified from root & preload) --- 
    subscribeStatistics: (callback: (data: StatisticsData) => void) => UnsubscribeFunction;
    getStaticData: () => Promise<StaticData>;
    subscribeSystemStats: (callback: (data: SystemStatsData) => void) => UnsubscribeFunction;
    getAvailableGpus: () => Promise<GpuInfo[]>;
    getSelectedGpu: () => Promise<string | null>;
    setSelectedGpu: (model: string) => Promise<void>;
    getPsGpuMonitoringEnabled: () => Promise<boolean>;
    setPsGpuMonitoringEnabled: (isEnabled: boolean) => Promise<void>;
    dbQuery: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
    getWatchedFolders: () => Promise<WatchedFolder[]>;
    addWatchedFolder: (folderInfo: Omit<WatchedFolder, 'path'>) => Promise<WatchedFolder | null>;
    removeWatchedFolder: (folderPath: string) => Promise<void>;
    triggerScan: () => Promise<void>;
    triggerFolderScan: (folderPath: string) => Promise<void>;
    subscribeScanStatus: (callback: (data: ScanStatus) => void) => UnsubscribeFunction;
    getManualGpuVram: () => Promise<number | null>;
    setManualGpuVram: (vramMb: number) => Promise<void>;
    getHardwareInfo: () => Promise<HardwareInfo[]>;
    updateHardwarePriority: (deviceId: string, priority: number) => Promise<void>;
    updateHardwareEnabled: (deviceId: string, isEnabled: boolean) => Promise<void>;
    refreshHardwareInfo: () => Promise<void>;
    getWorkflows: () => Promise<Workflow[]>;
    getWorkflowDetails: (id: number) => Promise<WorkflowDetails>;
    saveWorkflow: (workflowData: WorkflowDetails) => Promise<void>;
    deleteWorkflow: (id: number) => Promise<void>;
    // --- End other existing API methods --- 

    // --- Logger API --- 
    subscribeToLogs: (callback: (logEntry: LocalLogEntry) => void) => UnsubscribeFunction;
    getInitialLogs: () => Promise<LocalLogEntry[]>;

    // --- Add New Methods ---
    showConfirmationDialog: (options: DialogOptions) => Promise<DialogResult>;

    // --- Encoding Presets --- 
    getPresets: () => Promise<EncodingPreset[]>;
    savePreset: (preset: EncodingPreset) => Promise<EncodingPreset>;
    deletePreset: (id: string) => Promise<{ changes: number }>;
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
}
// --- End EncodingPreset type definition --- 