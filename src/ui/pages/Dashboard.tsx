import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from "../../components/ui/input";

// Default state structure matching SystemStats type
const defaultStats: SystemStats = {
  cpuLoad: null,
  memLoad: null,
  gpuLoad: null,
  gpuMemoryUsed: null,
  gpuMemoryTotal: null,
};

const Dashboard: React.FC = () => {
  const [systemStats, setSystemStats] = useState<SystemStats>(defaultStats);

  useEffect(() => {
    // Subscribe to system stats updates
    const unsubscribe = window.electron.subscribeSystemStats((stats) => {
      // console.log("Received system stats:", stats); // Removed log
      setSystemStats(stats);
    });

    // Clean up subscription on component unmount
    return () => {
      unsubscribe();
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // Helper function to format percentages
  const formatPercent = (value: number | null) => 
    value !== null ? `${value.toFixed(1)}%` : 'N/A';

  // Helper function to format memory (MB to GB)
  const formatMemory = (valueMB: number | null) => 
    valueMB !== null ? `${(valueMB / 1024).toFixed(1)} GB` : 'N/A';

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 gap-4">
          <div className="flex flex-1 items-center gap-4 md:gap-6">
            <form className="flex-1 md:flex-initial">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search media..."
                  className="pl-8 md:w-[300px] lg:w-[400px] text-foreground"
                />
              </div>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          <div className="grid gap-6">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h1>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Placeholder for stats/cards */}
              <div className="rounded-lg border bg-card p-4 text-card-foreground">
                <h3 className="font-medium text-muted-foreground">Total Media</h3>
                <p className="text-2xl font-bold">0</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-card-foreground">
                <h3 className="font-medium text-muted-foreground">Storage Used</h3>
                <p className="text-2xl font-bold">0 GB</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-card-foreground">
                <h3 className="font-medium text-muted-foreground">Active Downloads</h3>
                <p className="text-2xl font-bold">0</p>
              </div>
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
        </div>
      </main>
    </div>
  );
};

export default Dashboard; 