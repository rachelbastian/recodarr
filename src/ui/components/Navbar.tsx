import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Settings, BarChart2, Search, Library, PlusCircle, Film, Share2, ListOrdered, SlidersHorizontal } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "src/components/ui/button";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, href, active }) => {
  return (
    <Link to={href} className="block w-full mb-1">
      <Button
        variant="ghost"
        className={cn(
          "w-full justify-start gap-2 text-sidebar-foreground hover:text-accent hover:bg-sidebar-accent transition-colors",
          active && "bg-sidebar-accent text-accent font-medium"
        )}
      >
        {icon}
        <span>{label}</span>
      </Button>
    </Link>
  );
};

const Navbar: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-4 border-b border-sidebar-border h-14 flex items-center bg-sidebar">
        <h2 className="text-xl font-semibold text-accent">RE : COD | ARR</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 bg-sidebar">
        <div className="space-y-1">
          <SidebarItem icon={<Home className="h-4 w-4" />} label="Dashboard" href="/" active={isActive('/')} />
          {/* <SidebarItem icon={<BarChart2 className="h-4 w-4" />} label="Statistics" href="/statistics" active={isActive('/statistics')} /> */}
          
          <SidebarItem icon={<Film className="h-4 w-4" />} label="Media" href="/media" active={isActive('/media')} />
          <SidebarItem icon={<Library className="h-4 w-4" />} label="Libraries" href="/libraries" active={isActive('/libraries')} />
          <SidebarItem icon={<Share2 className="h-4 w-4" />} label="Workflows" href="/workflows" active={isActive('/workflows')} />
          
          <SidebarItem icon={<ListOrdered className="h-4 w-4" />} label="Encoding" href="/encoding" active={isActive('/encoding')} />
          <SidebarItem icon={<SlidersHorizontal className="h-4 w-4" />} label="Presets" href="/presets" active={isActive('/presets')} />
          
        </div>
      </div>

      <div className="p-3 border-t border-sidebar-border mt-auto bg-sidebar">
        <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" href="/settings" active={isActive('/settings')} />
      </div>
    </div>
  );
};

export default Navbar; 