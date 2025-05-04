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
    getPaginationRowModel,
    PaginationState,
    RowSelectionState,
    getFilteredRowModel,
    VisibilityState,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/components/ui/table";
import { Badge } from "../../../src/components/ui/badge"; // For displaying library type
import { Button } from "../../../src/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "../../../src/components/ui/dropdown-menu";
import { Columns } from 'lucide-react';
import { SlidersHorizontal, Check, PlayCircle } from 'lucide-react'; // Import icon for advanced search and encoding
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
    SheetClose,
} from "../../../src/components/ui/sheet"; // Import Sheet components
import { Input } from "../../../src/components/ui/input"; // Import Input
import { Label } from "../../../src/components/ui/label"; // Import Label
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../src/components/ui/select"; // Import Select
import { ChevronFirst, ChevronLeft, ChevronRight, ChevronLast } from 'lucide-react';
import { ScrollArea, ScrollBar } from "../../../src/components/ui/scroll-area";
import { Checkbox } from "../../../src/components/ui/checkbox";
import useQueue from '../../hooks/useQueue';
import { EncodingPreset, ProbeData } from '../../types.d';
import { saveJobMediaReference } from '../../utils/jobLogUtil';

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
    encodingJobId: string | null;
    resolutionWidth: number | null;
    resolutionHeight: number | null;
    audioChannels: number | null;
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

// Update the selectionColumn to remove the label and make it narrower
const selectionColumn: ColumnDef<MediaItem> = {
    id: 'select',
    header: ({ table }) => (
        <div className="flex items-center justify-center">
            <Checkbox
                checked={
                    table.getIsAllPageRowsSelected() ||
                    (table.getIsSomePageRowsSelected() && "indeterminate")
                }
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Select all"
                className="h-4 w-4 border-white" // Make checkbox smaller
            />
        </div>
    ),
    cell: ({ row }) => (
        <div className="flex items-center justify-center h-full">
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label="Select row"
                className="h-4 w-4 border-white" // Make checkbox smaller
            />
        </div>
    ),
    enableSorting: false,
    enableResizing: false,
    size: 40, // Return to narrower width
    minSize: 40,
    maxSize: 40,
    enableHiding: false, // Prevent the column from being hidden
};

// Define Columns using TanStack Table ColumnDef
const columns: ColumnDef<MediaItem>[] = [
    selectionColumn, // Add checkbox column first
    {
        accessorKey: 'title',
        header: 'Title',
        cell: info => (
            <div className="line-clamp-2 whitespace-normal min-h-[24px] max-h-[48px]" title={info.getValue<string>()}>
                {info.getValue<string>()}
            </div>
        ),
        size: 400,
        minSize: 300,
        enableResizing: true,
    },
    {
        accessorKey: 'libraryName',
        header: 'Library',
        cell: info => info.getValue(),
        size: 120,
        enableResizing: true,
    },
    {
        accessorKey: 'libraryType',
        header: 'Type',
        cell: info => <Badge variant="secondary">{info.getValue<string>()}</Badge>,
        size: 80,
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
        accessorKey: 'originalSize',
        header: 'Original Size',
        cell: info => formatBytes(info.getValue<number>()),
        size: 100,
        enableResizing: true,
    },
    {
        accessorKey: 'encodingJobId',
        header: 'Status',
        cell: info => {
            const jobId = info.getValue<string | null>();
            if (jobId) {
                return <Badge variant="outline" title={jobId}>Processed</Badge>;
            }
            return <Badge variant="secondary">Not Processed</Badge>;
        },
        size: 100,
        enableResizing: true,
        enableSorting: false,
    },
    {
        accessorKey: 'videoCodec',
        header: 'Video',
        cell: info => (
            <span className="text-xs font-mono">
                {info.getValue<string>() ?? '-'}
            </span>
        ),
        size: 80,
        enableResizing: true,
    },
    {
        accessorKey: 'audioCodec',
        header: 'Audio',
        cell: info => (
            <span className="text-xs font-mono">
                {info.getValue<string>() ?? '-'}
            </span>
        ),
        size: 80,
        enableResizing: true,
    },
    {
        accessorKey: 'addedAt',
        header: 'Added',
        cell: info => {
            const date = new Date(info.getValue<string>());
            return <span className="text-xs">{date.toLocaleDateString()}</span>;
        },
        size: 90,
        enableResizing: true,
    },
    {
        accessorKey: 'lastSizeCheckAt',
        header: 'Last Check',
        cell: info => {
            const date = new Date(info.getValue<string>());
            return <span className="text-xs">{date.toLocaleDateString()}</span>;
        },
        size: 90,
        enableResizing: true,
    },
    {
        accessorKey: 'filePath',
        header: 'Path',
        cell: info => {
            const fullPath = info.getValue<string>();
            // Show just the last two parts of the path for cleaner display
            const pathParts = fullPath.split(/[\\/]/); // Split on both forward and back slashes
            const displayPath = pathParts.length > 2 
                ? '...' + pathParts.slice(-2).join('/')
                : fullPath;
            return (
                <span className="text-xs text-muted-foreground truncate block" title={fullPath}>
                    {displayPath}
                </span>
            );
        },
        size: 150,
        enableResizing: true,
    },
];

