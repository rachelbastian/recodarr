type Statistics = {
    cpuUsage: number;
    ramUsage: number;
    storageData: number;
}

type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
}

// Added type for system stats
type SystemStats = {
    cpuLoad: number | null;
    memLoad: number | null;
    gpuLoad: number | null;
    gpuMemoryUsed: number | null;
    gpuMemoryTotal: number | null;
    error?: string;
}

// Added type for basic GPU info for selection
type GpuInfo = {
    vendor: string;
    model: string;
}

type UnsubscribeFunction = () => void;

type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
    "system-stats-update": SystemStats;
    // Corrected IPC channels to represent resolved types
    getAvailableGpus: GpuInfo[];
    getSelectedGpu: string | null;
    setSelectedGpu: void; // Handler payload is model: string | null, return is void/Promise<void>
    // Added types for PS monitoring toggle
    getPsGpuMonitoringEnabled: boolean;
    setPsGpuMonitoringEnabled: void; // Payload is boolean
    // Added types for database query
    'db-query': any; // Result type depends on the query (array for SELECT, RunResult for others)
    // Added types for watched folders
    'get-watched-folders': WatchedFolder[];
    'add-watched-folder': WatchedFolder | null; // Payload: Omit<WatchedFolder, 'path'>
    'remove-watched-folder': void; // Payload: string (folderPath)
    // Added types for scanner
    'trigger-scan': { status: string }; // Payload: none
    'scan-status-update': { status: 'running' | 'finished' | 'error'; message: string }; // Event sent FROM main TO renderer
}

// --- Added Watched Folder Type --- Duplicated from main.ts for global scope
interface WatchedFolder {
    path: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
}
// --- End Watched Folder Type ---

interface Window {
    electron: {
        subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
        getStaticData: () => Promise<StaticData>;
        subscribeSystemStats: (callback: (stats: SystemStats) => void) => UnsubscribeFunction;
        getAvailableGpus: () => Promise<GpuInfo[]>;
        getSelectedGpu: () => Promise<string | null>;
        setSelectedGpu: (model: string | null) => Promise<void>;
        // Added functions for PS monitoring toggle
        getPsGpuMonitoringEnabled: () => Promise<boolean>;
        setPsGpuMonitoringEnabled: (isEnabled: boolean) => Promise<void>;
        // Added database query function type
        dbQuery: (sql: string, params?: any[]) => Promise<any>; // Return type depends on query
        // Added watched folder function types
        getWatchedFolders: () => Promise<WatchedFolder[]>;
        addWatchedFolder: (folderInfo: Omit<WatchedFolder, 'path'>) => Promise<WatchedFolder | null>;
        removeWatchedFolder: (folderPath: string) => Promise<void>;
        // Added scanner function types
        triggerScan: () => Promise<{ status: string }>;
        // Added listener for scan status updates
        subscribeScanStatus: (callback: (payload: EventPayloadMapping['scan-status-update']) => void) => UnsubscribeFunction;
    }
}
