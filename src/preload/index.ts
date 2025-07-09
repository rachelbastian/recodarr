// Sample code to get you started

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';
import { TaskFrequency } from '../electron/schedulerUtils';

// Define the interface for Electron API
interface IElectronAPI {
  // File operations
  openFileDialog: () => Promise<string[]>;
  openFolderDialog: () => Promise<string[]>;
  
  // Library management
  createLibrary: (name: string, type: string, paths: string[]) => Promise<any>;
  getLibraries: () => Promise<any[]>;
  updateLibrary: (id: string, updates: any) => Promise<any>;
  deleteLibrary: (id: string) => Promise<boolean>;
  
  // Media operations
  getMediaItems: (libraryId: string, filters: any, pagination: any) => Promise<any>;
  getMediaItemById: (id: string) => Promise<any>;
  refreshMediaScan: (libraryIds?: string[]) => Promise<void>;
  getMediaCounts: () => Promise<any>;
  
  // System info
  getSystemInfo: () => Promise<any>;
  getHardwareInfo: () => Promise<any[]>;
  refreshHardwareInfo: () => Promise<any[]>;
  updateHardwarePriority: (id: string, priority: number) => Promise<void>;
  updateHardwareEnabled: (id: string, enabled: boolean) => Promise<void>;
  
  // Settings
  getAvailableGpus: () => Promise<any[]>;
  getSelectedGpu: () => Promise<string | null>;
  setSelectedGpu: (model: string | null) => Promise<void>;
  getManualGpuVram: () => Promise<number | null>;
  setManualGpuVram: (vramMb: number | null) => Promise<void>;
  getAppSettings: () => Promise<any>;
  updateAppSettings: (settings: any) => Promise<void>;
  
  // Logs
  getLogs: (maxLines: number) => Promise<string[]>;
  clearLogs: () => Promise<void>;
  
  // Scheduled tasks
  getAllScheduledTasks: () => Promise<any[]>;
  addScheduledTask: (task: any) => Promise<any>;
  updateScheduledTask: (taskId: string, updates: any) => Promise<any>;
  toggleScheduledTask: (taskId: string, enabled: boolean) => Promise<any>;
  deleteScheduledTask: (taskId: string) => Promise<boolean>;
  runScheduledTaskNow: (taskId: string) => Promise<void>;
  getConfigValue: (key: string) => Promise<any>;
  setConfigValue: (key: string, value: any) => Promise<boolean>;
}

// Set up the API available to the renderer process
contextBridge.exposeInMainWorld('electron', {
  // File operations
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  
  // Library management
  createLibrary: (name: string, type: string, paths: string[]) => 
    ipcRenderer.invoke('library:create', name, type, paths),
  getLibraries: () => ipcRenderer.invoke('library:getAll'),
  updateLibrary: (id: string, updates: any) => 
    ipcRenderer.invoke('library:update', id, updates),
  deleteLibrary: (id: string) => ipcRenderer.invoke('library:delete', id),
  
  // Media operations
  getMediaItems: (libraryId: string, filters: any, pagination: any) => 
    ipcRenderer.invoke('media:getItems', libraryId, filters, pagination),
  getMediaItemById: (id: string) => ipcRenderer.invoke('media:getById', id),
  refreshMediaScan: (libraryIds?: string[]) => 
    ipcRenderer.invoke('media:refresh', libraryIds),
  getMediaCounts: () => ipcRenderer.invoke('media:getCounts'),
  
  // System info
  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),
  getHardwareInfo: () => ipcRenderer.invoke('system:getHardwareInfo'),
  refreshHardwareInfo: () => ipcRenderer.invoke('system:refreshHardwareInfo'),
  updateHardwarePriority: (id: string, priority: number) => 
    ipcRenderer.invoke('system:updateHardwarePriority', id, priority),
  updateHardwareEnabled: (id: string, enabled: boolean) => 
    ipcRenderer.invoke('system:updateHardwareEnabled', id, enabled),
  
  // Settings
  getAvailableGpus: () => ipcRenderer.invoke('getAvailableGpus'),
  getSelectedGpu: () => ipcRenderer.invoke('getSelectedGpu'),
  setSelectedGpu: (model: string | null) => 
    ipcRenderer.invoke('setSelectedGpu', model),
  getManualGpuVram: () => ipcRenderer.invoke('settings:getManualGpuVram'),
  setManualGpuVram: (vramMb: number | null) => 
    ipcRenderer.invoke('settings:setManualGpuVram', vramMb),
  getAppSettings: () => ipcRenderer.invoke('settings:getAll'),
  updateAppSettings: (settings: any) => 
    ipcRenderer.invoke('settings:update', settings),
  
  // Logs
  getLogs: (maxLines: number) => ipcRenderer.invoke('logs:get', maxLines),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  
  // Scheduled tasks
  getAllScheduledTasks: () => ipcRenderer.invoke('scheduler:getAllTasks'),
  addScheduledTask: (task: any) => ipcRenderer.invoke('scheduler:addTask', task),
  updateScheduledTask: (taskId: string, updates: any) => 
    ipcRenderer.invoke('scheduler:updateTask', taskId, updates),
  toggleScheduledTask: (taskId: string, enabled: boolean) => 
    ipcRenderer.invoke('scheduler:toggleTask', taskId, enabled),
  deleteScheduledTask: (taskId: string) => 
    ipcRenderer.invoke('scheduler:deleteTask', taskId),
  runScheduledTaskNow: (taskId: string) => 
    ipcRenderer.invoke('scheduler:runTaskNow', taskId),
  getConfigValue: (key: string) => ipcRenderer.invoke('scheduler:getConfigValue', key),
  setConfigValue: (key: string, value: any) => ipcRenderer.invoke('scheduler:setConfigValue', key, value),
} as IElectronAPI); 