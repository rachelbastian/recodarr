import { BrowserWindow } from 'electron';

export type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'verbose';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    source?: string; // Added optional source
    // Optional: Add source (e.g., 'main', 'renderer', 'ffmpegUtils') if needed
}

const MAX_LOG_BUFFER_SIZE = 200; // Keep the last 200 log entries
const logBuffer: LogEntry[] = [];
let mainWindow: BrowserWindow | null = null; // Reference to the main window

/**
 * Sets the main browser window instance for sending logs.
 * @param window The main BrowserWindow instance.
 */
export function setMainWindow(window: BrowserWindow | null): void {
    mainWindow = window;
}

/**
 * Adds a log entry to the buffer and sends it to the renderer process.
 * @param level The severity level of the log.
 * @param message The log message content.
 * @param source Optional source of the log (e.g., 'Main', 'FFmpeg').
 */
export function log(level: LogLevel, message: string, source: string = 'Main'): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        source, // Include source in the entry
    };

    // Add to buffer and enforce size limit (rolling)
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
        logBuffer.shift(); // Remove the oldest entry
    }

    // Send to renderer if the window is available and not destroyed
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            mainWindow.webContents.send('log-message', entry);
        } catch (error) {
             // This can happen if the window is closing
            console.error("[Logger] Failed to send log message to renderer:", error);
            // If sending fails consistently, maybe nullify mainWindow?
            // Or handle specific errors if needed.
        }
    }
}

/**
 * Retrieves the current log buffer.
 * Useful for sending initial logs when the LogViewer mounts.
 * @returns An array of LogEntry objects.
 */
export function getLogBuffer(): LogEntry[] {
    return [...logBuffer]; // Return a copy
}

/**
 * Overrides the global console methods to use our custom logger.
 */
export function captureConsoleLogs(): void {
    const originalConsole = { ...console }; // Keep original methods

    console.log = (...args: any[]) => {
        originalConsole.log(...args); // Keep original behavior
        log('log', formatArgs(args), 'Console'); // Specify source
    };

    console.warn = (...args: any[]) => {
        originalConsole.warn(...args);
        log('warn', formatArgs(args), 'Console'); // Specify source
    };

    console.error = (...args: any[]) => {
        originalConsole.error(...args);
        log('error', formatArgs(args), 'Console'); // Specify source
    };

    console.debug = (...args: any[]) => {
        originalConsole.debug(...args);
        log('debug', formatArgs(args), 'Console'); // Specify source
    };

     console.info = (...args: any[]) => {
        originalConsole.info(...args);
        log('log', formatArgs(args), 'Console'); // Specify source
    };

    console.trace = (...args: any[]) => {
        originalConsole.trace(...args);
        log('error', formatArgs(args), 'Console'); // Specify source
    };

    // Use the log function directly for this internal message
    log('log', 'Console methods captured.', 'Logger');
}

/**
 * Formats console arguments into a single string.
 * Handles objects and arrays reasonably well.
 * @param args Array of arguments passed to console methods.
 * @returns A formatted string representation.
 */
function formatArgs(args: any[]): string {
    return args.map(arg => {
        if (typeof arg === 'string') {
            return arg;
        }
        if (arg instanceof Error) {
            return arg.stack || arg.message;
        }
        try {
            // Attempt to stringify objects/arrays, handle potential circular refs
            return JSON.stringify(arg, getCircularReplacer(), 2);
        } catch (e) {
            // Fallback for complex objects or unstringifiable types
            return String(arg);
        }
    }).join(' ');
}

/**
 * Helper for JSON.stringify to handle circular references.
 */
const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
}; 