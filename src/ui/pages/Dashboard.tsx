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
    AreaChart,
    ComposedChart
} from 'recharts'; // Import Recharts components
import { Badge } from "@/components/ui/badge";
import { 
    Tooltip as UITooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Film, Music, Maximize2, FileVideo, FileAudio, FolderOpen, Check } from 'lucide-react';

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
    originalSize: number;
    encodingJobId?: string | null;
    videoCodec?: string | null;
    audioCodec?: string | null;
    resolutionWidth?: number | null;
    resolutionHeight?: number | null;
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

// Resolution icon component
const ResolutionIcon: React.FC<{ height: number | null }> = ({ height }) => {
    if (!height) return null;
    
    if (height >= 4320) {
        return <span className="font-bold text-[8px] bg-purple-500/20 text-purple-500 px-1 rounded">8K</span>;
    } else if (height >= 2160) {
        return <span className="font-bold text-[8px] bg-indigo-500/20 text-indigo-500 px-1 rounded">4K</span>;
    } else if (height >= 1440) {
        return <span className="font-bold text-[8px] bg-blue-500/20 text-blue-500 px-1 rounded">2K</span>;
    } else if (height >= 1080) {
        return <span className="font-bold text-[8px] bg-green-500/20 text-green-500 px-1 rounded">HD</span>;
    } else if (height >= 720) {
        return <span className="font-bold text-[8px] bg-yellow-500/20 text-yellow-500 px-1 rounded">HD</span>;
    } else if (height >= 480) {
        return <span className="font-bold text-[8px] bg-orange-500/20 text-orange-500 px-1 rounded">SD</span>;
    } else {
        return <span className="font-bold text-[8px] bg-red-500/20 text-red-500 px-1 rounded">SD</span>;
    }
};

// Audio codec icon component
const AudioCodecIcon: React.FC<{ codec: string | null }> = ({ codec }) => {
    if (!codec) return null;
    
    const upperCodec = codec.toUpperCase();
    
    // Dolby formats
    if (upperCodec.includes('EAC3') || upperCodec.includes('AC3') || upperCodec.includes('TRUEHD') || upperCodec.includes('DOLBY')) {
        return (
            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                <FileAudio className="h-3 w-3 mr-1" />
                Dolby
            </Badge>
        );
    }
    
    // DTS formats
    if (upperCodec.includes('DTS')) {
        return (
            <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                <FileAudio className="h-3 w-3 mr-1" />
                DTS
            </Badge>
        );
    }
    
    if (upperCodec === 'AAC') {
        return (
            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                <FileAudio className="h-3 w-3 mr-1" />
                AAC
            </Badge>
        );
    }
    
    // Default for other codecs
    return (
        <Badge variant="outline" className="text-xs bg-gray-500/10 text-gray-500 border-gray-500/20">
            <FileAudio className="h-3 w-3 mr-1" />
            {upperCodec.slice(0, 4)}
        </Badge>
    );
};

