import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

// Intel PresentMon types and interfaces
interface IntelGpuMetrics {
    gpuUtilization: number | null; // GPU utilization percentage (0-100)
    gpuMemoryUsed: number | null; // GPU memory used in MB
    gpuMemoryTotal: number | null; // GPU memory total in MB
    gpuTemperature: number | null; // GPU temperature in Celsius
    gpuPowerDraw: number | null; // GPU power draw in watts
    error?: string;
}

// Global variables for PresentMon
let presentMonProcess: ChildProcess | null = null;
let isInitialized = false;
let isAvailable = false;
let lastMetrics: IntelGpuMetrics | null = null;
let metricsUpdateInterval: NodeJS.Timeout | null = null;
const PRESENTMON_SESSION_NAME = 'RecodarrPresentMonSession'; // Unique session name

/**
 * Get the path to the PresentMon executable
 */
function getPresentMonExePath(): string {
    const isDev = process.env.NODE_ENV === 'development';
    const exeName = 'PresentMon-2.3.0-x64.exe';
    
    if (isDev) {
        // In development, look in src/resources
        return path.join(process.cwd(), 'src', 'resources', 'presentmon', exeName);
    } else {
        // In production, look in resources bundled with the app
        return path.join(process.resourcesPath, 'presentmon', exeName);
    }
}

/**
 * Check if Intel PresentMon executable is available
 */
export function isIntelPresentMonAvailable(): boolean {
    // Only log availability check occasionally to reduce spam
    if (Math.random() < 0.01) { // Only log 1% of the time
        console.log(`[IntelPresentMon VERBOSE] isIntelPresentMonAvailable called, returning: ${isAvailable}`);
    }
    return isAvailable;
}

/**
 * Check if a GPU vendor is Intel
 */
export function isIntelGpuDetected(vendor?: string): boolean {
    const result = vendor ? vendor.toLowerCase().includes('intel') : false;
    // Only log GPU detection occasionally to reduce spam
    if (Math.random() < 0.01) { // Only log 1% of the time
        console.log(`[IntelPresentMon VERBOSE] isIntelGpuDetected for vendor "${vendor}", result: ${result}`);
    }
    return result;
}

/**
 * Parse PresentMon CSV output to extract GPU metrics
 */
