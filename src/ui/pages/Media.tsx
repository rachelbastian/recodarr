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
            ORDER BY addedAt DESC
        `;
        let params: any[] = [];

        if (query) {
            console.log(`Fetching media matching: ${query}`);
            sql = `
                SELECT 
                    m.id, m.title, m.filePath, m.libraryName, m.libraryType,
                    m.originalSize, m.currentSize, m.lastSizeCheckAt,
                    m.videoCodec, m.audioCodec, m.addedAt
                FROM media AS m
                JOIN media_fts AS fts ON m.id = fts.rowid
                WHERE fts.media_fts MATCH ? 
                ORDER BY rank, m.addedAt DESC
            `;
            params = [`${query.replace(/'/g, "''")}*`];
        }

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
    }, [searchParams]);

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
                                                onClick={header.column.getToggleSortingHandler()}
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