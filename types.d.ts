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
}

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
    }
}
