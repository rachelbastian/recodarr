import React, { useState, useEffect } from 'react';
import GaugeWidget from '../components/GaugeWidget';

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

  return (
    <div className="flex-1 overflow-auto bg-background">
      <main className="container mx-auto p-6">
        <div className="grid gap-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">System Dashboard</h1>
          
          {mediaStatsError && <p className="text-red-500 bg-red-100 p-3 rounded-md">{mediaStatsError}</p>}

          {/* System Performance Gauges */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <GaugeWidget
              value={systemStats.cpuLoad}
              label="CPU Usage"
              colorScheme="blue"
            />
            <GaugeWidget
              value={systemStats.memLoad}
              label="Memory Usage"
              colorScheme="green"
            />
            <GaugeWidget
              value={systemStats.gpuLoad}
              label="GPU Usage"
              colorScheme="purple"
            />
            <GaugeWidget
              value={systemStats.gpuMemoryUsagePercent ?? null}
              label="GPU Memory"
              colorScheme="orange"
            />
          </div>

          {/* Media Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-card/40 p-4 text-card-foreground shadow-sm">
              <h3 className="font-medium text-muted-foreground">Total Media Files</h3>
              <p className="text-2xl font-bold">
                {isLoadingMediaStats ? 'Loading...' : mediaStats.totalCount}
              </p>
            </div>
            <div className="rounded-lg border bg-card/40 p-4 text-card-foreground shadow-sm">
              <h3 className="font-medium text-muted-foreground">Total Current Storage</h3>
              <p className="text-2xl font-bold">
                {isLoadingMediaStats ? 'Loading...' : formatBytes(mediaStats.totalCurrentSize)}
              </p>
            </div>
            <div className="rounded-lg border bg-card/40 p-4 text-card-foreground shadow-sm">
              <h3 className="font-medium text-muted-foreground">Total Original Storage</h3>
              <p className="text-2xl font-bold">
                {isLoadingMediaStats ? 'Loading...' : formatBytes(mediaStats.totalOriginalSize)}
              </p>
            </div>
            <div className="rounded-lg border bg-card/40 p-4 text-card-foreground shadow-sm">
              <h3 className="font-medium text-muted-foreground">Space Saved</h3>
              <p className="text-2xl font-bold">
                {isLoadingMediaStats ? 'Loading...' : formatBytes(mediaStats.totalSavedSize)}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard; 