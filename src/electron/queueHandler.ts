import { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import Store from 'electron-store';
import { startEncodingProcess } from './ffmpegUtils.js';

// Types
interface QueueItem {
  id: string;
  inputPath: string;
  outputPath: string;
  presetId?: string;
  presetName?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  fileSize?: number;
  resultSize?: number;
  encodingOptions?: any;
  jobId?: string;
}

interface EncodeSettings {
  maxConcurrentJobs: number;
  overwriteInput: boolean;
  autoStart: boolean;
  outputDirectory?: string;
}

interface QueueData {
  queue: QueueItem[];
  settings: EncodeSettings;
}

// Store keys
const QUEUE_DATA_KEY = 'queue_data';
const LOGS_DIR = path.join(process.cwd(), 'logs');

// Initialize electron-store
const store = new Store();

// Create logs directory if it doesn't exist
async function ensureLogsDirectory() {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    return true;
  } catch (error) {
    console.error('[Queue Handler] Error creating logs directory:', error);
    return false;
  }
}

// Load queue data from electron-store
export function loadQueueData(): QueueData {
  const data = store.get(QUEUE_DATA_KEY) as QueueData | undefined;
  if (!data) {
    // Return default values if no data is stored
    return {
      queue: [],
      settings: {
        maxConcurrentJobs: 1,
        overwriteInput: false,
        autoStart: true
      }
    };
  }
  return data;
}

// Save queue data to electron-store
export function saveQueueData(data: QueueData): void {
  store.set(QUEUE_DATA_KEY, data);
}

// Get file size in MB
export async function getFileSize(filePath: string): Promise<number | undefined> {
  try {
    const stats = await fs.stat(filePath);
    // Return size in MB
    return Number((stats.size / (1024 * 1024)).toFixed(2));
  } catch (error) {
    console.error('[Queue Handler] Error getting file size:', error);
    return undefined;
  }
}

// Start encoding a file
export async function startEncoding(options: any, mainWindow: BrowserWindow | null): Promise<any> {
  console.log(`[Queue Handler] Starting encoding for job: ${options.jobId}`);
  
  try {
    // Make sure logs directory exists
    await ensureLogsDirectory();
    
    // Set up job-specific options
    const encodingOptions = {
      ...options,
      logDirectoryPath: LOGS_DIR,
      progressCallback: (progress: any) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('encodingProgress', {
            ...progress,
            jobId: options.jobId
          });
        }
      }
    };
    
    // Start the encoding process
    const result = await startEncodingProcess(encodingOptions);
    
    // Return the result with the jobId
    return {
      ...result,
      jobId: options.jobId
    };
  } catch (error) {
    console.error('[Queue Handler] Error in startEncoding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      jobId: options.jobId
    };
  }
}

// Get log file content
export async function getEncodingLog(jobId: string): Promise<string | null> {
  try {
    const logPath = path.join(LOGS_DIR, `${jobId}.log`);
    
    // Check if the file exists
    try {
      await fs.access(logPath, fs.constants.R_OK);
    } catch (error) {
      console.error(`[Queue Handler] Log file for job ${jobId} not found or not readable:`, error);
      return null;
    }
    
    // Read the log file
    const content = await fs.readFile(logPath, 'utf-8');
    return content;
  } catch (error) {
    console.error('[Queue Handler] Error getting encoding log:', error);
    return null;
  }
}

// Initialize the queue handlers by registering IPC handlers
export function initQueueHandlers(ipcMain: Electron.IpcMain, mainWindow: BrowserWindow | null): void {
  // Handler to load queue data
  ipcMain.handle('loadQueueData', () => {
    return loadQueueData();
  });
  
  // Handler to save queue data
  ipcMain.handle('saveQueueData', (_event, data: QueueData) => {
    saveQueueData(data);
    return { success: true };
  });
  
  // Handler to get file size
  ipcMain.handle('getFileSize', (_event, filePath: string) => {
    return getFileSize(filePath);
  });
  
  // Handler to start encoding
  ipcMain.handle('startEncoding', (_event, options: any) => {
    return startEncoding(options, mainWindow);
  });
  
  // Handler to get encoding log
  ipcMain.handle('getEncodingLog', (_event, jobId: string) => {
    return getEncodingLog(jobId);
  });
  
  // Handler to open encoding log (opens the log in the system's default text editor)
  ipcMain.handle('openEncodingLog', async (_event, jobId: string) => {
    try {
      const logPath = path.join(LOGS_DIR, `${jobId}.log`);
      
      // Check if file exists
      try {
        await fs.access(logPath, fs.constants.R_OK);
      } catch (error) {
        return { success: false, error: 'Log file not found or not readable' };
      }
      
      // Use shell to open the file with the default application
      const { shell } = require('electron');
      await shell.openPath(logPath);
      
      return { success: true };
    } catch (error) {
      console.error('[Queue Handler] Error opening encoding log:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  console.log('[Queue Handler] Queue handlers initialized');
} 