// Define new column definitions for Resolution and Audio Channels
const resolutionColumn: ColumnDef<MediaItem> = {
    id: 'resolution', // Custom ID needed as accessorKey isn't a single field
    header: 'Res',
    accessorFn: row => row.resolutionWidth && row.resolutionHeight ? `${row.resolutionWidth}x${row.resolutionHeight}` : '-',
    cell: info => <span className="text-xs font-mono">{info.getValue<string>()}</span>,
    size: 80,
    enableResizing: true,
    sortingFn: 'alphanumeric', // Sort based on the formatted string (e.g., 1920x1080)
    // Alternative: If sorting numerically by width is preferred:
    // sortingFn: (rowA, rowB) => (rowA.original.resolutionWidth || 0) - (rowB.original.resolutionWidth || 0),
};

const audioChannelsColumn: ColumnDef<MediaItem> = {
    accessorKey: 'audioChannels',
    header: 'Audio Ch',
    cell: info => {
        const channels = info.getValue<number | null>();
        let channelText = '-';
        if (channels === 1) channelText = 'Mono';
        else if (channels === 2) channelText = 'Stereo';
        else if (channels === 6) channelText = '5.1'; // Common representation for 5.1
        else if (channels === 8) channelText = '7.1'; // Common representation for 7.1
        else if (channels) channelText = `${channels}ch`;
        return <span className="text-xs">{channelText}</span>;
    },
    size: 70,
    enableResizing: true,
};

// Insert new columns into the array (e.g., after codec info)
// Find index based on header, as resolution doesn't have accessorKey
const videoCodecIndex = columns.findIndex(col => col.header === 'Video'); 
if (videoCodecIndex !== -1) {
    columns.splice(videoCodecIndex + 1, 0, resolutionColumn); // Add Resolution after Video Codec
}

const audioCodecIndex = columns.findIndex(col => col.header === 'Audio');
if (audioCodecIndex !== -1) {
    columns.splice(audioCodecIndex + 1, 0, audioChannelsColumn); // Add Audio Channels after Audio Codec
}

// Define initial column order to match the visual hierarchy
const initialColumnOrder: string[] = [
    'select', // Add select to initial order FIRST
    'currentSize',
    'title',
    'libraryName',
    'libraryType',
    'originalSize',
    'encodingJobId',
    'videoCodec',
    'resolution',
    'audioCodec',
    'audioChannels',
    'addedAt',
    'lastSizeCheckAt',
    'filePath',
];

