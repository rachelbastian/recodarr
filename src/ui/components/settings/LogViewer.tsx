import React, { useState, useEffect } from 'react';
import { Switch } from "@/components/ui/switch"; // Assuming Shadcn UI path
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area"; // Assuming Shadcn UI path

interface LogEntry {
    timestamp: string;
    level: 'log' | 'warn' | 'error' | 'debug' | 'verbose';
    message: string;
    source?: string; // Ensure this matches the updated type
}

const MAX_UI_LOGS = 500; // Limit logs displayed in UI

const LogViewer: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isVerbose, setIsVerbose] = useState<boolean>(false);
    const [isListening, setIsListening] = useState<boolean>(false);

    useEffect(() => {
        let unsubscribe: (() => void) | null = null;

        const setupLogListener = async () => {
            if (window.electron?.getInitialLogs && window.electron?.subscribeToLogs) {
                try {
                    // Fetch initial logs
                    const initialLogs = await window.electron.getInitialLogs();
                    setLogs(initialLogs.slice(-MAX_UI_LOGS)); // Apply limit to initial logs

                    // Subscribe to new logs
                    unsubscribe = window.electron.subscribeToLogs((logEntry: LogEntry) => {
                        setLogs(prevLogs => {
                            const newLogs = [...prevLogs, logEntry];
                            // Enforce max lines
                            if (newLogs.length > MAX_UI_LOGS) {
                                return newLogs.slice(newLogs.length - MAX_UI_LOGS);
                            }
                            return newLogs;
                        });
                    });
                    setIsListening(true);
                    console.log("[LogViewer] Subscribed to logs.");
                } catch (error) {
                    console.error("[LogViewer] Error setting up log listener:", error);
                    setLogs([{ timestamp: new Date().toISOString(), level: 'error', message: `Failed to initialize log viewer: ${error}` }]);
                    setIsListening(false);
                }
            } else {
                console.error("[LogViewer] Electron log API (getInitialLogs or subscribeToLogs) not found.");
                setLogs([{ timestamp: new Date().toISOString(), level: 'error', message: 'Logging API not available.' }]);
                setIsListening(false);
            }
        };

        setupLogListener();

        // Cleanup function
        return () => {
            if (unsubscribe) {
                console.log("[LogViewer] Unsubscribing from logs.");
                unsubscribe();
            }
            setIsListening(false);
        };
    }, []); // Empty dependency array ensures this runs only once on mount

    const filteredLogs = logs.filter(log =>
        isVerbose ? true : (log.level === 'log' || log.level === 'warn' || log.level === 'error')
    );

    const handleClearLogs = () => {
        setLogs([]);
    };

    const getLogLevelClass = (level: LogEntry['level']): string => {
        switch (level) {
            case 'error': return 'text-red-500';
            case 'warn': return 'text-yellow-500';
            case 'debug': return 'text-blue-400';
            case 'verbose': return 'text-gray-400';
            case 'log':
            default: return 'text-foreground'; // Default text color
        }
    };

    return (
        <div className="rounded-lg border bg-card p-6 text-card-foreground">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Application Logs</h2>
                <div className="flex items-center space-x-4">
                     <Button onClick={handleClearLogs} variant="outline" size="sm" disabled={logs.length === 0}>
                        Clear Logs
                    </Button>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="verbose-switch"
                            checked={isVerbose}
                            onCheckedChange={setIsVerbose}
                        />
                        <Label htmlFor="verbose-switch">Verbose</Label>
                    </div>
                </div>
            </div>

             {/* Log Display Area */}
             <ScrollArea className="h-72 w-full rounded-md border p-4 font-mono text-sm">
                 {filteredLogs.length > 0 ? (
                     filteredLogs.map((log, index) => (
                         <div key={index} className={`whitespace-pre-wrap ${getLogLevelClass(log.level)}`}>
                             <span className="text-muted-foreground mr-2">{log.timestamp}</span>
                             {log.source && <span className="text-muted-foreground mr-1">{`[${log.source}]`}</span>}
                             <span className="font-semibold mr-1 uppercase">{`[${log.level}]`}</span>
                             <span>{log.message}</span>
                         </div>
                     ))
                 ) : (
                     <p className="text-muted-foreground">No logs to display.</p>
                 )}
                 {!isListening && <p className="text-yellow-600 mt-2">Log listening is not active. Backend implementation required.</p>}
             </ScrollArea>

            <p className="text-sm text-muted-foreground mt-2">
                {isVerbose ? 'Showing all logs.' : 'Showing standard logs (log, warn, error).'} Toggle Verbose to see debug/verbose messages.
            </p>
        </div>
    );
};

export default LogViewer; 