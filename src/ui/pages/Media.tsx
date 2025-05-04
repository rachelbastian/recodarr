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
import { Columns, CheckSquare } from 'lucide-react';
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
import { 
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../../../src/components/ui/tooltip";
import { Card, CardContent } from "../../../src/components/ui/card";
import { Info, Film, Music, Tv2, Maximize2, Volume2, Library, Folder, BookOpen } from 'lucide-react';

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

// Add custom resolution icons/components
const ResolutionIcon: React.FC<{ height: number | null }> = ({ height }) => {
    if (!height) return null;
    
    if (height >= 4320) {
        return <span className="font-bold text-[8px] bg-purple-500/20 text-purple-500 px-1 rounded">8K</span>;
    } else if (height >= 2160) {
        return <span className="font-bold text-[8px] bg-indigo-500/20 text-indigo-500 px-1 rounded">4K</span>;
    } else if (height >= 1440) {
        return <span className="font-bold text-[8px] bg-blue-500/20 text-blue-500 px-1 rounded">2K</span>;
    } else if (height >= 1080) {
        return <span className="font-bold text-[8px] bg-green-500/20 text-green-500 px-1 rounded">HD</span>;
    } else if (height >= 720) {
        return <span className="font-bold text-[8px] bg-yellow-500/20 text-yellow-500 px-1 rounded">HD</span>;
    } else if (height >= 480) {
        return <span className="font-bold text-[8px] bg-orange-500/20 text-orange-500 px-1 rounded">SD</span>;
    } else {
        return <span className="font-bold text-[8px] bg-red-500/20 text-red-500 px-1 rounded">SD</span>;
    }
};

// Add audio codec icon component at the top of the file
const AudioCodecIcon: React.FC<{ codec: string | null }> = ({ codec }) => {
    if (!codec) return null;
    
    const upperCodec = codec.toUpperCase();
    
    // Dolby formats (AC3, EAC3, TrueHD)
    if (upperCodec.includes('EAC3') || upperCodec.includes('AC3') || upperCodec.includes('TRUEHD') || upperCodec.includes('DOLBY')) {
        return (
            <svg className="h-3 w-5 mr-1" viewBox="0 0 640 512" fill="currentColor">
                <path d="M392 32H248C111 32 0 143 0 280s111 248 248 248h144c137 0 248-111 248-248S529 32 392 32zm0 96c65.3 0 118.7 37.1 146.8 91.2-30 7-59.3 14.7-86.6 23.3-29.8 9.3-58.9 19.9-86.2 32.6-86.8 40.3-180.5 93.7-211.9 197.5C128.5 445.2 109 366.4 109 280c0-91.9 74.1-166 166-166h117zm0 320H248c-79.7 0-146.8-54.4-166-128.1 14.7-33.5 41.3-60.3 76.1-73.7 56.8-21.8 110-37.5 164.3-51.8 29.3-7.7 58.9-15.2 89-23.1 18.4 32 29.6 69.4 29.6 109.7 0 91.9-74.1 166-166 166z"/>
            </svg>
        );
    }
    
    // DTS formats
    if (upperCodec.includes('DTS')) {
        return (
            <svg className="h-3 w-5 mr-1" viewBox="0 0 640 512" fill="currentColor">
                <path d="M106.2 467.8c-13.74 0-24.82-11.34-24.82-25.43V70.47c0-14.09 11.08-25.43 24.82-25.43h427.5c13.74 0 24.82 11.35 24.82 25.43v371.9c0 14.09-11.08 25.43-24.82 25.43H106.2zm208.9-346.6v270.8h100.8c56.35 0 93.33-37.23 93.33-135.4 0-104.4-34.56-135.4-93.33-135.4H315.1zm-83.64 270.8H282.7V121.2h-51.2V391.2h.03zm83.64-217.7h49.72c34.5 0 40.6 35.19 40.6 82.28 0 51.59-6.23 82.28-40.6 82.28H315.1V173.5z"/>
            </svg>
        );
    }
    
    // For other codec types, create visual badges with appropriate styling
    if (upperCodec === 'FLAC' || upperCodec === 'ALAC') {
        return (
            <div className="flex items-center justify-center h-3 px-1 mr-1 rounded bg-purple-500/20 text-purple-500">
                <span className="text-[8px] font-bold">{upperCodec}</span>
            </div>
        );
    }
    
    if (upperCodec === 'AAC') {
        return (
            <div className="flex items-center justify-center h-3 px-1 mr-1 rounded bg-green-500/20 text-green-500">
                <span className="text-[8px] font-bold">AAC</span>
            </div>
        );
    }
    
    if (upperCodec === 'MP3') {
        return (
            <div className="flex items-center justify-center h-3 px-1 mr-1 rounded bg-blue-400/20 text-blue-400">
                <span className="text-[8px] font-bold">MP3</span>
            </div>
        );
    }
    
    if (upperCodec === 'OPUS') {
        return (
            <div className="flex items-center justify-center h-3 px-1 mr-1 rounded bg-indigo-500/20 text-indigo-500">
                <span className="text-[8px] font-bold">OPUS</span>
            </div>
        );
    }
    
    // Default for other codecs
    return (
        <div className="flex items-center justify-center h-3 px-1 mr-1 rounded bg-gray-500/20 text-gray-500">
            <span className="text-[8px] font-bold">{upperCodec.slice(0, 4)}</span>
        </div>
    );
};

// Replace the existing AudioCodecDisplay component with this:
const AudioCodecDisplay: React.FC<{ codec: string | null, channels: number | null }> = ({ codec, channels }) => {
    if (!codec) return null;
    
    // Convert codec to consumer-friendly name
    const getAudioName = (c: string): string => {
        const upperCodec = c.toUpperCase();
        
        if (upperCodec.includes('EAC3') || upperCodec.includes('EAC-3')) return 'Dolby Digital+';
        if (upperCodec.includes('AC3') || upperCodec.includes('AC-3')) return 'Dolby Digital';
        if (upperCodec.includes('TRUEHD')) return 'Dolby TrueHD';
        if (upperCodec.includes('DTS-HD')) return 'DTS-HD';
        if (upperCodec.includes('DTS')) return 'DTS';
        if (upperCodec === 'AAC') return 'AAC';
        if (upperCodec === 'MP3') return 'MP3';
        if (upperCodec === 'OPUS') return 'Opus';
        if (upperCodec === 'FLAC') return 'FLAC';
        if (upperCodec === 'VORBIS') return 'Vorbis';
        if (upperCodec === 'PCM') return 'PCM';
        if (upperCodec === 'ALAC') return 'ALAC';
        
        // Return original if no match
        return c;
    };
    
    return (
        <div className="flex items-center">
            <AudioCodecIcon codec={codec} />
        </div>
    );
};

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

    // Add state for view type
    const [viewType, setViewType] = useState<'table' | 'grid'>('grid');
    const [selectionMode, setSelectionMode] = useState<boolean>(false);

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

    // Add a function to toggle selection mode
    const toggleSelectionMode = () => {
        // If turning off selection mode, clear all selections
        if (selectionMode) {
            setRowSelection({});
        }
        setSelectionMode(!selectionMode);
    };

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
                    
                    <Button
                        variant={selectionMode ? "default" : "outline"}
                        size="sm"
                        onClick={toggleSelectionMode}
                        className="mr-1"
                    >
                        <CheckSquare className="h-4 w-4 mr-2" />
                        {selectionMode ? "Cancel Selection" : "Select Items"}
                    </Button>
                    
                    <div className="flex items-center space-x-2">
                        <Button 
                            variant={viewType === 'table' ? "default" : "outline"} 
                            size="sm" 
                            onClick={() => setViewType('table')}
                            className="px-2"
                        >
                            <Columns className="h-4 w-4" />
                        </Button>
                        <Button 
                            variant={viewType === 'grid' ? "default" : "outline"} 
                            size="sm" 
                            onClick={() => setViewType('grid')}
                            className="px-2"
                        >
                            <Columns className="h-4 w-4 rotate-90" />
                        </Button>
                    </div>

                    {viewType === 'table' && (
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
                    )}

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
                        {viewType === 'table' ? (
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
                        ) : (
                            <ScrollArea className="h-full">
                                <div className="p-4">
                                    <div className="flex flex-col space-y-4">
                                        {isLoading ? (
                                            Array(8).fill(0).map((_, i) => (
                                                <div key={i} className="animate-pulse h-24 rounded-md border w-full bg-card"></div>
                                            ))
                                        ) : mediaItems.length === 0 ? (
                                            <div className="flex items-center justify-center h-48 text-muted-foreground">
                                                {searchParams.get('q') ? 'No media found matching your search.' : 'No media discovered yet. Add a library and scan.'}
                                            </div>
                                        ) : (
                                            mediaItems.map(item => (
                                                <div key={item.id} className="border rounded-lg hover:border-primary transition-colors bg-card overflow-hidden">
                                                    <div className="p-4">
                                                        <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-start w-full">
                                                            {/* Selection checkbox column */}
                                                            {selectionMode && (
                                                                <div className="pt-1">
                                                                    <div 
                                                                        className={`flex-shrink-0 h-5 w-5 rounded flex items-center justify-center cursor-pointer transition-colors ${
                                                                            rowSelection[item.id.toString()] 
                                                                                ? "bg-primary text-primary-foreground" 
                                                                                : "border border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5"
                                                                        }`}
                                                                        onClick={() => {
                                                                            setRowSelection(prev => ({
                                                                                ...prev,
                                                                                [item.id.toString()]: !prev[item.id.toString()]
                                                                            }));
                                                                        }}
                                                                    >
                                                                        {rowSelection[item.id.toString()] && (
                                                                            <Check className="h-3 w-3" />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            
                                                            {/* Middle content column */}
                                                            <div className={`min-w-0 ${!selectionMode ? 'col-span-2' : ''}`}>
                                                                <div className="flex items-baseline min-w-0">
                                                                    <div className="w-10 flex-shrink-0">
                                                                        <span className="text-xs font-medium text-muted-foreground">Title:</span>
                                                                    </div>
                                                                    <h3 className="font-medium text-base truncate flex-1" title={item.title}>
                                                                        {item.title}
                                                                    </h3>
                                                                </div>
                                                                
                                                                <div className="flex items-center mt-1.5 min-w-0">
                                                                    <div className="w-10 flex-shrink-0">
                                                                        <span className="text-xs font-medium text-muted-foreground">Path:</span>
                                                                    </div>
                                                                    <div className="text-[10px] text-muted-foreground/60 truncate flex-1" title={item.filePath}>
                                                                        {item.filePath}
                                                                    </div>
                                                                </div>
                                                                
                                                                {/* Tags section at the bottom */}
                                                                <div className="flex flex-wrap gap-1.5 mt-3 ml-10">
                                                                    <TooltipProvider delayDuration={200}>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Badge variant="secondary" className="text-xs">
                                                                                    {item.libraryType === "TV" ? <Tv2 className="h-3 w-3 mr-1" /> :
                                                                                    item.libraryType === "Movies" ? <Film className="h-3 w-3 mr-1" /> :
                                                                                    null}
                                                                                    {item.libraryType}
                                                                                </Badge>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent side="top" className="text-xs bg-secondary">
                                                                                <p>Content Type: {item.libraryType}</p>
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                        
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Badge variant="outline" className="text-xs bg-background/50">
                                                                                    <BookOpen className="h-2.5 w-2.5 mr-1" />
                                                                                    {item.libraryName}
                                                                                </Badge>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent side="top" className="text-xs">
                                                                                <p>Library: {item.libraryName}</p>
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                        
                                                                        {item.videoCodec && (
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <Badge variant="outline" className="text-xs bg-background/50">
                                                                                        <Film className="h-2.5 w-2.5 mr-1" />
                                                                                        {item.videoCodec}
                                                                                    </Badge>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent side="top" className="text-xs">
                                                                                    <p>Video Codec: {item.videoCodec}</p>
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        )}
                                                                        
                                                                        {item.resolutionWidth && item.resolutionHeight && (
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <Badge variant="outline" className="text-xs bg-background/50">
                                                                                        <ResolutionIcon height={item.resolutionHeight} />
                                                                                        <span className="ml-1">
                                                                                            {item.resolutionHeight >= 4320 ? '8K' :
                                                                                             item.resolutionHeight >= 2160 ? '4K' :
                                                                                             item.resolutionHeight >= 1440 ? '2K' :
                                                                                             item.resolutionHeight >= 1080 ? '1080P' :
                                                                                             item.resolutionHeight >= 720 ? '720P' :
                                                                                             item.resolutionHeight >= 480 ? '480P' : 'SD'}
                                                                                        </span>
                                                                                    </Badge>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent side="top" className="text-xs">
                                                                                    <p>Resolution: {item.resolutionWidth} x {item.resolutionHeight}
                                                                                    {item.resolutionHeight >= 4320 ? ' (8K)' : 
                                                                                     item.resolutionHeight >= 2160 ? ' (4K)' : 
                                                                                     item.resolutionHeight >= 1440 ? ' (2K)' :
                                                                                     item.resolutionHeight >= 1080 ? ' (1080P)' : 
                                                                                     item.resolutionHeight >= 720 ? ' (720P)' : 
                                                                                     item.resolutionHeight >= 480 ? ' (480P)' : ' (SD)'}
                                                                                    </p>
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        )}
                                                                        
                                                                        {item.audioCodec && (
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <Badge variant="outline" className="text-xs bg-background/50 flex items-center">
                                                                                        <AudioCodecDisplay codec={item.audioCodec} channels={item.audioChannels} />
                                                                                        <span>
                                                                                            {(() => {
                                                                                                const codec = item.audioCodec.toUpperCase();
                                                                                                if (codec.includes('EAC3') || codec.includes('EAC-3')) return 'Dolby Digital+';
                                                                                                if (codec.includes('AC3') || codec.includes('AC-3')) return 'Dolby Digital';
                                                                                                if (codec.includes('TRUEHD')) return 'Dolby TrueHD';
                                                                                                if (codec.includes('DTS-HD')) return 'DTS-HD';
                                                                                                if (codec.includes('DTS')) return 'DTS';
                                                                                                return item.audioCodec;
                                                                                            })()}
                                                                                            {item.audioChannels ? ` (${
                                                                                                item.audioChannels === 2 ? '2.0' : 
                                                                                                item.audioChannels === 6 ? '5.1' : 
                                                                                                item.audioChannels === 8 ? '7.1' : 
                                                                                                `${item.audioChannels}ch`
                                                                                            })` : ''}
                                                                                        </span>
                                                                                    </Badge>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent side="top" className="text-xs">
                                                                                    <p>Audio Codec: {item.audioCodec} 
                                                                                    {item.audioChannels ? 
                                                                                        (item.audioChannels === 2 ? ' (Stereo 2.0)' : 
                                                                                         item.audioChannels === 6 ? ' (5.1 Surround)' : 
                                                                                         item.audioChannels === 8 ? ' (7.1 Surround)' : 
                                                                                         ` (${item.audioChannels} channels)`) : ''}
                                                                                    </p>
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        )}
                                                                    </TooltipProvider>
                                                                </div>
                                                            </div>
                                                            
                                                            {/* Right side column with size and status */}
                                                            <div className="flex flex-col items-end space-y-2 min-w-[130px]">
                                                                <div className="flex items-center gap-2">
                                                                    {item.encodingJobId ? (
                                                                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20">
                                                                            <Check className="h-3 w-3 mr-1" />
                                                                            Processed
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20">
                                                                            Not Processed
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                
                                                                <div className="flex gap-1 items-baseline">
                                                                    <span className="font-medium text-sm">{formatBytes(item.currentSize)}</span>
                                                                    <span className="text-xs text-muted-foreground">/</span>
                                                                    <span className="text-xs text-muted-foreground">{formatBytes(item.originalSize)}</span>
                                                                </div>
                                                                
                                                                <TooltipProvider delayDuration={300}>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button variant="outline" size="sm" className="h-6 px-2 py-0 rounded-full border-muted-foreground/20 hover:bg-muted">
                                                                                <Info className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                                                                                <span className="text-xs text-muted-foreground">Details</span>
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="left" align="end" className="p-0 w-[280px] overflow-hidden">
                                                                            <div className="bg-primary/5 p-3 border-b">
                                                                                <p className="font-medium text-sm">File Details</p>
                                                                            </div>
                                                                            <div className="p-3">
                                                                                <div className="grid grid-cols-[90px_1fr] gap-y-2 text-xs">
                                                                                    <span className="text-muted-foreground">Path:</span>
                                                                                    <span className="truncate" title={item.filePath}>{item.filePath}</span>
                                                                                    <span className="text-muted-foreground">Added:</span>
                                                                                    <span>{new Date(item.addedAt).toLocaleDateString()}</span>
                                                                                    <span className="text-muted-foreground">Last Check:</span>
                                                                                    <span>{new Date(item.lastSizeCheckAt).toLocaleDateString()}</span>
                                                                                    <span className="text-muted-foreground">Space Saved:</span>
                                                                                    <span className="font-medium text-green-500">
                                                                                        {item.originalSize > item.currentSize ? 
                                                                                            formatBytes(item.originalSize - item.currentSize) : 
                                                                                            '0 Bytes'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </ScrollArea>
                        )}
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