import React from 'react';
import { Search } from 'lucide-react';
import { Input } from "../../components/ui/input";

const Dashboard: React.FC = () => {
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
                <p className="text-2xl font-bold">0%</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard; 