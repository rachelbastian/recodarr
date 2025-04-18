import { Node, Edge } from 'reactflow';

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
    gpuMemoryUsagePercent?: number | null; // Added optional GPU memory usage percentage
    error?: string;
}

// Define GPU information structure
type GpuInfo = {
    vendor: string;
    model: string;
    memoryTotal: number | null; // Added total memory detected by SI
}

type UnsubscribeFunction = () => void;

// Added Hardware Info Types
type HardwareInfo = {
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
}

// Add Workflow Types (matching main.ts)
interface Workflow {
    id: number;
    name: string;
    description: string;
}

interface WorkflowDetails extends Workflow {
    nodes: Node[];
    edges: Edge[];
}

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
    // Added types for manual VRAM override
    'get-manual-gpu-vram': number | null;
    'set-manual-gpu-vram': void; // Payload: number | null
    // Added hardware info mappings
    "get-hardware-info": HardwareInfo[];
    "update-hardware-priority": void;
    "update-hardware-enabled": void;
    "refresh-hardware-info": HardwareInfo[];
    // Workflow handlers
    'get-workflows': Workflow[];
    'get-workflow-details': WorkflowDetails | null; // Payload: number (workflowId)
    'save-workflow': number; // Payload: { id?, name, description, nodes, edges }, Returns: number (saved workflow ID)
    'delete-workflow': { changes: number }; // Payload: number (workflowId)
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
        // Added functions for manual VRAM
        getManualGpuVram: () => Promise<number | null>;
        setManualGpuVram: (vramMb: number | null) => Promise<void>;
        // Added hardware info methods
        getHardwareInfo: () => Promise<HardwareInfo[]>;
        updateHardwarePriority: (deviceId: number, priority: number) => Promise<void>;
        updateHardwareEnabled: (deviceId: number, isEnabled: boolean) => Promise<void>;
        refreshHardwareInfo: () => Promise<HardwareInfo[]>;
        // Workflow Handlers
        getWorkflows: () => Promise<Workflow[]>;
        getWorkflowDetails: (id: number) => Promise<WorkflowDetails | null>;
        saveWorkflow: (workflowData: { id?: number; name: string; description: string; nodes: Node[]; edges: Edge[] }) => Promise<number>;
        deleteWorkflow: (id: number) => Promise<{ changes: number }>;
    }
}
