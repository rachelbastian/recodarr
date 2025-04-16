import React from 'react';
import { Home, Settings, BarChart2, Search, Library, PlusCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active }) => {
  return (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start gap-2 mb-1 text-muted-foreground hover:text-foreground hover:bg-accent/10",
        active && "bg-accent text-white font-medium"
      )}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
};

const Sidebar: React.FC = () => {
  return (
    <div className="w-64 h-screen bg-background border-r flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-xl font-semibold text-foreground">Recodarr</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          <SidebarItem icon={<Home className="text-white" />} label="Dashboard" active />
          <SidebarItem icon={<BarChart2 />} label="Statistics" />
          <SidebarItem icon={<Library />} label="Library" />
        </div>
        
        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-2 px-2">Quick Actions</h3>
          <SidebarItem icon={<PlusCircle />} label="Add New Media" />
        </div>
      </div>

      <div className="p-3 border-t mt-auto">
        <SidebarItem icon={<Settings />} label="Settings" />
      </div>
    </div>
  );
};

export default Sidebar; 