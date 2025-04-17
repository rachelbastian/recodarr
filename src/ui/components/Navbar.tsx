import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Settings, BarChart2, Search, Library, PlusCircle, Film } from 'lucide-react';
import { cn } from "@/lib/utils"; // Assuming @ alias is setup
import { Button } from "@/components/ui/button"; // Assuming @ alias is setup

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
          "w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-accent/10",
          active && "bg-accent text-white font-medium" // Simplified active state style
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
    <div className="w-64 h-screen bg-background border-r flex flex-col">
      <div className="p-4 border-b h-14 flex items-center">
        <h2 className="text-xl font-semibold text-foreground">Recodarr</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          <SidebarItem icon={<Home className="h-4 w-4" />} label="Dashboard" href="/" active={isActive('/')} />
          <SidebarItem icon={<BarChart2 className="h-4 w-4" />} label="Statistics" href="/statistics" active={isActive('/statistics')} />
          <SidebarItem icon={<Film className="h-4 w-4" />} label="Media" href="/media" active={isActive('/media')} />
          <SidebarItem icon={<Library className="h-4 w-4" />} label="Libraries" href="/libraries" active={isActive('/libraries')} />
        </div>
        
        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-2 px-2">Quick Actions</h3>
          <SidebarItem icon={<PlusCircle className="h-4 w-4" />} label="Add New Media" href="/add" active={isActive('/add')} />
        </div>
      </div>

      <div className="p-3 border-t mt-auto">
        <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" href="/settings" active={isActive('/settings')} />
      </div>
    </div>
  );
};

export default Navbar; 