import React, { useState, useEffect } from 'react';
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


const Dashboard: React.FC = () => {
    const [systemStats, setSystemStats] = useState<SystemStats>(defaultSystemStats);
    const [mediaStats, setMediaStats] = useState<DashboardMediaStats>(defaultMediaStats);
    const [largestFiles, setLargestFiles] = useState<LargestFileData[]>([]); // State for largest files
    const [isLoadingMediaStats, setIsLoadingMediaStats] = useState<boolean>(true);
    const [mediaStatsError, setMediaStatsError] = useState<string | null>(null);

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

    useEffect(() => {
        // Fetch Media Stats & Largest Files
        const fetchData = async () => {
            setIsLoadingMediaStats(true);
            setMediaStatsError(null);
            try {
                // Fetch all media for general stats
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

                // Fetch top 10 largest files
                const largestFilesResults = await window.electron.dbQuery(
                    'SELECT id, title, filePath, currentSize FROM media WHERE currentSize IS NOT NULL ORDER BY currentSize DESC LIMIT 10', 
                    []
                );
                setLargestFiles(largestFilesResults as LargestFileData[]);

            } catch (err) {
                console.error("Error fetching dashboard data:", err);
                setMediaStatsError(err instanceof Error ? err.message : 'Failed to fetch media statistics');
                setMediaStats(defaultMediaStats); // Reset on error
                setLargestFiles([]); // Reset largest files on error
            } finally {
                setIsLoadingMediaStats(false);
            }
        };

        fetchData();

        // Subscribe to system stats updates
        // Note: The 'stats' parameter type is now inferred correctly from SystemStats
        const unsubscribeSystemStats = window.electron.subscribeSystemStats((stats: SystemStats) => {
            setSystemStats(stats);
        });

        // Clean up subscription on component unmount
        return () => {
            unsubscribeSystemStats();
        };
    }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div className="flex-1 overflow-auto bg-background">
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