const Media: React.FC = () => {
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(initialColumnOrder);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        'select': true, // Explicitly set select column to visible
    });
    const [sorting, setSorting] = useState<SortingState>([]);
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false); // State for flyout
    // Add state for filters
    const [libraryNameFilter, setLibraryNameFilter] = useState<string>('');
    const [libraryTypeFilter, setLibraryTypeFilter] = useState<'All' | 'TV' | 'Movies' | 'Anime'>('All');
    const [videoCodecFilter, setVideoCodecFilter] = useState<string>('');
    const [audioCodecFilter, setAudioCodecFilter] = useState<string>('');
    // Add state for distinct filter options
    const [libraryNames, setLibraryNames] = useState<string[]>([]);
    const [videoCodecs, setVideoCodecs] = useState<string[]>([]);
    const [audioCodecs, setAudioCodecs] = useState<string[]>([]);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 50,
    });
    // Add total count state for server-side pagination
    const [totalRows, setTotalRows] = useState(0);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [selectedPreset, setSelectedPreset] = useState<string>('');
    
    // Update the types for presets
    const [presets, setPresets] = useState<EncodingPreset[]>([]);
    const { addToQueue } = useQueue();

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

    // Update effect to load presets using correct method name
    useEffect(() => {
        const loadPresets = async () => {
            try {
                const savedPresets = await window.electron.getPresets();
                setPresets(savedPresets || []);
                if (savedPresets?.length > 0) {
                    setSelectedPreset(savedPresets[0].id);
                }
            } catch (err) {
                console.error("Error loading presets:", err);
            }
        };
        loadPresets();
    }, []);

    const fetchMedia = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const query = searchParams.get('q');
        
        // First, get total count for pagination
        let countSql = `
            SELECT COUNT(*) as total
            FROM media
            WHERE 1=1
        `;
        
        let mainSql = `
            SELECT 
                id, title, filePath, libraryName, libraryType,
                originalSize, currentSize, lastSizeCheckAt,
                videoCodec, audioCodec, addedAt, encodingJobId,
                resolutionWidth, resolutionHeight, audioChannels
            FROM media 
            WHERE 1=1
        `;
        
        let conditions: string[] = [];
        let params: any[] = [];

        // Add FTS search if query exists
        if (query) {
            countSql = `
                SELECT COUNT(*) as total
                FROM media AS m
                JOIN media_fts AS fts ON m.id = fts.rowid
                WHERE 1=1
            `;
            mainSql = `
                SELECT 
                    m.id, m.title, m.filePath, m.libraryName, m.libraryType,
                    m.originalSize, m.currentSize, m.lastSizeCheckAt,
                    m.videoCodec, m.audioCodec, m.addedAt, m.encodingJobId,
                    m.resolutionWidth, m.resolutionHeight, m.audioChannels
                FROM media AS m
                JOIN media_fts AS fts ON m.id = fts.rowid
                WHERE 1=1
            `;
            conditions.push('fts.media_fts MATCH ?');
            params.push(`${query.replace(/'/g, "''")}*`);
        }

        // Add filter conditions
        if (libraryNameFilter && libraryNameFilter !== 'All') {
            conditions.push('libraryName = ?');
            params.push(libraryNameFilter);
        }
        if (libraryTypeFilter !== 'All') {
            conditions.push('libraryType = ?');
            params.push(libraryTypeFilter);
        }
        if (videoCodecFilter && videoCodecFilter !== 'All') {
            conditions.push('videoCodec = ?');
            params.push(videoCodecFilter);
        }
        if (audioCodecFilter && audioCodecFilter !== 'All') {
            conditions.push('audioCodec = ?');
            params.push(audioCodecFilter);
        }

        // Append conditions to SQL
        if (conditions.length > 0) {
            const whereClause = ' AND ' + conditions.join(' AND ');
            countSql += whereClause;
            mainSql += whereClause;
        }

        // Add ordering based on sorting state
        if (sorting.length > 0) {
            const sort = sorting[0]; // Assuming single column sorting for now
            const { id: columnId, desc } = sort;
            // Validate columnId against known columns to prevent SQL injection
            const validColumns = ['title', 'libraryName', 'libraryType', 'videoCodec', 'audioCodec', 'originalSize', 'currentSize', 'filePath', 'addedAt', 'lastSizeCheckAt', 'resolutionWidth', 'audioChannels']; // Add new sortable columns
            if (validColumns.includes(columnId)) {
                // For resolution, we sort by width
                const sqlColumn = columnId === 'resolution' ? 'resolutionWidth' : columnId;
                mainSql += ` ORDER BY ${sqlColumn} ${desc ? 'DESC' : 'ASC'}`;
            } else {
                console.warn(`Invalid sort column ignored: ${columnId}`);
                // Default sort if invalid column or FTS query is used
                mainSql += query ? ' ORDER BY rank, addedAt DESC' : ' ORDER BY addedAt DESC';
            }
        } else {
            // Default sort order if no specific sorting is applied
            mainSql += query ? ' ORDER BY rank, addedAt DESC' : ' ORDER BY addedAt DESC';
        }

        // Add pagination
        mainSql += ' LIMIT ? OFFSET ?';
        const paginationParams = [...params, pagination.pageSize, pagination.pageIndex * pagination.pageSize];

        try {
            // Get total count first
            const countResult = await window.electron.dbQuery(countSql, params);
            const total = countResult[0]?.total || 0;
            setTotalRows(total);

            // Then get paginated data
            const results = await window.electron.dbQuery(mainSql, paginationParams);
            setMediaItems(results as MediaItem[]);
        } catch (err) {
            console.error("Error fetching media:", err);
            setError(err instanceof Error ? err.message : 'Failed to fetch media');
            setMediaItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [searchParams, pagination.pageIndex, pagination.pageSize, libraryNameFilter, libraryTypeFilter, videoCodecFilter, audioCodecFilter, sorting]); // Add sorting to dependency array

    useEffect(() => {
        fetchMedia();
    }, [fetchMedia]);

    // Update media details logic with correct method names
    const handleEncodeSelected = async () => {
        console.log('Starting handleEncodeSelected...');
        // Get selected media IDs
        const selectedRowKeys = Object.keys(rowSelection);
        console.log('Selected row keys:', selectedRowKeys);
        const selectedMediaIds = selectedRowKeys.map(key => table.getRow(key).original.id);
        console.log('Mapped selected media IDs:', selectedMediaIds);
        
        // Get selected preset
        const preset = presets.find(p => p.id === selectedPreset);
        console.log('Selected preset ID:', selectedPreset);
        console.log('Found preset:', preset);
        
        if (!preset) {
            console.error("No preset selected or found");
            // TODO: Add user feedback (e.g., toast notification)
            return;
        }
        
        // Queue selected media for encoding
        let queuedCount = 0;
        for (const mediaId of selectedMediaIds) {
            console.log(`Processing media ID: ${mediaId}`);
            const mediaItem = mediaItems.find(item => item.id === mediaId);
            console.log(`Found media item for ID ${mediaId}:`, mediaItem);
            
            if (mediaItem) {
                try {
                    console.log(`Attempting to probe file: ${mediaItem.filePath}`);
                    const probeData = await window.electron.probeFile(mediaItem.filePath);
                    console.log(`Probe data for ${mediaId}:`, probeData);
                    
                    if (!probeData) {
                        console.error(`Failed to probe file: ${mediaItem.filePath}`);
                        // TODO: Add user feedback
                        continue;
                    }
                    
                    // Create output path
                    const pathSeparator = window.navigator.platform.indexOf('Win') > -1 ? '\\' : '/';
                    const fileDir = mediaItem.filePath.split(/[/\\]/).slice(0, -1).join(pathSeparator);
                    const fileName = mediaItem.filePath.split(/[/\\]/).pop() || '';
                    const fileNameWithoutExt = fileName.split('.').slice(0, -1).join('.');
                    // Use preset extension if available, otherwise default to mkv
                    const outputExtension = probeData.format?.format_name?.includes('mp4') ? 'mp4' : 'mkv'; // Simple default, might need refinement
                    const outputPath = `${fileDir}${pathSeparator}${fileNameWithoutExt}_encoded.${outputExtension}`;
                    console.log(`Generated output path for ${mediaId}: ${outputPath}`);
                    
                    console.log(`Calling addToQueue for ${mediaId} with preset:`, preset.name);
                    // Add to encoding queue
                    const addedJob = addToQueue(
                        mediaItem.filePath,
                        outputPath,
                        false, // don't overwrite input
                        preset,
                        probeData,
                        { audio: {}, subtitle: {} } // Default track selections - TODO: Allow user selection?
                    );
                    console.log(`addToQueue result for ${mediaId}:`, addedJob);
                    
                    // Save reference to job ID in media database
                    if (addedJob && addedJob.id) {
                        await saveJobMediaReference(addedJob.id, mediaId);
                        console.log(`Saved job-media reference: Job ${addedJob.id} -> Media ${mediaId}`);
                    }
                    
                    queuedCount++;
                    
                } catch (err) {
                    console.error(`Error queuing media item ${mediaId}:`, err);
                    // TODO: Add user feedback for individual failures
                }
            }
        }
        
        console.log(`Finished processing. Queued ${queuedCount} items.`);
        // Clear selection after queueing
        setRowSelection({});
        // TODO: Add feedback indicating queueing is complete (e.g., toast)
    };

    // Count selected rows
    const selectedCount = Object.keys(rowSelection).length;

    // Initialize TanStack Table with server-side pagination, sorting, and row selection
    const table = useReactTable({
        data: mediaItems,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
        defaultColumn: {
            minSize: 50,
            maxSize: 1000,
        },
        initialState: {
            columnOrder: initialColumnOrder,
        },
        state: {
            columnOrder,
            columnVisibility,
            sorting,
            pagination,
            rowSelection,
        },
        onColumnOrderChange: setColumnOrder,
        onColumnVisibilityChange: setColumnVisibility,
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        onRowSelectionChange: setRowSelection,
        manualPagination: true, // Enable manual pagination
        manualSorting: true, // Enable manual sorting
        pageCount: Math.ceil(totalRows / pagination.pageSize), // Calculate total pages
    });

    // Keep the effect to ensure select column visibility, but without debug logging
    useEffect(() => {
        // Ensure the selection column is always visible
        if (table) {
            const selectColumn = table.getColumn('select');
            if (selectColumn && !selectColumn.getIsVisible()) {
                table.setColumnVisibility(prev => ({ ...prev, 'select': true }));
            }
        }
    }, [table]);

    return (
        <div className="h-full w-full p-6 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    {searchParams.get('q') ? `Search Results for "${searchParams.get('q')}"` : 'Discovered Media'}
                </h1>

                <div className="flex items-center space-x-2">
                    {selectedCount > 0 ? (
                        <div className="flex items-center mr-2 px-3 py-1 rounded-md bg-background border border-border">
                            <span className="text-sm font-medium mr-2 text-primary">
                                {selectedCount} selected
                            </span>
                            <Select
                                value={selectedPreset}
                                onValueChange={setSelectedPreset}
                            >
                                <SelectTrigger className="w-[180px] bg-background border-border">
                                    <SelectValue placeholder="Select preset" />
                                </SelectTrigger>
                                <SelectContent>
                                    {presets.map(preset => (
                                        <SelectItem key={preset.id} value={preset.id}>
                                            {preset.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={handleEncodeSelected}
                                disabled={!selectedPreset}
                                className="ml-2 bg-white text-black hover:bg-gray-100 hover:text-black"
                            >
                                <PlayCircle className="mr-2 h-4 w-4" />
                                Encode
                            </Button>
                        </div>
                    ) : null}
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

            {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mb-6">{error}</p>}

            <div className="flex-1 min-h-0 border rounded-lg bg-card text-card-foreground">
                <div className="h-full flex flex-col">
                    {/* Add the encode title above the table with less padding and left alignment */}
                    <div className="border-b px-2 py-1.5 flex items-center">
                        <span className="text-sm font-medium text-left">Encode</span>
                        <span className="text-xs text-muted-foreground ml-2">
                            Select items to encode using the checkboxes
                        </span>
                    </div>
                    
                    <div className="flex-1 min-h-0">
                        <ScrollArea className="h-full">
                            <div className="[&_::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']" style={{ width: table.getCenterTotalSize() }}>
                                <Table>
                                    <TableHeader>
                                        {table.getHeaderGroups().map(headerGroup => (
                                            <TableRow key={headerGroup.id}>
                                                {headerGroup.headers.map(header => (
                                                    <TableHead 
                                                        key={header.id} 
                                                        style={{ width: header.getSize() }}
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
                                                    colSpan={table.getAllColumns().length}
                                                    className="text-center text-muted-foreground h-24"
                                                >
                                                    Loading media...
                                                </TableCell>
                                            </TableRow>
                                        ) : table.getRowModel().rows.length === 0 ? (
                                            <TableRow>
                                                <TableCell 
                                                    colSpan={table.getAllColumns().length}
                                                    className="text-center text-muted-foreground h-24"
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
                                                        >
                                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <ScrollBar orientation="horizontal" className="mt-1" />
                        </ScrollArea>
                    </div>
                    <div className="flex items-center justify-between px-4 py-4 border-t bg-card">
                        <div className="flex items-center space-x-6 lg:space-x-8">
                            <div className="flex items-center space-x-2">
                                <p className="text-sm font-medium">Rows per page</p>
                                <Select
                                    value={`${pagination.pageSize}`}
                                    onValueChange={(value) => {
                                        table.setPageSize(Number(value));
                                    }}
                                >
                                    <SelectTrigger className="h-8 w-[100px]">
                                        <SelectValue placeholder={pagination.pageSize} />
                                    </SelectTrigger>
                                    <SelectContent side="top">
                                        {[50, 100, 150, 200].map((pageSize) => (
                                            <SelectItem key={pageSize} value={`${pageSize}`}>
                                                {pageSize}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex w-[150px] items-center justify-center text-sm font-medium">
                                Page {table.getState().pagination.pageIndex + 1} of{" "}
                                {table.getPageCount() || 1} ({totalRows} items)
                            </div>
                            <div className="flex items-center space-x-2">
                                <Button
                                    variant="outline"
                                    className="hidden h-8 w-8 p-0 lg:flex"
                                    onClick={() => table.setPageIndex(0)}
                                    disabled={!table.getCanPreviousPage()}
                                >
                                    <span className="sr-only">Go to first page</span>
                                    <ChevronFirst className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() => table.previousPage()}
                                    disabled={!table.getCanPreviousPage()}
                                >
                                    <span className="sr-only">Go to previous page</span>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() => table.nextPage()}
                                    disabled={!table.getCanNextPage()}
                                >
                                    <span className="sr-only">Go to next page</span>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    className="hidden h-8 w-8 p-0 lg:flex"
                                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                                    disabled={!table.getCanNextPage()}
                                >
                                    <span className="sr-only">Go to last page</span>
                                    <ChevronLast className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Media;