// Video codec icon component
const VideoCodecIcon: React.FC<{ codec: string | null }> = ({ codec }) => {
    if (!codec) return null;
    
    const upperCodec = codec.toUpperCase();
    
    if (upperCodec.includes('HEVC') || upperCodec.includes('H265')) {
        return (
            <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-500 border-purple-500/20">
                <FileVideo className="h-3 w-3 mr-1" />
                HEVC
            </Badge>
        );
    }
    
    if (upperCodec.includes('AVC') || upperCodec.includes('H264')) {
        return (
            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                <FileVideo className="h-3 w-3 mr-1" />
                AVC
            </Badge>
        );
    }
    
    if (upperCodec.includes('AV1')) {
        return (
            <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                <FileVideo className="h-3 w-3 mr-1" />
                AV1
            </Badge>
        );
    }
    
    if (upperCodec.includes('VP9')) {
        return (
            <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-500 border-cyan-500/20">
                <FileVideo className="h-3 w-3 mr-1" />
                VP9
            </Badge>
        );
    }
    
    // Default for other codecs
    return (
        <Badge variant="outline" className="text-xs bg-gray-500/10 text-gray-500 border-gray-500/20">
            <FileVideo className="h-3 w-3 mr-1" />
            {upperCodec.slice(0, 4)}
        </Badge>
    );
};

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
            
            // Updated query to include codec and resolution information
            const largestFilesResults = await window.electron.dbQuery(
                `SELECT 
                    m.id, m.title, m.filePath, m.currentSize, m.originalSize, m.encodingJobId,
                    m.videoCodec, m.audioCodec, 
                    m.resolutionWidth, m.resolutionHeight
                FROM media AS m
                WHERE m.currentSize IS NOT NULL 
                ORDER BY m.currentSize DESC 
                LIMIT 10`, 
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
            
            const formattedData = historyResults.map(record => {
                // SQLite returns timestamps in UTC format like "2024-01-01 12:00:00"
                // We need to explicitly parse it as UTC and convert to local time
                let localDate: Date;
                
                if (record.timestamp.includes('T')) {
                    // ISO format (with T separator)
                    localDate = new Date(record.timestamp);
                } else {
                    // SQLite format "YYYY-MM-DD HH:MM:SS" - treat as UTC
                    localDate = new Date(record.timestamp + ' UTC');
                }
                
                return {
                    time: localDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    cpu: record.cpu_load,
                    gpu: record.gpu_load,
                    memory: record.memory_load,
                };
            });
            
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
                  <h3 className="text-lg font-medium text-foreground">CPU, GPU & Memory Utilization</h3>
                  <div className="flex items-center gap-4 mt-2 sm:mt-0">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#8b5cf6]" />
                      <span className="text-sm text-muted-foreground">CPU</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                      <span className="text-sm text-muted-foreground">GPU</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#eab308]" />
                      <span className="text-sm text-muted-foreground">Memory</span>
                    </div>
                  </div>
                </div>
                
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={performanceHistory} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                      <defs>
                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
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
                      
                      {/* CPU - Base layer with gradient */}
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
                      
                      {/* Memory - Yellow glowing line (middle layer) */}
                      <Line 
                        type="stepAfter" 
                        dataKey="memory" 
                        stroke="#eab308" 
                        strokeWidth={3} 
                        dot={false}
                        name="Memory Load"
                        activeDot={{ r: 6, strokeWidth: 0, fill: "#eab308", filter: "drop-shadow(0px 0px 8px #eab308)" }}
                        style={{ filter: "drop-shadow(0px 0px 4px #eab308)" }}
                      />
                      
                      {/* GPU - Blue glowing line (top layer) */}
                      <Line 
                        type="monotone" 
                        dataKey="gpu" 
                        stroke="#3b82f6" 
                        strokeWidth={3} 
                        dot={false}
                        name="GPU Load"
                        activeDot={{ r: 6, strokeWidth: 0, fill: "#3b82f6", filter: "drop-shadow(0px 0px 8px #3b82f6)" }}
                        style={{ filter: "drop-shadow(0px 0px 4px #3b82f6)" }}
                      />
                    </ComposedChart>
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

          {/* Largest Files Section - Updated with Media page styling and responsive sizing */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Largest Files</h2>
            <div className="rounded-xl border bg-card/30 p-6 backdrop-blur-sm">
              {isLoadingMediaStats ? (
                <div className="flex h-[400px] items-center justify-center">
                  <p className="text-muted-foreground">Loading data...</p>
                </div>
              ) : largestFiles.length > 0 ? (
                <ScrollArea 
                  className="rounded-lg"
                  style={{ height: largestFiles.length < 10 ? `${Math.max(largestFiles.length * 120, 240)}px` : '400px' }}
                >
                  <div className="flex flex-col gap-2">
                    {largestFiles.map((file) => (
                      <div key={file.id} className="border rounded-lg hover:border-primary transition-colors bg-card overflow-hidden">
                        <div className="p-4">
                          <div className="grid grid-cols-[1fr_auto] gap-3 items-start w-full">
                            {/* Main content column */}
                            <div className="min-w-0 pr-6 relative">
                              <div className="flex items-baseline min-w-0">
                                <div className="w-10 flex-shrink-0 relative">
                                  <span className="text-xs font-medium text-muted-foreground">Title:</span>
                                  <div className="absolute right-0 top-0 bottom-0 w-px h-full bg-border"></div>
                                </div>
                                <h3 className="font-medium text-base truncate flex-1 pl-2" title={file.title}>
                                  {file.title}
                                </h3>
                              </div>
                              
                              <div className="flex items-center mt-1.5 min-w-0">
                                <div className="w-10 flex-shrink-0 relative">
                                  <span className="text-xs font-medium text-muted-foreground">Path:</span>
                                  <div className="absolute right-0 top-0 bottom-0 w-px h-full bg-border"></div>
                                </div>
                                <div className="text-[10px] text-muted-foreground/60 truncate flex-1 pl-2" title={file.filePath}>
                                  <FolderOpen className="inline-block h-3 w-3 mr-1" />
                                  {file.filePath.split(/[/\\]/).slice(0, -1).join('/')}
                                </div>
                              </div>
                              
                              {/* Tags section at the bottom */}
                              <div className="flex flex-wrap gap-1.5 mt-3 ml-10">
                                <TooltipProvider delayDuration={200}>
                                  <UITooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className="text-xs bg-background/50">
                                        <Film className="h-2.5 w-2.5 mr-1" />
                                        {file.resolutionWidth && file.resolutionHeight ? `${file.resolutionWidth}×${file.resolutionHeight}` : 'Unknown'}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      <p>Resolution: {file.resolutionWidth && file.resolutionHeight ? `${file.resolutionWidth}×${file.resolutionHeight}` : 'Unknown'}</p>
                                    </TooltipContent>
                                  </UITooltip>
                                  
                                  {file.resolutionHeight && (
                                    <UITooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="text-xs bg-background/50">
                                          <Maximize2 className="h-2.5 w-2.5 mr-1" />
                                          {file.resolutionHeight >= 4320 ? '8K' :
                                            file.resolutionHeight >= 2160 ? '4K' :
                                            file.resolutionHeight >= 1440 ? '2K' :
                                            file.resolutionHeight >= 1080 ? '1080P' :
                                            file.resolutionHeight >= 720 ? '720P' :
                                            file.resolutionHeight >= 480 ? '480P' : 'SD'}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs">
                                        <p>Quality: {file.resolutionHeight >= 4320 ? '8K' :
                                          file.resolutionHeight >= 2160 ? '4K' :
                                          file.resolutionHeight >= 1440 ? '2K' :
                                          file.resolutionHeight >= 1080 ? 'Full HD' :
                                          file.resolutionHeight >= 720 ? 'HD' : 'Standard Definition'}</p>
                                      </TooltipContent>
                                    </UITooltip>
                                  )}
                                  
                                  {file.videoCodec && (
                                    <UITooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="text-xs bg-background/50">
                                          <FileVideo className="h-2.5 w-2.5 mr-1" />
                                          {file.videoCodec}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs">
                                        <p>Video Codec: {file.videoCodec}</p>
                                      </TooltipContent>
                                    </UITooltip>
                                  )}
                                  
                                  {file.audioCodec && (
                                    <UITooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="text-xs bg-background/50">
                                          <FileAudio className="h-2.5 w-2.5 mr-1" />
                                          {file.audioCodec}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs">
                                        <p>Audio Codec: {file.audioCodec}</p>
                                      </TooltipContent>
                                    </UITooltip>
                                  )}
                                </TooltipProvider>
                              </div>
                              
                              {/* Vertical divider */}
                              <div className="absolute right-3 top-0 bottom-0 w-px bg-border"></div>
                            </div>
                            
                            {/* Right side column with size */}
                            <div className="flex flex-col items-end space-y-2 min-w-[130px] pl-3">
                              <div className="flex items-center gap-2">
                                {file.encodingJobId ? (
                                  <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20">
                                    <Check className="h-3 w-3 mr-1" />
                                    Processed
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20">
                                    Not Processed
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="flex gap-1 items-baseline">
                                <span className="font-medium text-sm">{formatBytes(file.currentSize)}</span>
                                <span className="text-xs text-muted-foreground">/</span>
                                <span className="text-xs text-muted-foreground">{formatBytes(file.originalSize)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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