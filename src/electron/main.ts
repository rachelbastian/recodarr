import { app, BrowserWindow, ipcMain } from "electron"
import { isDev } from "./util.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";
import { getStaticData, pollResources } from "./test.js";
import si from 'systeminformation';
import Store from 'electron-store';
import { exec } from 'child_process';
import { Buffer } from 'buffer';

// Initialize electron-store
const store = new Store();
const SELECTED_GPU_KEY = 'selectedGpuModel';
const ENABLE_PS_GPU_KEY = 'enablePsGpuMonitoring'; // Key for the toggle

// Updated function to use PowerShell's -EncodedCommand
function runPsCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Encode the command as UTF-16LE Buffer, then Base64
        const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');

        exec(`powershell.exe -EncodedCommand ${encodedCommand}`, (error, stdout, stderr) => {
            if (error) {
                // Keep essential error logs
                console.error(`PS exec error for encoded command [${command.substring(0, 50)}...]: ${error}`);
                return reject(error);
            }
            // if (stderr) {
            //     // Comment out non-critical stderr warnings
            //     // console.warn(`PS stderr for encoded command [${command.substring(0, 50)}...]: ${stderr.trim()}`);
            // }
            resolve(stdout.trim());
        });
    });
}

// Helper function to find preferred GPU
const findGpu = (controllers: si.Systeminformation.GraphicsControllerData[], preferredModel: string | null) => {
    if (preferredModel) {
        const preferred = controllers.find(gpu => gpu.model === preferredModel);
        if (preferred) return preferred;
        // Keep this warning as it indicates a configuration issue
        // console.warn(`Preferred GPU model "${preferredModel}" not found. Falling back.`);
    }
    return controllers.find(gpu => !gpu.vendor?.includes('Microsoft')) || controllers[0] || null;
}

async function getSystemStats(): Promise<SystemStats> {
    try {
        // Fetch CPU and System Memory via SI
        const [cpuData, memData] = await Promise.all([
            si.currentLoad(),
            si.mem(),
        ]);

        // Check if PowerShell GPU monitoring is enabled
        const psGpuEnabled = store.get(ENABLE_PS_GPU_KEY, false) as boolean;

        let gpuLoadPs: number | null = null;
        let gpuMemoryUsedPsMb: number | null = null;

        // Only run PS commands if enabled
        if (psGpuEnabled) {
            // Define PS commands for GPU stats (Counters)
            const gpuUtilCommand = `(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage').CounterSamples | Where-Object {$_.CookedValue -ne $null} | Measure-Object -Sum CookedValue | Select-Object -ExpandProperty Sum`;
            const gpuMemUsedCommand = `(Get-Counter '\\GPU Process Memory(*)\\Local Usage').CounterSamples | Where-Object {$_.CookedValue -ne $null} | Measure-Object -Sum CookedValue | Select-Object -ExpandProperty Sum`;

            try {
                const [gpuUtilOutput, gpuMemUsedOutput] = await Promise.all([
                    runPsCommand(gpuUtilCommand),
                    runPsCommand(gpuMemUsedCommand)
                ]);
                gpuLoadPs = gpuUtilOutput ? parseFloat(gpuUtilOutput) : null;
                gpuMemoryUsedPsMb = gpuMemUsedOutput ? parseFloat(gpuMemUsedOutput) / (1024 * 1024) : null;
            } catch (psCounterError) {
                console.error("Error executing PowerShell Get-Counter commands:", psCounterError);
                // Ensure values are null if PS fails even when enabled
                gpuLoadPs = null;
                gpuMemoryUsedPsMb = null;
            }
        }

        // Fetch Total GPU Memory via systeminformation (always attempt this)
        let gpuMemoryTotalSiMb: number | null = null;
        try {
            const gpuData = await si.graphics();
            const preferredGpuModel = store.get(SELECTED_GPU_KEY) as string | null;
            const targetGpu = findGpu(gpuData.controllers, preferredGpuModel);
            gpuMemoryTotalSiMb = targetGpu?.memoryTotal ?? null;
        } catch (siError) {
             console.error("Error fetching GPU graphics info via systeminformation:", siError);
        }

        return {
            cpuLoad: cpuData.currentLoad,
            memLoad: (memData.active / memData.total) * 100,
            gpuLoad: gpuLoadPs,             // Null if PS monitoring is disabled or fails
            gpuMemoryUsed: gpuMemoryUsedPsMb, // Null if PS monitoring is disabled or fails
            gpuMemoryTotal: gpuMemoryTotalSiMb,
        };
    } catch (e: unknown) {
        console.error("Error fetching system stats:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            cpuLoad: null,
            memLoad: null,
            gpuLoad: null,
            gpuMemoryUsed: null,
            gpuMemoryTotal: null,
            error: errorMessage
        };
    }
}

// Added function to poll system stats and send to renderer
function pollSystemStats(window: BrowserWindow) {
    setInterval(async () => {
        const stats = await getSystemStats();
        if (window && !window.isDestroyed()) {
            window.webContents.send("system-stats-update", stats);
        }
    }, 2000); // Poll every 2 seconds
}

app.on("ready", () => {
    const mainWindow = new BrowserWindow({
        // Shouldn't add contextIsolate or nodeIntegration because of security vulnerabilities
        webPreferences: {
            preload: getPreloadPath(),
        }
    });

    if (isDev()) mainWindow.loadURL("http://localhost:3524")
    else mainWindow.loadFile(getUIPath());

    pollResources(mainWindow);
    pollSystemStats(mainWindow); // Start polling system stats

    ipcMain.handle("getStaticData", () => {
        return getStaticData();
    })

    // --- Use standard ipcMain.handle ---
    ipcMain.handle("getAvailableGpus", async (): Promise<GpuInfo[]> => {
        try {
            const gpus = await si.graphics();
            // Filter out potential RDP adapter from selection if desired
            return gpus.controllers
                .filter(gpu => !gpu.vendor?.includes('Microsoft')) // Example filter
                .map(gpu => ({ vendor: gpu.vendor ?? 'Unknown', model: gpu.model ?? 'Unknown' }));
        } catch (error) {
            console.error("Error fetching available GPUs:", error);
            return [];
        }
    });

    ipcMain.handle("getSelectedGpu", async (): Promise<string | null> => {
        return store.get(SELECTED_GPU_KEY, null) as string | null;
    });

    ipcMain.handle("setSelectedGpu", async (_event: Electron.IpcMainInvokeEvent, model: string | null): Promise<void> => {
        // console.log("Setting selected GPU to:", model); // Comment out confirmation log
        if (model === null || model === 'default') {
            store.delete(SELECTED_GPU_KEY);
        } else {
            store.set(SELECTED_GPU_KEY, model);
        }
    });

    // Added handlers for PowerShell GPU monitoring toggle
    ipcMain.handle("getPsGpuMonitoringEnabled", async (): Promise<boolean> => {
        return store.get(ENABLE_PS_GPU_KEY, false) as boolean;
    });

    ipcMain.handle("setPsGpuMonitoringEnabled", async (_event: Electron.IpcMainInvokeEvent, isEnabled: boolean): Promise<void> => {
        store.set(ENABLE_PS_GPU_KEY, isEnabled);
    });
    // --- End IPC Handlers ---
})
