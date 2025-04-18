import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom'; // To read search query
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    Table as ReactTable, // Alias to avoid conflict with Shadcn Table
    Header,
    ColumnOrderState,
    SortingState,
    getSortedRowModel,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../@/components/ui/table";
import { Badge } from "../../../@/components/ui/badge"; // For displaying library type
import { Button } from "../../../@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "../../../@/components/ui/dropdown-menu";
import { Columns } from 'lucide-react';
import { SlidersHorizontal } from 'lucide-react'; // Import icon for advanced search
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
    SheetClose,
} from "../../../@/components/ui/sheet"; // Import Sheet components
import { Input } from "../../../@/components/ui/input"; // Import Input
import { Label } from "../../../@/components/ui/label"; // Import Label
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../@/components/ui/select"; // Import Select

// Define the type for a media item from the DB
interface MediaItem {
    id: number;
    title: string;
    filePath: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
    originalSize: number;
    currentSize: number;
    lastSizeCheckAt: string;
    videoCodec: string | null;
    audioCodec: string | null;
    addedAt: string;
}

// Helper to format bytes
function formatBytes(bytes: number | null, decimals = 2): string {
    if (bytes === null || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Define Columns using TanStack Table ColumnDef
const columns: ColumnDef<MediaItem>[] = [
    {
        accessorKey: 'title',
        header: 'Title',
        cell: info => info.getValue(),
        size: 250,
        enableResizing: true,
    },
    {
        accessorKey: 'libraryName',
        header: 'Library',
        cell: info => info.getValue(),
        size: 150,
        enableResizing: true,
    },
    {
        accessorKey: 'libraryType',
        header: 'Type',
        cell: info => <Badge variant="secondary">{info.getValue<string>()}</Badge>,
        size: 100,
        enableResizing: true,
    },
    {
        accessorKey: 'videoCodec',
        header: 'Video Codec',
        cell: info => (
            <span className="text-xs">
                {info.getValue<string>() ?? '-'}
            </span>
        ),
        size: 100,
        enableResizing: true,
    },
    {
        accessorKey: 'audioCodec',
        header: 'Audio Codec',
        cell: info => (
            <span className="text-xs">
                {info.getValue<string>() ?? '-'}
            </span>
        ),
        size: 100,
        enableResizing: true,
    },
    {
        accessorKey: 'originalSize',
        header: 'Original Size',
        cell: info => formatBytes(info.getValue<number>()),
        size: 100,
        enableResizing: true,
    },
    {
        accessorKey: 'currentSize',
        header: 'Current Size',
        cell: info => formatBytes(info.getValue<number>()),
        size: 100,
        enableResizing: true,
    },
    {
        accessorKey: 'filePath',
        header: 'Path',
        cell: info => (
            <span className="text-xs text-muted-foreground truncate" title={info.getValue<string>()}>
                {info.getValue<string>()}
            </span>
        ),
        size: 300,
        enableResizing: true,
    },
];

// Define initial column order
const initialColumnOrder: string[] = [
    'currentSize',
    'videoCodec',
    'title',
    'libraryName',
    'libraryType',
    'audioCodec',
    'originalSize',
    'filePath',
];

const Media: React.FC = () => {
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(initialColumnOrder);
    const [columnVisibility, setColumnVisibility] = useState({});
    const [sorting, setSorting] = useState<SortingState>([]);
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false); // State for flyout
    // Add state for filters
    const [libraryNameFilter, setLibraryNameFilter] = useState('');
    const [libraryTypeFilter, setLibraryTypeFilter] = useState<'All' | 'TV' | 'Movies' | 'Anime'>('All');
    const [videoCodecFilter, setVideoCodecFilter] = useState('');
    const [audioCodecFilter, setAudioCodecFilter] = useState('');
    // Add state for distinct filter options
    const [libraryNames, setLibraryNames] = useState<string[]>([]);
    const [videoCodecs, setVideoCodecs] = useState<string[]>([]);
    const [audioCodecs, setAudioCodecs] = useState<string[]>([]);

    // Fetch distinct values for filters on mount
    useEffect(() => {
        const fetchFilterOptions = async () => {
            try {
                const [libs, vCodecs, aCodecs] = await Promise.all([
                    window.electron.dbQuery('SELECT DISTINCT libraryName FROM media WHERE libraryName IS NOT NULL ORDER BY libraryName'),
                    window.electron.dbQuery('SELECT DISTINCT videoCodec FROM media WHERE videoCodec IS NOT NULL ORDER BY videoCodec'),
                    window.electron.dbQuery('SELECT DISTINCT audioCodec FROM media WHERE audioCodec IS NOT NULL ORDER BY audioCodec'),
                ]);
                setLibraryNames(['All', ...(libs as { libraryName: string }[]).map(l => l.libraryName)]);
                setVideoCodecs(['All', ...(vCodecs as { videoCodec: string }[]).map(c => c.videoCodec)]);
                setAudioCodecs(['All', ...(aCodecs as { audioCodec: string }[]).map(c => c.audioCodec)]);
            } catch (err) {
                console.error("Error fetching filter options:", err);
                // Handle error appropriately, maybe show a notification
            }
        };
        fetchFilterOptions();
    }, []); // Empty dependency array ensures this runs only once on mount

    const fetchMedia = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const query = searchParams.get('q');
        let sql = `
            SELECT 
                id, title, filePath, libraryName, libraryType,
                originalSize, currentSize, lastSizeCheckAt,
                videoCodec, audioCodec, addedAt 
            FROM media 
            WHERE 1=1 -- Start WHERE clause
        `;
        let params: any[] = [];
        let conditions: string[] = [];

        // Add FTS search if query exists
        if (query) {
            console.log(`Fetching media matching: ${query}`);
            sql = `
                SELECT 
                    m.id, m.title, m.filePath, m.libraryName, m.libraryType,
                    m.originalSize, m.currentSize, m.lastSizeCheckAt,
                    m.videoCodec, m.audioCodec, m.addedAt
                FROM media AS m
                JOIN media_fts AS fts ON m.id = fts.rowid
                WHERE 1=1 -- Start WHERE clause
            `;
            conditions.push('fts.media_fts MATCH ?');
            params.push(`${query.replace(/'/g, "''")}*`); // Keep FTS param first if used
        }

        // Add filter conditions
        if (libraryNameFilter && libraryNameFilter !== 'All') { // Check for 'All'
            conditions.push('libraryName = ?'); // Use = for exact match
            params.push(libraryNameFilter);
        }
        if (libraryTypeFilter !== 'All') {
            conditions.push('libraryType = ?');
            params.push(libraryTypeFilter);
        }
        if (videoCodecFilter && videoCodecFilter !== 'All') { // Check for 'All'
            conditions.push('videoCodec = ?'); // Use = for exact match
            params.push(videoCodecFilter);
        }
        if (audioCodecFilter && audioCodecFilter !== 'All') { // Check for 'All'
            conditions.push('audioCodec = ?'); // Use = for exact match
            params.push(audioCodecFilter);
        }

        // Append conditions to SQL
        if (conditions.length > 0) {
            sql += ' AND ' + conditions.join(' AND ');
        }

        // Add ordering (FTS uses rank, otherwise addedAt)
        sql += query ? ' ORDER BY rank, m.addedAt DESC' : ' ORDER BY addedAt DESC';

        try {
            const results = await window.electron.dbQuery(sql, params);
            setMediaItems(results as MediaItem[]);
        } catch (err) {
            console.error("Error fetching media:", err);
            setError(err instanceof Error ? err.message : 'Failed to fetch media');
            setMediaItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [searchParams, libraryNameFilter, libraryTypeFilter, videoCodecFilter, audioCodecFilter]);

    useEffect(() => {
        fetchMedia();
    }, [fetchMedia]);

    // Initialize TanStack Table with reordering, visibility, and sorting
    const table = useReactTable({
        data: mediaItems,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
        defaultColumn: {
            minSize: 50,
        },
        state: {
            columnOrder,
            columnVisibility,
            sorting,
        },
        onColumnOrderChange: setColumnOrder,
        onColumnVisibilityChange: setColumnVisibility,
        onSortingChange: setSorting,
    });

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    {searchParams.get('q') ? `Search Results for "${searchParams.get('q')}"` : 'Discovered Media'}
                </h1>

                {/* Column Visibility Dropdown */}
                <div className="flex items-center space-x-2"> {/* Wrap buttons */} 
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="ml-auto">
                                <Columns className="mr-2 h-4 w-4" />
                                Columns
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {table.getAllColumns()
                                .filter(column => column.getCanHide())
                                .map(column => {
                                    return (
                                        <DropdownMenuCheckboxItem
                                            key={column.id}
                                            className="capitalize"
                                            checked={column.getIsVisible()}
                                            onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                        >
                                            {column.id}
                                        </DropdownMenuCheckboxItem>
                                    )
                                })}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Advanced Search Flyout Trigger */}
                    <Sheet open={isAdvancedSearchOpen} onOpenChange={setIsAdvancedSearchOpen}>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="sm">
                                <SlidersHorizontal className="mr-2 h-4 w-4" />
                                Filter
                            </Button>
                        </SheetTrigger>
                        <SheetContent>
                            <SheetHeader>
                                <SheetTitle>Advanced Search & Filters</SheetTitle>
                                <SheetDescription>
                                    Refine your media view by applying specific filters.
                                </SheetDescription>
                            </SheetHeader>
                            {/* Filter Controls */}
                            <div className="grid gap-6 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="libraryName" className="text-right col-span-1">
                                        Library
                                    </Label>
                                    <Select
                                        value={libraryNameFilter || 'All'}
                                        onValueChange={(value) => setLibraryNameFilter(value === 'All' ? '' : value)}
                                    >
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Select library" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {libraryNames.map(name => (
                                                <SelectItem key={name} value={name}>{name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="libraryType" className="text-right col-span-1">
                                        Type
                                    </Label>
                                    <Select
                                        value={libraryTypeFilter}
                                        onValueChange={(value: 'All' | 'TV' | 'Movies' | 'Anime') => setLibraryTypeFilter(value)}
                                    >
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="All">All Types</SelectItem>
                                            <SelectItem value="TV">TV Shows</SelectItem>
                                            <SelectItem value="Movies">Movies</SelectItem>
                                            <SelectItem value="Anime">Anime</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="videoCodec" className="text-right col-span-1">
                                        Video Codec
                                    </Label>
                                    <Select
                                        value={videoCodecFilter || 'All'}
                                        onValueChange={(value) => setVideoCodecFilter(value === 'All' ? '' : value)}
                                    >
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Select video codec" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {videoCodecs.map(codec => (
                                                <SelectItem key={codec} value={codec}>{codec}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="audioCodec" className="text-right col-span-1">
                                        Audio Codec
                                    </Label>
                                    <Select
                                        value={audioCodecFilter || 'All'}
                                        onValueChange={(value) => setAudioCodecFilter(value === 'All' ? '' : value)}
                                    >
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Select audio codec" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {audioCodecs.map(codec => (
                                                <SelectItem key={codec} value={codec}>{codec}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <SheetFooter>
                                <SheetClose asChild>
                                    <Button type="button" variant="outline">Close</Button>
                                </SheetClose>
                                <SheetClose asChild>
                                    <Button type="button" onClick={() => fetchMedia()}>Apply Filters</Button>
                                </SheetClose>
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            {error && <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p>}

            <div className="border rounded-lg overflow-hidden bg-card text-card-foreground">
                <div className="relative bg-card">
                    <Table style={{ width: table.getCenterTotalSize(), tableLayout: 'fixed', position: 'relative', zIndex: 1 }}>
                        <TableHeader>
                            {table.getHeaderGroups().map(headerGroup => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map(header => (
                                        <TableHead 
                                            key={header.id} 
                                            colSpan={header.colSpan}
                                            style={{ 
                                                width: header.getSize(),
                                                position: 'relative',
                                            }}
                                            className={`bg-popover overflow-hidden whitespace-nowrap select-none ${header.column.getCanSort() ? 'cursor-pointer' : ''}`}
                                            draggable={true}
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('text/plain', header.id);
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.dataTransfer.dropEffect = 'move';
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const fromId = e.dataTransfer.getData('text/plain');
                                                const toId = header.id;
                                                if (fromId !== toId) {
                                                    const newOrder = [...columnOrder];
                                                    const fromIndex = newOrder.indexOf(fromId);
                                                    const toIndex = newOrder.indexOf(toId);
                                                    newOrder.splice(fromIndex, 1);
                                                    newOrder.splice(toIndex, 0, fromId);
                                                    setColumnOrder(newOrder);
                                                }
                                            }}
                                        >
                                            <div 
                                                className="flex items-center space-x-1 overflow-hidden text-ellipsis cursor-grab active:cursor-grabbing"
                                                onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                                                title={header.column.getCanSort() ? 'Click to sort' : undefined}
                                            >
                                                <span>
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                                </span>
                                                {{
                                                    asc: ' ▲',
                                                    desc: ' ▼',
                                                }[header.column.getIsSorted() as string] ?? null}
                                            </div>
                                            {/* Resize Handle */}
                                            {header.column.getCanResize() && (
                                                <div
                                                    onMouseDown={header.getResizeHandler()}
                                                    onTouchStart={header.getResizeHandler()}
                                                    className={`absolute top-0 right-0 h-full w-1 bg-blue-500 opacity-0 hover:opacity-100 cursor-col-resize select-none touch-none ${header.column.getIsResizing() ? 'bg-blue-700 opacity-100' : ''}`}
                                                    style={{ transform: 'translateX(50%)', zIndex: 2 }}
                                                />
                                            )}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell 
                                        colSpan={table.getAllColumns().length} // Use table.getAllColumns().length for correct span
                                        className="text-center text-muted-foreground bg-popover overflow-hidden"
                                        style={{ width: '100%' }}
                                    >
                                        Loading media...
                                    </TableCell>
                                </TableRow>
                            ) : table.getRowModel().rows.length === 0 ? (
                                <TableRow>
                                    <TableCell 
                                        colSpan={table.getAllColumns().length} // Use table.getAllColumns().length for correct span
                                        className="text-center text-muted-foreground bg-popover overflow-hidden"
                                        style={{ width: '100%' }}
                                    >
                                        {searchParams.get('q') ? 'No media found matching your search.' : 'No media discovered yet. Add a library and scan.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                table.getRowModel().rows.map(row => (
                                    <TableRow key={row.id}>
                                        {row.getVisibleCells().map(cell => (
                                            <TableCell 
                                                key={cell.id} 
                                                style={{ width: cell.column.getSize() }}
                                                className="bg-popover overflow-hidden"
                                            >
                                                <div className="overflow-hidden text-ellipsis">
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </div>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
};

export default Media;