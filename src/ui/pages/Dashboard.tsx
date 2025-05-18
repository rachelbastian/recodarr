import React, { useState, useEffect, useCallback } from 'react';
import GaugeWidget from '../components/GaugeWidget';
import { 
    useReactTable, 
    getCoreRowModel, 
    ColumnDef, 
    flexRender 
} from '@tanstack/react-table';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SystemStats } from '../../../types'; // Import SystemStats
import { ArrowUpIcon, ArrowDownIcon } from '@radix-ui/react-icons';
import {
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    Legend, 
    ResponsiveContainer,
    Area,
    AreaChart
} from 'recharts'; // Import Recharts components

// Helper to format bytes
function formatBytes(bytes: number | null, decimals = 2): string {
    if (bytes === null || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    // Ensure bytes is not NaN before calculations
    if (isNaN(bytes) || !isFinite(bytes)) return 'N/A';
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


// Interface for fetched media data subset
interface MediaStatsData {
    id: number;
    originalSize: number | null;
    currentSize: number | null;
}

// Interface for top largest files
interface LargestFileData {
    id: number;
    title: string;
    filePath: string;
    currentSize: number;
}

// Interface for calculated dashboard stats
interface DashboardMediaStats {
    totalCount: number;
    totalOriginalSize: number | null;
    totalCurrentSize: number | null;
    totalSavedSize: number | null;
    percentageSaved: number | null;
}

// Interface for Performance History Records (should match preload.cts)
interface PerformanceHistoryRecord {
    timestamp: string;
    cpu_load: number | null;
    gpu_load: number | null;
    memory_load: number | null;
}

// Transformed data for charts
interface ChartDataPoint {
    time: string; // Formatted time for XAxis
    cpu?: number | null;
    gpu?: number | null;
    memory?: number | null;
}

// Default state structure matching SystemStats type
const defaultSystemStats: SystemStats = {
    cpuLoad: null,
    memLoad: null,
    gpuLoad: null,
    gpuMemoryUsed: null,
    gpuMemoryTotal: null,
    gpuMemoryUsagePercent: null,
};

// Default state for media stats
const defaultMediaStats: DashboardMediaStats = {
    totalCount: 0,
    totalOriginalSize: 0,
    totalCurrentSize: 0,
    totalSavedSize: 0,
    percentageSaved: 0,
};

const DATA_REFRESH_INTERVAL = 60000; // Refresh historical data every 60 seconds
const MEDIA_STATS_REFRESH_INTERVAL = 300000; // Refresh media stats every 5 minutes (example)

// Custom tooltip for performance chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/90 backdrop-blur p-3 rounded-lg border border-border/30 shadow-lg">
        <p className="text-sm font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-2 text-sm">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium">{entry.value !== null ? `${entry.value.toFixed(1)}%` : 'N/A'}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const Dashboard: React.FC = () => {
    const [systemStats, setSystemStats] = useState<SystemStats>(defaultSystemStats);
    const [mediaStats, setMediaStats] = useState<DashboardMediaStats>(defaultMediaStats);
    const [largestFiles, setLargestFiles] = useState<LargestFileData[]>([]); // State for largest files
    const [isLoadingMediaStats, setIsLoadingMediaStats] = useState<boolean>(true);
    const [mediaStatsError, setMediaStatsError] = useState<string | null>(null);

    // State for historical performance data
    const [performanceHistory, setPerformanceHistory] = useState<ChartDataPoint[]>([]);
    const [isLoadingPerformanceHistory, setIsLoadingPerformanceHistory] = useState<boolean>(true);
    const [performanceHistoryError, setPerformanceHistoryError] = useState<string | null>(null);

    // Define columns for the largest files table
    const columns: ColumnDef<LargestFileData>[] = [
        {
            accessorKey: 'currentSize',
            header: 'Size',
            cell: info => formatBytes(info.getValue<number>()),
        },
        {
            accessorKey: 'title',
            header: 'Title',
            cell: info => <span className="truncate block max-w-[500px]" title={info.row.original.filePath}>{info.getValue<string>()}</span>
        },
    ];

    const table = useReactTable({
        data: largestFiles,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    const fetchDashboardData = useCallback(async (isInitialLoad = false) => {
        if (isInitialLoad) {
            setIsLoadingMediaStats(true);
        }
        setMediaStatsError(null);
        try {
            const allMediaResults = await window.electron.dbQuery('SELECT id, originalSize, currentSize FROM media', []);
            const mediaData = allMediaResults as MediaStatsData[];
            const totalCount = mediaData.length;
            const totalOriginalSize = mediaData.reduce((sum, item) => sum + (item.originalSize ?? 0), 0);
            const totalCurrentSize = mediaData.reduce((sum, item) => sum + (item.currentSize ?? 0), 0);
            const totalSavedSize = totalOriginalSize > 0 ? totalOriginalSize - totalCurrentSize : 0;
            const percentageSaved = totalOriginalSize > 0 ? (totalSavedSize / totalOriginalSize) * 100 : 0;
            setMediaStats({
                totalCount,
                totalOriginalSize: totalOriginalSize || null, 
                totalCurrentSize: totalCurrentSize || null,   
                totalSavedSize: totalSavedSize || null,     
                percentageSaved: totalOriginalSize > 0 ? percentageSaved : null
            });
            const largestFilesResults = await window.electron.dbQuery(
                'SELECT id, title, filePath, currentSize FROM media WHERE currentSize IS NOT NULL ORDER BY currentSize DESC LIMIT 10', 
                []
            );
            setLargestFiles(largestFilesResults as LargestFileData[]);
        } catch (err) {
            console.error("Error fetching dashboard data:", err);
            setMediaStatsError(err instanceof Error ? err.message : 'Failed to fetch media statistics');
            // Keep stale data on error for subsequent fetches
            if(isInitialLoad) {
                setMediaStats(defaultMediaStats); 
                setLargestFiles([]); 
            }
        } finally {
            if (isInitialLoad) {
                setIsLoadingMediaStats(false);
            }
        }
    }, []);

    const fetchPerformanceHistoryData = useCallback(async (isInitialLoad = false) => {
        if (isInitialLoad) {
            setIsLoadingPerformanceHistory(true);
        }
        setPerformanceHistoryError(null);
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 1); // Last 24 hours
            const historyResults = await window.electron.getPerformanceHistory(
                startDate.toISOString(), 
                endDate.toISOString()
            ) as PerformanceHistoryRecord[];
            const formattedData = historyResults.map(record => ({
                time: new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                cpu: record.cpu_load,
                gpu: record.gpu_load,
                memory: record.memory_load,
            }));
            setPerformanceHistory(formattedData);
        } catch (err) {
            console.error("Error fetching performance history:", err);
            setPerformanceHistoryError(err instanceof Error ? err.message : 'Failed to fetch performance history');
        } finally {
            if (isInitialLoad) {
                setIsLoadingPerformanceHistory(false);
            }
        }
    }, []);

    useEffect(() => {
        // Initial data fetches
        fetchDashboardData(true); // Initial media stats fetch
        fetchPerformanceHistoryData(true); // Initial performance history fetch

        // Setup interval for refreshing performance history data
        const historyIntervalId = setInterval(() => fetchPerformanceHistoryData(false), DATA_REFRESH_INTERVAL);
        // Setup interval for refreshing media stats and largest files
        const mediaStatsIntervalId = setInterval(() => fetchDashboardData(false), MEDIA_STATS_REFRESH_INTERVAL);

        // Subscribe to system stats updates for gauges
        const unsubscribeSystemStats = window.electron.subscribeSystemStats((stats: SystemStats) => {
            setSystemStats(stats);
        });

        // Clean up subscriptions and intervals on component unmount
        return () => {
            unsubscribeSystemStats();
            clearInterval(historyIntervalId);
            clearInterval(mediaStatsIntervalId); // Clear media stats interval
        };
    }, [fetchDashboardData, fetchPerformanceHistoryData]); // Add both fetch functions to dependency array

  return (
    <div className="flex-1 overflow-auto">
      <main className="container mx-auto p-8">
        <div className="space-y-8">
          {/* Header Section */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">System Dashboard</h1>
              <p className="text-muted-foreground mt-2">Monitor your system performance and media statistics</p>
            </div>
          </div>

          {mediaStatsError && (
            <div className="rounded-lg bg-destructive/15 p-4 text-destructive">
              <p>{mediaStatsError}</p>
            </div>
          )}

          {/* System Performance Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">System Performance</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm transition-all hover:shadow-md hover:bg-card/40">
                <GaugeWidget
                  value={systemStats.cpuLoad}
                  label="CPU Usage"
                  colorScheme="purple"
                />
              </div>
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm transition-all hover:shadow-md hover:bg-card/40">
                <GaugeWidget
                  value={systemStats.memLoad}
                  label="Memory Usage"
                  colorScheme="green"
                />
              </div>
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm transition-all hover:shadow-md hover:bg-card/40">
                <GaugeWidget
                  value={systemStats.gpuLoad}
                  label="GPU Usage"
                  colorScheme="blue"
                />
              </div>
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm transition-all hover:shadow-md hover:bg-card/40">
                <GaugeWidget
                  value={systemStats.gpuMemoryUsagePercent ?? null}
                  label="GPU Memory"
                  colorScheme="orange"
                />
              </div>
            </div>
          </div>

          {/* Historical Performance Section - MOVED UP */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Performance History (Last 24 Hours)</h2>
            {performanceHistoryError && (
              <div className="rounded-lg bg-destructive/15 p-4 text-destructive">
                <p>{performanceHistoryError}</p>
              </div>
            )}
            
            {isLoadingPerformanceHistory ? (
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm h-[350px] flex items-center justify-center">
                <p className="text-muted-foreground">Loading performance data...</p>
              </div>
            ) : performanceHistory.length > 0 ? (
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm transition-all hover:shadow-md hover:bg-card/40">
                <div className="mb-3 flex flex-col sm:flex-row sm:justify-between sm:items-center">
                  <h3 className="text-lg font-medium text-foreground">CPU & GPU Utilization</h3>
                  <div className="flex items-center gap-4 mt-2 sm:mt-0">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#8b5cf6]" />
                      <span className="text-sm text-muted-foreground">CPU</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                      <span className="text-sm text-muted-foreground">GPU</span>
                    </div>
                  </div>
                </div>
                
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={performanceHistory} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                      <defs>
                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorGpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        stroke="#a1a1aa" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={{ strokeOpacity: 0.2 }}
                        tickMargin={10}
                      />
                      <YAxis 
                        stroke="#a1a1aa" 
                        fontSize={12} 
                        domain={[0, 100]} 
                        tickFormatter={(value) => `${value}%`} 
                        tickLine={false}
                        axisLine={{ strokeOpacity: 0.2 }}
                        tickMargin={10}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="cpu" 
                        stroke="#8b5cf6" 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#colorCpu)" 
                        name="CPU Load"
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="gpu" 
                        stroke="#3b82f6" 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#colorGpu)" 
                        name="GPU Load"
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm h-[350px] flex items-center justify-center">
                <p className="text-muted-foreground">No performance data available for the last 24 hours.</p>
              </div>
            )}
          </div>

          {/* Media Stats Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Media Statistics</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm transition-all hover:shadow-md hover:bg-card/40">
                <div className="flex flex-col space-y-2">
                  <span className="text-muted-foreground text-sm">Total Media Files</span>
                  <span className="text-3xl font-bold">
                    {isLoadingMediaStats ? 'Loading...' : mediaStats.totalCount}
                  </span>
                </div>
              </div>
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm transition-all hover:shadow-md hover:bg-card/40">
                <div className="flex flex-col space-y-2">
                  <span className="text-muted-foreground text-sm">Current Storage</span>
                  <span className="text-3xl font-bold">
                    {isLoadingMediaStats ? 'Loading...' : formatBytes(mediaStats.totalCurrentSize)}
                  </span>
                </div>
              </div>
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm transition-all hover:shadow-md hover:bg-card/40">
                <div className="flex flex-col space-y-2">
                  <span className="text-muted-foreground text-sm">Original Storage</span>
                  <span className="text-3xl font-bold">
                    {isLoadingMediaStats ? 'Loading...' : formatBytes(mediaStats.totalOriginalSize)}
                  </span>
                </div>
              </div>
              <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm transition-all hover:shadow-md hover:bg-card/40">
                <div className="flex flex-col space-y-2">
                  <span className="text-muted-foreground text-sm">Space Saved</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">
                      {isLoadingMediaStats ? 'Loading...' : formatBytes(mediaStats.totalSavedSize)}
                    </span>
                    {mediaStats.percentageSaved && (
                      <span className="text-sm text-emerald-500 flex items-center">
                        <ArrowUpIcon className="mr-1 h-3 w-3" />
                        {mediaStats.percentageSaved.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Largest Files Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Largest Files</h2>
            <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm">
              {isLoadingMediaStats ? (
                <div className="flex h-[400px] items-center justify-center">
                  <p className="text-muted-foreground">Loading data...</p>
                </div>
              ) : largestFiles.length > 0 ? (
                <ScrollArea className="h-[400px] rounded-lg">
                  <Table>
                    <TableHeader className="bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                      {table.getHeaderGroups().map(headerGroup => (
                        <TableRow key={headerGroup.id} className="border-b border-border/50">
                          {headerGroup.headers.map(header => (
                            <TableHead key={header.id} className="text-muted-foreground font-medium">
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows.map(row => (
                        <TableRow 
                          key={row.id}
                          className="transition-colors hover:bg-primary/5 border-b border-border/40"
                        >
                          {row.getVisibleCells().map(cell => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="flex h-[400px] items-center justify-center">
                  <p className="text-muted-foreground">No media files found.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard; 