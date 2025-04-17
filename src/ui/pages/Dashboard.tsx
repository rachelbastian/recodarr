import React, { useState, useEffect } from 'react';

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
    const [isLoadingMediaStats, setIsLoadingMediaStats] = useState<boolean>(true);
    const [mediaStatsError, setMediaStatsError] = useState<string | null>(null);


    useEffect(() => {
        // Fetch Media Stats
        const fetchMediaStats = async () => {
            setIsLoadingMediaStats(true);
            setMediaStatsError(null);
            try {
                const results = await window.electron.dbQuery('SELECT id, originalSize, currentSize FROM media', []);
                const mediaData = results as MediaStatsData[];

                const totalCount = mediaData.length;
                const totalOriginalSize = mediaData.reduce((sum, item) => sum + (item.originalSize ?? 0), 0);
                const totalCurrentSize = mediaData.reduce((sum, item) => sum + (item.currentSize ?? 0), 0);
                const totalSavedSize = totalOriginalSize > 0 ? totalOriginalSize - totalCurrentSize : 0;
                const percentageSaved = totalOriginalSize > 0 ? (totalSavedSize / totalOriginalSize) * 100 : 0;

                setMediaStats({
                    totalCount,
                    totalOriginalSize: totalOriginalSize || null, // Keep null if 0
                    totalCurrentSize: totalCurrentSize || null,   // Keep null if 0
                    totalSavedSize: totalSavedSize || null,     // Keep null if 0
                    percentageSaved: totalOriginalSize > 0 ? percentageSaved : null // Keep null if 0
                });

            } catch (err) {
                console.error("Error fetching media stats:", err);
                setMediaStatsError(err instanceof Error ? err.message : 'Failed to fetch media statistics');
                setMediaStats(defaultMediaStats); // Reset on error
            } finally {
                setIsLoadingMediaStats(false);
            }
        };

        fetchMediaStats();


        // Subscribe to system stats updates
        const unsubscribeSystemStats = window.electron.subscribeSystemStats((stats) => {
            setSystemStats(stats);
        });

        // Clean up subscription on component unmount
        return () => {
            unsubscribeSystemStats();
        };
    }, []); // Empty dependency array ensures this runs only once on mount

  // Helper function to format percentages
  const formatPercent = (value: number | null) => 
    value !== null ? `${value.toFixed(1)}%` : 'N/A';

  // Helper function to format memory (MB to GB)
  const formatMemory = (valueMB: number | null) => 
    valueMB !== null ? `${(valueMB / 1024).toFixed(1)} GB` : 'N/A';

  return (
    <div className="flex-1 overflow-auto">
      <main className="container mx-auto p-6">
        <div className="grid gap-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h1>
          
          {mediaStatsError && <p className="text-red-500 bg-red-100 p-3 rounded-md">{mediaStatsError}</p>}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Row 1: Media Stats */}
            <div className="rounded-lg border bg-card p-4 text-card-foreground">
              <h3 className="font-medium text-muted-foreground">Total Media Files</h3>
              <p className="text-2xl font-bold">
                {isLoadingMediaStats ? 'Loading...' : mediaStats.totalCount}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4 text-card-foreground">
              <h3 className="font-medium text-muted-foreground">Total Current Storage</h3>
              <p className="text-2xl font-bold">
                {isLoadingMediaStats ? 'Loading...' : formatBytes(mediaStats.totalCurrentSize)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4 text-card-foreground">
              <h3 className="font-medium text-muted-foreground">Total Original Storage</h3>
              <p className="text-2xl font-bold">
                {isLoadingMediaStats ? 'Loading...' : formatBytes(mediaStats.totalOriginalSize)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4 text-card-foreground">
              <h3 className="font-medium text-muted-foreground">Total Space Saved (%)</h3>
              <p className="text-2xl font-bold">
                {isLoadingMediaStats ? 'Loading...' : 
                  `${formatBytes(mediaStats.totalSavedSize)} (${formatPercent(mediaStats.percentageSaved)})`
                }
              </p>
            </div>

            {/* Row 2: System Stats */}
            <div className="rounded-lg border bg-card p-4 text-card-foreground">
              <h3 className="font-medium text-muted-foreground">CPU Usage</h3>
              <p className="text-2xl font-bold">{formatPercent(systemStats.cpuLoad)}</p>
            </div>
            <div className="rounded-lg border bg-card p-4 text-card-foreground">
              <h3 className="font-medium text-muted-foreground">Memory Usage</h3>
              <p className="text-2xl font-bold">{formatPercent(systemStats.memLoad)}</p>
            </div>
            <div className="rounded-lg border bg-card p-4 text-card-foreground">
              <h3 className="font-medium text-muted-foreground">GPU Usage</h3>
              <p className="text-2xl font-bold">{formatPercent(systemStats.gpuLoad)}</p>
            </div>
            <div className="rounded-lg border bg-card p-4 text-card-foreground">
              <h3 className="font-medium text-muted-foreground">GPU Memory Used</h3>
              <p className="text-2xl font-bold">
                {formatMemory(systemStats.gpuMemoryUsed)}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard; 