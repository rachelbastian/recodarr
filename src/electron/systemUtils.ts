import si from 'systeminformation';
import Store from 'electron-store';
import { exec } from 'child_process';
import { Buffer } from 'buffer';
import { BrowserWindow } from 'electron';

// --- Types (copied from main.ts or a shared types file) ---
interface SystemStats { 
    cpuLoad: number | null; 
    memLoad: number | null; 
    gpuLoad: number | null; 
    gpuMemoryUsed: number | null; 
    gpuMemoryTotal: number | null; 
    gpuMemoryUsagePercent: number | null; 
    error?: string 
};

// --- Module-level variables ---
let systemStatsTimer: NodeJS.Timeout | null = null;
let storeInstance: Store | null = null;

// Constants used by system utils - these should match what's in main.ts or be passed in
const ENABLE_PS_GPU_KEY = 'enablePsGpuMonitoring';
const SELECTED_GPU_KEY = 'selectedGpuModel';
const MANUAL_GPU_VRAM_MB_KEY = 'manualGpuVramMb';

// --- Internal Helper Functions ---
function runPsCommand(command: string): Promise<string> {
    if (!storeInstance) {
        console.error("[SystemUtils] Store not initialized for runPsCommand.");
        return Promise.reject("Store not initialized");
    }
    console.log(`[DEBUG] PowerShell command requested: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`);
    if ((command.includes('Get-Counter') || command.includes('\\GPU')) && !storeInstance.get(ENABLE_PS_GPU_KEY, false)) {
        console.log('[DEBUG] Skipping PowerShell GPU monitoring command due to setting disabled');
        return Promise.resolve('');
    }
    return new Promise((resolve, reject) => {
        const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
        exec(`powershell.exe -EncodedCommand ${encodedCommand}`, (error, stdout) => {
            if (error) { console.error(`PS exec error for encoded command [${command.substring(0, 50)}...]: ${error}`); return reject(error); }
            resolve(stdout.trim());
        });
    });
}

const findGpu = (controllers: si.Systeminformation.GraphicsControllerData[], preferredModel: string | null) => {
    if (preferredModel) { const preferred = controllers.find(gpu => gpu.model === preferredModel); if (preferred) return preferred; }
    return controllers.find(gpu => !gpu.vendor?.includes('Microsoft')) || controllers[0] || null;
};

async function getSystemStatsInternal(): Promise<SystemStats> {
    if (!storeInstance) {
        console.error("[SystemUtils] Store not initialized for getSystemStatsInternal.");
        return { cpuLoad: null, memLoad: null, gpuLoad: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuMemoryUsagePercent: null, error: "Store not initialized" };
    }
    try {
        const [cpuData, memData] = await Promise.all([si.currentLoad(), si.mem()]);
        const psGpuEnabled = storeInstance.get(ENABLE_PS_GPU_KEY, false) as boolean;
        let gpuLoadPs: number | null = null, gpuMemoryUsedPsMb: number | null = null;

        if (psGpuEnabled) {
            const gpuUtilCmd = `(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage').CounterSamples | Where-Object {$_.CookedValue -ne $null} | Measure-Object -Sum CookedValue | Select-Object -ExpandProperty Sum`;
            const gpuMemUsedCmd = `(Get-Counter '\\GPU Process Memory(*)\\Local Usage').CounterSamples | Where-Object {$_.CookedValue -ne $null} | Measure-Object -Sum CookedValue | Select-Object -ExpandProperty Sum`;
            try { 
                const [util, mem] = await Promise.all([runPsCommand(gpuUtilCmd), runPsCommand(gpuMemUsedCmd)]); 
                gpuLoadPs = util ? parseFloat(util) : null; 
                gpuMemoryUsedPsMb = mem ? parseFloat(mem) / (1024 * 1024) : null; 
            } catch (psErr) { 
                console.error("[SystemUtils] Error with PS Get-Counter:", psErr); 
            }
        }

        let gpuMemoryTotalSiMb: number | null = null;
        try { 
            const gpuData = await si.graphics(); 
            const prefModel = storeInstance.get(SELECTED_GPU_KEY) as string | null; 
            const targetGpu = findGpu(gpuData.controllers, prefModel); 
            gpuMemoryTotalSiMb = targetGpu?.memoryTotal ?? null; 
        } catch (siErr) { 
            console.error("[SystemUtils] Error fetching GPU graphics via SI:", siErr); 
        }
        
        const manualVramMb = storeInstance.get(MANUAL_GPU_VRAM_MB_KEY) as number | null;
        const effectiveTotalVramMb = manualVramMb ?? gpuMemoryTotalSiMb;
        let gpuMemoryUsagePercent: number | null = null;
        if (gpuMemoryUsedPsMb !== null && effectiveTotalVramMb !== null && effectiveTotalVramMb > 0) {
            gpuMemoryUsagePercent = (gpuMemoryUsedPsMb / effectiveTotalVramMb) * 100;
        }

        return { 
            cpuLoad: cpuData.currentLoad, 
            memLoad: (memData.active / memData.total) * 100, 
            gpuLoad: gpuLoadPs, 
            gpuMemoryUsed: gpuMemoryUsedPsMb, 
            gpuMemoryTotal: effectiveTotalVramMb, 
            gpuMemoryUsagePercent 
        };
    } catch (e) { 
        console.error("[SystemUtils] Error fetching system stats:", e); 
        return { cpuLoad: null, memLoad: null, gpuLoad: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuMemoryUsagePercent: null, error: e instanceof Error ? e.message : String(e) }; 
    }
}

// --- Exported Functions ---
export function initializeSystemUtils(sInstance: Store) {
    storeInstance = sInstance;
    console.log("[SystemUtils] Initialized with store instance.");
}

export function startSystemStatsPolling(window: BrowserWindow | null) {
    if (!storeInstance) {
        console.error("[SystemUtils] Store not initialized. Cannot start polling.");
        return;
    }
    if (!window) {
        console.error("[SystemUtils] BrowserWindow instance not provided. Cannot start polling.");
        return;
    }
    if (systemStatsTimer) clearInterval(systemStatsTimer);
    
    console.log("[SystemUtils] Starting system stats polling.");
    systemStatsTimer = setInterval(async () => { 
        const stats = await getSystemStatsInternal(); 
        if (window && !window.isDestroyed()) {
            window.webContents.send("system-stats-update", stats);
        }
    }, 2000); // Poll every 2 seconds
}

export function stopSystemStatsPolling() {
    if (systemStatsTimer) {
        clearInterval(systemStatsTimer);
        systemStatsTimer = null;
        console.log("[SystemUtils] Stopped system stats polling.");
    }
}
