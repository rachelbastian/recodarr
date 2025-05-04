import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Settings, BarChart2, Search, Library, PlusCircle, Film, Share2, ListOrdered, SlidersHorizontal, ListChecks } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "src/components/ui/button";
import { useTheme } from './ThemeProvider';
import logoTransparent from '../assets/logo_transparent.png';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, href, active }) => {
  const { theme } = useTheme();
  const isLightMode = theme === 'light';

  return (
    <Link to={href} className="block w-full mb-1 relative z-10">
      <Button
        variant="ghost"
        className={cn(
          "w-full justify-start gap-2 text-sidebar-foreground hover:text-accent hover:bg-sidebar-accent transition-colors",
          active && isLightMode && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          active && !isLightMode && "bg-sidebar-accent text-white font-medium glow-white"
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
  const { theme } = useTheme();
  const isLightMode = theme === 'light';

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-4 border-b border-sidebar-border h-14 flex items-center bg-sidebar relative z-10">
        <img 
          src={logoTransparent} 
          alt="Recodarr Logo" 
          className={cn(
            "h-8 w-8 mr-2",
            !isLightMode && "glow-white"
          )}
        />
        <h2 className={cn(
          "text-xl font-semibold",
          isLightMode ? "text-sidebar-primary" : "text-white glow-white"
        )}>
          RE : COD | ARR
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 bg-sidebar bg-stars">
        <div className="space-y-1 relative z-10">
          <SidebarItem icon={<Home className="h-4 w-4" />} label="Dashboard" href="/" active={isActive('/')} />
          {/* <SidebarItem icon={<BarChart2 className="h-4 w-4" />} label="Statistics" href="/statistics" active={isActive('/statistics')} /> */}
          
          <SidebarItem icon={<Film className="h-4 w-4" />} label="Media" href="/media" active={isActive('/media')} />
          <SidebarItem icon={<Library className="h-4 w-4" />} label="Libraries" href="/libraries" active={isActive('/libraries')} />
          {/* <SidebarItem icon={<Share2 className="h-4 w-4" />} label="Workflows" href="/workflows" active={isActive('/workflows')} /> */}
          
          <SidebarItem icon={<ListOrdered className="h-4 w-4" />} label="Encoding" href="/encoding" active={isActive('/encoding')} />
          <SidebarItem icon={<ListChecks className="h-4 w-4" />} label="Queue" href="/queue" active={isActive('/queue')} />
          <SidebarItem icon={<SlidersHorizontal className="h-4 w-4" />} label="Presets" href="/presets" active={isActive('/presets')} />
          
        </div>
      </div>

      <div className="p-3 border-t border-sidebar-border mt-auto bg-sidebar relative z-10">
        <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" href="/settings" active={isActive('/settings')} />
      </div>
    </div>
  );
};

export default Navbar; 