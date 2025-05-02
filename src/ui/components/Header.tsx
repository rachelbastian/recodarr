import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from "src/components/ui/input"; // Assuming @ alias for Shadcn UI
import { ThemeToggle } from './ThemeToggle'; // Import the new toggle
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

const Header: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isLightMode = theme === 'light';

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent default form submission
    if (searchTerm.trim()) {
      navigate(`/media?q=${encodeURIComponent(searchTerm.trim())}`);
    }
    // Optionally navigate to /media even with empty search to show all media
    // else { navigate('/media'); }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 bg-stars">
      {/* Search Bar Form - Added flex-1 and max-w-xl */}
      <form className="relative flex-1 max-w-xl z-10" onSubmit={handleSearchSubmit}>
        <Search className={cn(
          "absolute left-2.5 top-2.5 h-4 w-4 z-10",
          isLightMode ? "text-primary" : "text-white glow-white"
        )} />
        <Input
          type="search"
          placeholder="Search media titles or paths..."
          className={cn(
            "pl-8 w-full text-foreground border-sidebar-border relative z-10",
            isLightMode 
              ? "bg-white/70 focus:border-primary" 
              : "bg-sidebar/70 focus:border-white focus:glow-white"
          )}
          value={searchTerm}
          onChange={handleSearchChange}
        />
        {/* Hidden submit button to allow Enter key submission */}
        <button type="submit" style={{ display: 'none' }} aria-hidden="true"></button>
      </form>
      
      {/* Add Theme Toggle to the right */}
      <div className="ml-auto relative z-10">
        <ThemeToggle />
      </div>
    </header>
  );
};

export default Header; 