import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from "src/components/ui/input"; // Assuming @ alias for Shadcn UI

const Header: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Search Bar Form - Added flex-1 and max-w-xl */}
      <form className="relative flex-1 max-w-xl" onSubmit={handleSearchSubmit}>
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search media titles or paths..."
          // Added w-full so input fills the form container
          className="pl-8 w-full text-foreground"
          value={searchTerm}
          onChange={handleSearchChange}
        />
        {/* Hidden submit button to allow Enter key submission */}
        <button type="submit" style={{ display: 'none' }} aria-hidden="true"></button>
      </form>
      {/* Optional: Add other elements here if needed, like user menu */}
      {/* <div className="ml-auto">...</div> */}
    </header>
  );
};

export default Header; 