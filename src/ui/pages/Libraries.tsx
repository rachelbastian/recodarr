import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/ui/table";
import { Trash2, RefreshCw, MoreVertical } from 'lucide-react';
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "src/components/ui/alert-dialog";

// Define the type for a watched folder, matching types.d.ts
// Note: Duplicating this here for component scope, could be imported from a shared types file
interface WatchedFolder {
    path: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
}

// Define Scan Status type (matching EventPayloadMapping['scan-status-update'])
interface ScanStatusUpdate {
    status: 'running' | 'finished' | 'error';
    message: string;
}

const Libraries: React.FC = () => {
    const [watchedFolders, setWatchedFolders] = useState<WatchedFolder[]>([]);
    const [newLibraryName, setNewLibraryName] = useState<string>('');
    const [newLibraryType, setNewLibraryType] = useState<'TV' | 'Movies' | 'Anime' | ''>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [scanStatus, setScanStatus] = useState<ScanStatusUpdate | null>(null);
    const [libraryToDelete, setLibraryToDelete] = useState<WatchedFolder | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // Fetch watched folders
    const fetchFolders = useCallback(async () => {
        // Only set loading if not already scanning
        if (scanStatus?.status !== 'running') {
             setIsLoading(true);
        }
        setError(null);
        try {
            const folders = await window.electron.getWatchedFolders();
            setWatchedFolders(folders);
        } catch (err) {
            console.error("Error fetching watched folders:", err);
            setError(err instanceof Error ? err.message : 'Failed to fetch libraries');
        } finally {
             if (scanStatus?.status !== 'running') {
                 setIsLoading(false);
            }
        }
    }, [scanStatus]); // Re-run if scan status changes, to potentially reset loading

    // Fetch folders on component mount
    useEffect(() => {
        fetchFolders();
    }, [fetchFolders]);

    // Subscribe to scan status updates
    useEffect(() => {
        const unsubscribe = window.electron.subscribeScanStatus((update) => {
            console.log("Scan Status Update:", update);
            setScanStatus(update);
            // If scan finishes or errors, allow loading state to be set again
            if (update.status === 'finished' || update.status === 'error') {
                 setIsLoading(false); 
            }
        });

        // Cleanup subscription on unmount
        return () => {
            unsubscribe();
        };
    }, []); // Empty dependency array, runs once on mount

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

    // Handle scanning a single folder
    const handleSingleFolderScan = async (folderPath: string, libraryName: string) => {
        setOpenMenuId(null); // Close the menu first
        setError(null);
        setScanStatus({ status: 'running', message: `Initializing scan for ${libraryName}...` });
        setIsLoading(true);
        try {
            const result = await window.electron.triggerFolderScan(folderPath);
            console.log("Single folder scan triggered result:", result);
            // Status will be updated via the subscription
        } catch (err) {
            console.error(`Error triggering scan for folder ${folderPath}:`, err);
            setError(err instanceof Error ? err.message : `Failed to trigger scan for ${libraryName}`);
            setScanStatus({ status: 'error', message: err instanceof Error ? err.message : `Failed to trigger scan for ${libraryName}` });
            setIsLoading(false);
        }
    };

    // Confirm library removal
    const confirmRemoveLibrary = (folder: WatchedFolder) => {
        setOpenMenuId(null); // Close the menu first
        setLibraryToDelete(folder);
    };

    // Handle removing a library
    const handleRemoveLibrary = async () => {
        if (!libraryToDelete) return;
        
        setIsLoading(true);
        setError(null);
        try {
            await window.electron.removeWatchedFolder(libraryToDelete.path);
            await fetchFolders(); // Refresh the list
        } catch (err) {
            console.error("Error removing watched folder:", err);
            setError(err instanceof Error ? err.message : 'Failed to remove library');
        } finally {
            setIsLoading(false);
            setLibraryToDelete(null); // Reset after operation completes
        }
    };

    // Handle triggering a manual scan
    const handleScanTrigger = async () => {
        setError(null);
        setScanStatus({ status: 'running', message: 'Initializing scan...' });
        setIsLoading(true); // Use isLoading to disable buttons during scan
        try {
            const result = await window.electron.triggerScan();
            console.log("Scan triggered result:", result);
             // Status will be updated via the subscription
        } catch (err) {
            console.error("Error triggering scan:", err);
            setError(err instanceof Error ? err.message : 'Failed to trigger scan');
            setScanStatus({ status: 'error', message: err instanceof Error ? err.message : 'Failed to trigger scan' });
            setIsLoading(false); // Re-enable buttons on trigger error
        }
        // Don't setIsLoading(false) here, wait for 'finished' or 'error' status update
    };

    const isScanning = scanStatus?.status === 'running';

    // Function to handle menu open state
    const handleMenuOpenChange = (open: boolean, folderId: string) => {
        setOpenMenuId(open ? folderId : null);
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                 <h1 className="text-3xl font-bold tracking-tight text-foreground">Manage Libraries</h1>
                 {/* Scan Trigger Button */}
                 <Button onClick={handleScanTrigger} disabled={isLoading || isScanning}>
                     <RefreshCw className={cn("mr-2 h-4 w-4", isScanning && "animate-spin")} />
                     {isScanning ? 'Scanning...' : 'Scan Libraries'}
                 </Button>
            </div>

            {/* Display Scan Status */}
            {scanStatus && (scanStatus.status === 'running' || scanStatus.status === 'finished' || scanStatus.status === 'error') && (
                <div className={`p-3 rounded-md text-sm ${scanStatus.status === 'error' ? 'bg-red-100 text-red-700' : scanStatus.status === 'finished' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    <strong>Scan Status:</strong> {scanStatus.message}
                </div>
            )}

            {error && !scanStatus && <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p>}

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
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLibraryName(e.target.value)}
                            className="text-foreground"
                            disabled={isLoading || isScanning}
                        />
                    </div>
                     <div className="space-y-1">
                        <label htmlFor="libraryType" className="text-sm font-medium text-muted-foreground">Library Type</label>
                         <Select
                            value={newLibraryType}
                            onValueChange={(value: 'TV' | 'Movies' | 'Anime') => setNewLibraryType(value)}
                            disabled={isLoading || isScanning}
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
                    <Button onClick={handleAddLibrary} disabled={isLoading || isScanning || !newLibraryName || !newLibraryType}>
                        {isLoading && !isScanning ? 'Adding...' : 'Add Library Folder'}
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
                                        <DropdownMenu
                                            open={openMenuId === folder.path}
                                            onOpenChange={(open) => handleMenuOpenChange(open, folder.path)}
                                        >
                                            <DropdownMenuTrigger asChild>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon"
                                                    disabled={isLoading || isScanning}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                    <span className="sr-only">Actions</span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem 
                                                    onClick={() => handleSingleFolderScan(folder.path, folder.libraryName)}
                                                    disabled={isLoading || isScanning}
                                                >
                                                    <RefreshCw className="mr-2 h-4 w-4" />
                                                    Scan Library
                                                </DropdownMenuItem>
                                                <DropdownMenuItem 
                                                    onClick={() => confirmRemoveLibrary(folder)}
                                                    disabled={isLoading || isScanning}
                                                    variant="destructive"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Remove Library
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Confirmation Dialog for Library Removal */}
            <AlertDialog open={!!libraryToDelete} onOpenChange={(open) => !open && setLibraryToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to remove this library?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Removing "{libraryToDelete?.libraryName}" will stop monitoring this folder for media files.
                            This action cannot be undone. The actual files in the folder will not be deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleRemoveLibrary} 
                            disabled={isLoading}
                            className="bg-red-600 hover:bg-red-700 text-white font-medium"
                        >
                            {isLoading ? 'Removing...' : 'Remove Library'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default Libraries; 