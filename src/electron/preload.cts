/// <reference types="../../types" />
import electron from "electron";
// Explicitly import types needed in this file
import type { 
    EventPayloadMapping, 
    WatchedFolder, 
    Statistics, 
    SystemStats, 
    GpuInfo, 
    HardwareInfo, 
    Workflow, 
    WorkflowDetails, 
    UnsubscribeFunction,
    StaticData
} from "../../types.js" assert { "resolution-mode": "import" };
// Import ReactFlow types needed for the API definition
import { Node, Edge } from 'reactflow';

// Define the type for the electron API exposed on the window object
// Duplicating the structure from types.d.ts because global augmentation isn't reliable here.
type ElectronApi = {
    subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
    getStaticData: () => Promise<StaticData>; // Assuming StaticData is globally known or defined/imported
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
    // Workflow Handlers
    getWorkflows: () => Promise<Workflow[]>;
    getWorkflowDetails: (id: number) => Promise<WorkflowDetails | null>;
    saveWorkflow: (workflowData: { id?: number; name: string; description: string; nodes: Node[]; edges: Edge[] }) => Promise<number>;
    deleteWorkflow: (id: number) => Promise<{ changes: number }>;
};


electron.contextBridge.exposeInMainWorld("electron", {
    subscribeStatistics: (callback: (statistics: Statistics) => void) =>
        ipcOn("statistics", stats => {
            callback(stats);
        }),
    getStaticData: () => ipcInvoke("getStaticData"),
    subscribeSystemStats: (callback: (stats: SystemStats) => void) => 
        ipcOn("system-stats-update", stats => {
            callback(stats);
        }),
    getAvailableGpus: () => ipcInvoke("getAvailableGpus"),
    getSelectedGpu: () => ipcInvoke("getSelectedGpu"),
    setSelectedGpu: (model: string | null) => ipcInvoke("setSelectedGpu", model),
    getPsGpuMonitoringEnabled: () => ipcInvoke("getPsGpuMonitoringEnabled"),
    setPsGpuMonitoringEnabled: (isEnabled: boolean) => ipcInvoke("setPsGpuMonitoringEnabled", isEnabled),
    dbQuery: (sql: string, params: any[] = []) => ipcInvoke("db-query", sql, params),
    getWatchedFolders: () => ipcInvoke('get-watched-folders'),
    addWatchedFolder: (folderInfo: Omit<WatchedFolder, 'path'>) => ipcInvoke('add-watched-folder', folderInfo),
    removeWatchedFolder: (folderPath: string) => ipcInvoke('remove-watched-folder', folderPath),
    triggerScan: () => ipcInvoke('trigger-scan'),
    subscribeScanStatus: (callback: (payload: EventPayloadMapping['scan-status-update']) => void) => 
        ipcOn("scan-status-update", payload => {
            callback(payload);
        }),
    getManualGpuVram: () => ipcInvoke("get-manual-gpu-vram"),
    setManualGpuVram: (vramMb: number | null) => ipcInvoke("set-manual-gpu-vram", vramMb),
    getHardwareInfo: () => ipcInvoke("get-hardware-info"),
    updateHardwarePriority: (deviceId: number, priority: number) => ipcInvoke("update-hardware-priority", deviceId, priority),
    updateHardwareEnabled: (deviceId: number, isEnabled: boolean) => ipcInvoke("update-hardware-enabled", deviceId, isEnabled),
    refreshHardwareInfo: () => ipcInvoke("refresh-hardware-info"),
    // Workflow handlers
    getWorkflows: () => ipcInvoke('get-workflows'),
    getWorkflowDetails: (id: number) => ipcInvoke('get-workflow-details', id),
    // Use the specific type from Window['electron']['saveWorkflow'] for workflowData parameter
    saveWorkflow: (workflowData: Parameters<ElectronApi['saveWorkflow']>[0]) => ipcInvoke('save-workflow', workflowData),
    deleteWorkflow: (id: number) => ipcInvoke('delete-workflow', id),
} satisfies ElectronApi) // Use the explicitly defined ElectronApi type here

function ipcInvoke<Key extends keyof EventPayloadMapping>(key: Key, ...args: any[]): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key as string, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(key: Key, callback: (payload: EventPayloadMapping[Key]) => void) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    // Assert key is a string for .on() and .off()
    electron.ipcRenderer.on(key as string, cb);
    return () => electron.ipcRenderer.off(key as string, cb)
}
