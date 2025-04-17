import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "../../../@/components/ui/button"; // Corrected path
import { Input } from "../../../@/components/ui/input"; // Corrected path
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../@/components/ui/select"; // Corrected path
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../@/components/ui/table"; // Corrected path
import { Trash2 } from 'lucide-react'; // Icon for remove button

// Define the type for a watched folder, matching types.d.ts
// Note: Duplicating this here for component scope, could be imported from a shared types file
interface WatchedFolder {
    path: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
}

const Libraries: React.FC = () => {
    const [watchedFolders, setWatchedFolders] = useState<WatchedFolder[]>([]);
    const [newLibraryName, setNewLibraryName] = useState<string>('');
    const [newLibraryType, setNewLibraryType] = useState<'TV' | 'Movies' | 'Anime' | ''>( '' ); // Initialize as empty
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch watched folders
    const fetchFolders = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const folders = await window.electron.getWatchedFolders();
            setWatchedFolders(folders);
        } catch (err) {
            console.error("Error fetching watched folders:", err);
            setError(err instanceof Error ? err.message : 'Failed to fetch libraries');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch folders on component mount
    useEffect(() => {
        fetchFolders();
    }, [fetchFolders]);

    // Handle adding a new library
    const handleAddLibrary = async () => {
        if (!newLibraryName || !newLibraryType) {
            setError('Please provide a library name and select a type.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const newFolder = await window.electron.addWatchedFolder({
                libraryName: newLibraryName,
                libraryType: newLibraryType,
            });
            if (newFolder) { // If not null (user didn't cancel dialog)
                await fetchFolders(); // Refresh the list
                setNewLibraryName(''); // Clear inputs
                setNewLibraryType('');
            } else {
                 setError('Folder selection cancelled.'); // User cancelled dialog
            }
        } catch (err) {
            console.error("Error adding watched folder:", err);
            setError(err instanceof Error ? err.message : 'Failed to add library');
        } finally {
            setIsLoading(false);
        }
    };

    // Handle removing a library
    const handleRemoveLibrary = async (folderPath: string) => {
        setIsLoading(true);
        setError(null);
        try {
            await window.electron.removeWatchedFolder(folderPath);
            await fetchFolders(); // Refresh the list
        } catch (err) {
            console.error("Error removing watched folder:", err);
            setError(err instanceof Error ? err.message : 'Failed to remove library');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Manage Libraries</h1>

            {error && <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p>}

            {/* Add New Library Section */}
            <div className="p-4 border rounded-lg bg-card text-card-foreground space-y-4">
                <h2 className="text-xl font-semibold">Add New Library</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-1">
                        <label htmlFor="libraryName" className="text-sm font-medium text-muted-foreground">Library Name</label>
                        <Input
                            id="libraryName"
                            placeholder="e.g., My Movie Collection"
                            value={newLibraryName}
                            onChange={(e) => setNewLibraryName(e.target.value)}
                            className="text-foreground"
                            disabled={isLoading}
                        />
                    </div>
                     <div className="space-y-1">
                        <label htmlFor="libraryType" className="text-sm font-medium text-muted-foreground">Library Type</label>
                         <Select
                            value={newLibraryType}
                            onValueChange={(value: 'TV' | 'Movies' | 'Anime') => setNewLibraryType(value)}
                            disabled={isLoading}
                         >
                            <SelectTrigger id="libraryType" className="w-full">
                                <SelectValue placeholder="Select type..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Movies">Movies</SelectItem>
                                <SelectItem value="TV">TV Shows</SelectItem>
                                <SelectItem value="Anime">Anime</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleAddLibrary} disabled={isLoading || !newLibraryName || !newLibraryType}>
                        {isLoading ? 'Adding...' : 'Add Library Folder'}
                    </Button>
                </div>
                 <p className="text-xs text-muted-foreground">Clicking 'Add' will open a dialog to select the folder to monitor.</p>
            </div>

            {/* Existing Libraries Section */}
            <div className="border rounded-lg overflow-hidden bg-card text-card-foreground">
                 <h2 className="text-xl font-semibold p-4 border-b">Monitored Folders</h2>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Library Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Folder Path</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading && watchedFolders.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground">Loading libraries...</TableCell>
                            </TableRow>
                        ) : watchedFolders.length === 0 ? (
                            <TableRow>
                                 <TableCell colSpan={4} className="text-center text-muted-foreground">No libraries added yet.</TableCell>
                            </TableRow>
                        ) : (
                            watchedFolders.map((folder) => (
                                <TableRow key={folder.path}>
                                    <TableCell className="font-medium">{folder.libraryName}</TableCell>
                                    <TableCell>{folder.libraryType}</TableCell>
                                    <TableCell className="text-muted-foreground">{folder.path}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveLibrary(folder.path)}
                                            disabled={isLoading}
                                            aria-label="Remove folder"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default Libraries; 