function parsePresentMonOutput(csvData: string): IntelGpuMetrics {
    console.log(`[IntelPresentMon VERBOSE] Attempting to parse CSV data:
${csvData}`);
    try {
        const lines = csvData.trim().split('\n');
        let dataLines = lines;
        // Look for either the general frame metrics header or the specific GPU metrics line
        const headerIndex = lines.findIndex(line => 
            line.startsWith('Application,ProcessID') || 
            line.startsWith('ProcessName,ProcessID') ||
            line.startsWith('"<gpu_metrics>",0') || // For --output_gpu_metrics
            line.startsWith('<gpu_metrics>,0')      // For --output_gpu_metrics without quotes in some PM versions
        );
        let headers: string[] = [];

        if (headerIndex !== -1) {
            const headerLineContent = lines[headerIndex];
            console.log(`[IntelPresentMon VERBOSE] Found CSV header/data line at line ${headerIndex}: ${headerLineContent}`);
            
            if (headerLineContent.startsWith('"<gpu_metrics>",0') || headerLineContent.startsWith('<gpu_metrics>,0')) {
                // This is a GPU metrics line. The "headers" are fixed based on --output_gpu_metrics documentation
                // GpuName,GpuVendor,GpuCoreClock (MHz),GpuMemoryClock (MHz),GpuBandwidth (GB/s),GpuPower (W),GpuTemperature (C),GpuFanSpeed (RPM),GpuVoltage (V),GpuUtilization (%),GpuMemoryUsed (MB),GpuMemoryTotalSize (MB)
                // We need to extract the values directly from this line, as it's a data line itself.
                headers = [ // Define the expected order of GPU metrics as per documentation
                    'Application', 'ProcessID', // These will be <gpu_metrics>, 0
                    'GpuName', 'GpuVendor', 
                    'GpuCoreClock (MHz)', 'GpuMemoryClock (MHz)', 'GpuBandwidth (GB/s)',
                    'GpuPower (W)', 'GpuTemperature (C)', 'GpuFanSpeed (RPM)', 'GpuVoltage (V)',
                    'GpuUtilization (%)', 'GpuMemoryUsed (MB)', 'GpuMemoryTotalSize (MB)'
                ];
                // If this line is the only data line, use it. Otherwise, we might need to find a later one.
                // For now, assume if this signature is matched, this IS the data line.
                dataLines = [headerLineContent]; 
                console.log(`[IntelPresentMon VERBOSE] GPU metrics line detected. Using fixed headers and this line for data.`);
            } else {
                // Standard frame data header
                headers = headerLineContent.split(',').map(h => h.trim());
                dataLines = lines.slice(headerIndex + 1);
            }
        } else {
            console.log(`[IntelPresentMon VERBOSE] No CSV header line found starting with common patterns. Assuming last line is data or data starts at line 0 if no other filtering happened.`);
        }

        if (dataLines.length < 1) {
            const errorMsg = 'No data lines found in PresentMon output after potentially skipping headers';
            console.warn(`[IntelPresentMon] ${errorMsg}`);
            return { gpuUtilization: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuTemperature: null, gpuPowerDraw: null, error: errorMsg };
        }

        const latestDataLine = dataLines[dataLines.length - 1];
        console.log(`[IntelPresentMon VERBOSE] Last data line for parsing: "${latestDataLine}"`);
        const values = latestDataLine.split(',').map(v => v.trim());

        let gpuUtilization: number | null = null;
        let gpuMemoryUsed: number | null = null;
        let gpuMemoryTotal: number | null = null;
        let gpuTemperature: number | null = null;
        let gpuPowerDraw: number | null = null;

        const colNameMapping = {
            utilization: ['GpuUtilization (%)', 'GPU Utilization (%)'], // Added exact match from help
            temperature: ['GpuTemperature (C)', 'GPU Temperature (C)'], // Added exact match from help
            power: ['GpuPower (W)', 'GPU Power (W)'],                 // Added exact match from help
            memUsed: ['GpuMemoryUsed (MB)', 'GPU Memory Used (MB)'],     // Added exact match from help
            memTotal: ['GpuMemoryTotalSize (MB)', 'GPU Memory Total Size (MB)'] // Added exact match from help
        };

        function findValue(metricKeys: string[]): number | null {
            if (headers.length === 0) return null;
            for (const key of metricKeys) {
                const idx = headers.indexOf(key);
                if (idx !== -1 && values.length > idx) {
                    const val = parseFloat(values[idx]);
                    if (!isNaN(val)) return val;
                }
            }
            return null;
        }

        if (headers.length > 0) {
            gpuUtilization = findValue(colNameMapping.utilization);
            gpuTemperature = findValue(colNameMapping.temperature);
            gpuPowerDraw = findValue(colNameMapping.power);
            gpuMemoryUsed = findValue(colNameMapping.memUsed);
            gpuMemoryTotal = findValue(colNameMapping.memTotal);
        } else {
            console.warn(`[IntelPresentMon VERBOSE] Parsing without headers, relying on fixed indices (highly unreliable).`);
        }

        console.log(`[IntelPresentMon VERBOSE] Parsed metrics: Util=${gpuUtilization}, Temp=${gpuTemperature}, Power=${gpuPowerDraw}, MemUsed=${gpuMemoryUsed}, MemTotal=${gpuMemoryTotal}`);
        if (gpuUtilization === null && gpuMemoryUsed === null && gpuMemoryTotal === null && gpuTemperature === null && gpuPowerDraw === null && headers.length > 0) {
            const errorMsg = "All parsed metric values are null, despite having headers. Check column name mappings and PresentMon CSV output.";
            console.warn(`[IntelPresentMon] ${errorMsg}`);
            return { gpuUtilization, gpuMemoryUsed, gpuMemoryTotal, gpuTemperature, gpuPowerDraw, error: errorMsg };
        } else if (gpuUtilization === null && headers.length === 0 && dataLines.length > 0) {
            const errorMsg = "Parsing without headers failed to find any metrics from the available data line.";
            console.warn(`[IntelPresentMon] ${errorMsg}`);
            return { gpuUtilization, gpuMemoryUsed, gpuMemoryTotal, gpuTemperature, gpuPowerDraw, error: errorMsg };
        }

        return { gpuUtilization, gpuMemoryUsed, gpuMemoryTotal, gpuTemperature, gpuPowerDraw };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[IntelPresentMon] Error parsing PresentMon output: ${errorMsg}`);
        return { gpuUtilization: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuTemperature: null, gpuPowerDraw: null, error: `Parsing error: ${errorMsg}` };
    }
}

/**
 * Run PresentMon to get current GPU metrics
 */
async function runPresentMonForMetrics(): Promise<IntelGpuMetrics> {
    console.log(`[IntelPresentMon VERBOSE] runPresentMonForMetrics called`);
    return new Promise((resolve) => {
        const exePath = getPresentMonExePath();
        console.log(`[IntelPresentMon VERBOSE] Metrics: Executable path: ${exePath}`);
        
        const args = [
            '--session_name', PRESENTMON_SESSION_NAME,
            '--stop_existing_session',
            '--timed', '2.5',
            '--output_stdout',
            '--no_console_stats',
            '--terminate_after_timed'
        ];
        console.log(`[IntelPresentMon VERBOSE] Metrics: Spawning with arguments: ${args.join(' ')}`);

        const presentMon = spawn(exePath, args, {
            windowsHide: true,
            detached: false,
        });

        let csvOutput = '';
        let errorOutput = '';

        presentMon.stdout?.on('data', (data) => {
            const dataStr = data.toString();
            console.log(`[IntelPresentMon VERBOSE] Metrics: stdout data chunk: ${dataStr}`);
            csvOutput += dataStr;
        });

        presentMon.stderr?.on('data', (data) => {
            const dataStr = data.toString();
            console.error(`[IntelPresentMon VERBOSE] Metrics: stderr data chunk: ${dataStr}`);
            errorOutput += dataStr;
        });

        presentMon.on('close', (code) => {
            console.log(`[IntelPresentMon VERBOSE] Metrics: Process closed with code: ${code}`);
            console.log(`[IntelPresentMon VERBOSE] Metrics: Full stdout:\n${csvOutput.trim()}`);
            console.log(`[IntelPresentMon VERBOSE] Metrics: Full stderr:\n${errorOutput.trim()}`);

            if (code === 0 && csvOutput.trim()) {
                const metrics = parsePresentMonOutput(csvOutput);
                resolve(metrics);
            } else if (code !== 0) {
                const errorMsg = `PresentMon metrics process exited with code ${code}. Stderr: ${errorOutput.trim() || 'Unknown error'}`;
                console.error(`[IntelPresentMon] ${errorMsg}`);
                resolve({ gpuUtilization: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuTemperature: null, gpuPowerDraw: null, error: errorMsg });
            } else { 
                 const errorMsg = `PresentMon metrics process exited with code 0 but no stdout data. Stderr: ${errorOutput.trim() || 'No stderr output'}`;
                 console.warn(`[IntelPresentMon] ${errorMsg}`);
                 resolve({ gpuUtilization: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuTemperature: null, gpuPowerDraw: null, error: errorMsg });
            }
        });

        presentMon.on('error', (error) => {
            const errorMsg = `Failed to spawn PresentMon for metrics: ${error.message}`;
            console.error(`[IntelPresentMon VERBOSE] Metrics: Spawn error: ${errorMsg}`);
            resolve({ gpuUtilization: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuTemperature: null, gpuPowerDraw: null, error: errorMsg });
        });

        setTimeout(() => {
            if (!presentMon.killed) {
                console.warn(`[IntelPresentMon VERBOSE] Metrics: Process timed out after 7s, killing.`);
                presentMon.kill('SIGTERM'); 
                setTimeout(() => { 
                    if(!presentMon.killed) presentMon.kill('SIGKILL'); 
                }, 1000); 
                resolve({ gpuUtilization: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuTemperature: null, gpuPowerDraw: null, error: 'PresentMon metrics process timeout' });
            }
        }, 7000); 
    });
}

/**
 * Initialize Intel PresentMon
 */
export async function initializeIntelPresentMon(): Promise<boolean> {
    if (isInitialized) {
        console.log(`[IntelPresentMon VERBOSE] Already initialized. Available: ${isAvailable}`);
        return isAvailable;
    }

    console.log('[IntelPresentMon VERBOSE] Initializing Intel PresentMon integration...');
    const exePath = getPresentMonExePath();
    console.log(`[IntelPresentMon VERBOSE] Init: Executable path: ${exePath}`);
    
    try {
        if (!fs.existsSync(exePath)) {
            console.warn(`[IntelPresentMon] PresentMon executable not found at: ${exePath}`);
            isInitialized = true;
            isAvailable = false;
            return false;
        }
        console.log(`[IntelPresentMon VERBOSE] Init: Found PresentMon executable at: ${exePath}`);

        const args = [
            '--session_name', PRESENTMON_SESSION_NAME,
            '--timed', '1',
            '--no_console_stats',
            '--stop_existing_session',
            '--terminate_after_timed'
        ];
        console.log(`[IntelPresentMon VERBOSE] Init: Spawning test process with arguments: ${args.join(' ')}`);

        const testResult = await new Promise<boolean>((resolve) => {
            const testProcess = spawn(exePath, args, { windowsHide: true });
            let testStdout = '';
            let testStderr = '';

            testProcess.stdout?.on('data', (data) => { testStdout += data.toString(); });
            testProcess.stderr?.on('data', (data) => { testStderr += data.toString(); });

            testProcess.on('close', (code) => {
                console.log(`[IntelPresentMon VERBOSE] Init: Test process closed with code: ${code}`);
                console.log(`[IntelPresentMon VERBOSE] Init: Test stdout:\n${testStdout.trim()}`);
                console.log(`[IntelPresentMon VERBOSE] Init: Test stderr:\n${testStderr.trim()}`);
                resolve(code === 0);
            });

            testProcess.on('error', (error) => {
                console.error(`[IntelPresentMon VERBOSE] Init: Test spawn error: ${error.message}`);
                resolve(false);
            });

            setTimeout(() => {
                if (!testProcess.killed) {
                    console.warn(`[IntelPresentMon VERBOSE] Init: Test process timed out after 5s, killing.`);
                    testProcess.kill('SIGTERM');
                     setTimeout(() => { if(!testProcess.killed) testProcess.kill('SIGKILL'); }, 1000);
                    resolve(false);
                }
            }, 5000); 
        });

        if (testResult) {
            console.log('[IntelPresentMon] PresentMon executable test successful. Integration considered available.');
            isAvailable = true;
        } else {
            console.warn('[IntelPresentMon] PresentMon executable test failed or exited with non-zero code. Integration unavailable.');
            isAvailable = false;
        }

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[IntelPresentMon] Critical error during PresentMon initialization: ${errorMsg}`);
        isAvailable = false;
    }

    isInitialized = true;
    console.log(`[IntelPresentMon VERBOSE] Initialization complete. isAvailable: ${isAvailable}`);
    return isAvailable;
}

