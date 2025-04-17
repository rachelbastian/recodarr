import electron from "electron";

electron.contextBridge.exposeInMainWorld("electron", {
    subscribeStatistics: (callback) =>
        ipcOn("statistics", stats => {
            callback(stats);
        }),
    getStaticData: () => ipcInvoke("getStaticData"),
    subscribeSystemStats: (callback) => 
        ipcOn("system-stats-update", stats => {
            callback(stats);
        }),
    getAvailableGpus: () => ipcInvoke("getAvailableGpus"),
    getSelectedGpu: () => ipcInvoke("getSelectedGpu"),
    setSelectedGpu: (model) => ipcInvoke("setSelectedGpu", model),
    getPsGpuMonitoringEnabled: () => ipcInvoke("getPsGpuMonitoringEnabled"),
    setPsGpuMonitoringEnabled: (isEnabled) => ipcInvoke("setPsGpuMonitoringEnabled", isEnabled),
    dbQuery: (sql: string, params: any[] = []) => ipcInvoke("db-query", sql, params),
    getWatchedFolders: () => ipcInvoke('get-watched-folders'),
    addWatchedFolder: (folderInfo: Omit<WatchedFolder, 'path'>) => ipcInvoke('add-watched-folder', folderInfo),
    removeWatchedFolder: (folderPath: string) => ipcInvoke('remove-watched-folder', folderPath),
    triggerScan: () => ipcInvoke('trigger-scan'),
    subscribeScanStatus: (callback) => 
        ipcOn("scan-status-update", payload => {
            callback(payload);
        }),
} satisfies Window['electron'])

function ipcInvoke<Key extends keyof EventPayloadMapping>(key: Key, ...args: any[]): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(key: Key, callback: (payload: EventPayloadMapping[Key]) => void) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb)
}
