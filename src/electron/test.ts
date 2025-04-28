import osUtils from "os-utils";
import fs from "fs"
import os from "os"
import { BrowserWindow } from "electron";
import { ipcWebContentsSend } from "./util.js";

const POLLING_INTERVAL = 500;

// Store the interval reference so we can clear it when needed
let resourcesInterval: NodeJS.Timeout | null = null;

export function pollResources(mainWindow: BrowserWindow) {
    // Clear any existing interval
    if (resourcesInterval) {
        clearInterval(resourcesInterval);
        resourcesInterval = null;
    }
    
    resourcesInterval = setInterval(async () => {
        // Check if the window is destroyed before proceeding
        if (mainWindow.isDestroyed()) {
            stopPolling(); // Stop polling if window is gone
            return;
        }

        const cpuUsage = await getCPUUsage();
        const storageData = getStorageData();
        const ramUsage = getRamUsage();

        // Add another check after awaits, before sending IPC message
        if (mainWindow.isDestroyed()) {
            return; // Don't send if window is destroyed
        }
        ipcWebContentsSend("statistics", mainWindow.webContents, { cpuUsage, ramUsage, storageData: storageData.usage });
    }, POLLING_INTERVAL);
}

// Function to stop polling and clean up the interval
export function stopPolling() {
    if (resourcesInterval) {
        console.log("Stopping resource polling interval");
        clearInterval(resourcesInterval);
        resourcesInterval = null;
    }
}

export function getStaticData() {
    const totalStorage = getStorageData().total;
    const cpuModel = os.cpus()[0].model;
    const totalMemoryGB = Math.floor(osUtils.totalmem() / 1024);

    return {
        totalStorage,
        cpuModel,
        totalMemoryGB
    }
}

function getCPUUsage(): Promise<number> {
    return new Promise(resolve => {
        osUtils.cpuUsage(resolve);
    })
}

function getRamUsage() {
    return 1 - osUtils.freememPercentage();
}

function getStorageData() {
    const stats = fs.statfsSync(process.platform === 'win32' ? 'C://' : '/');
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bfree;

    return {
        total: Math.floor(total / 1_000_000_000),
        usage: 1 - free / total
    }
}