/**
 * Get Intel GPU metrics using PresentMon
 */
export async function getIntelGpuMetrics(): Promise<IntelGpuMetrics> {
    console.log(`[IntelPresentMon VERBOSE] getIntelGpuMetrics called. Initialized: ${isInitialized}, Available: ${isAvailable}`);
    if (!isInitialized || !isAvailable) {
        const errorMsg = 'PresentMon not initialized or not available';
        console.warn(`[IntelPresentMon] ${errorMsg}`);
        return { gpuUtilization: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuTemperature: null, gpuPowerDraw: null, error: errorMsg };
    }

    try {
        console.log(`[IntelPresentMon VERBOSE] Requesting fresh metrics from PresentMon...`);
        const metrics = await runPresentMonForMetrics();
        console.log(`[IntelPresentMon VERBOSE] Received metrics from runPresentMonForMetrics: ${JSON.stringify(metrics)}`);
        lastMetrics = metrics;
        return metrics;

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[IntelPresentMon] Error in getIntelGpuMetrics: ${errorMsg}`);
        return { gpuUtilization: null, gpuMemoryUsed: null, gpuMemoryTotal: null, gpuTemperature: null, gpuPowerDraw: null, error: `API Error: ${errorMsg}` };
    }
}

/**
 * Shutdown Intel PresentMon
 */
export async function shutdownIntelPresentMon(): Promise<void> {
    console.log('[IntelPresentMon VERBOSE] Shutting down Intel PresentMon integration...');

    if (metricsUpdateInterval) {
        clearInterval(metricsUpdateInterval);
        metricsUpdateInterval = null;
        console.log(`[IntelPresentMon VERBOSE] Cleared metrics update interval`);
    }

    if (presentMonProcess && !presentMonProcess.killed) {
        console.log(`[IntelPresentMon VERBOSE] Killing active PresentMon process (PID: ${presentMonProcess.pid})`);
        presentMonProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 500));
        if (presentMonProcess && !presentMonProcess.killed) {
            presentMonProcess.kill('SIGKILL');
        }
        presentMonProcess = null;
    }

    isInitialized = false;
    isAvailable = false;
    lastMetrics = null;
    console.log('[IntelPresentMon VERBOSE] Shutdown complete. Reset state.');
} 