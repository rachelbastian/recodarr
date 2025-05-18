import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Play, Pause, Trash2, FileX, SkipForward, Settings, AlertCircle, CheckCircle, PlayCircle, Clock, FileText } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { EncodingJob, JobStatus } from "../../services/queueService";
import { useQueue } from '../../hooks/useQueue';
import { getJobLog, openJobLog, formatJobLogForDisplay, associateLogWithJob, getAllLogMappings } from "../../utils/jobLogUtil";

// TanStack Table imports
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    SortingState,
    getSortedRowModel,
} from '@tanstack/react-table';

// Status icon mapping
const StatusIcon: React.FC<{ status: JobStatus }> = ({ status }) => {
  switch (status) {
    case 'queued':
      return <Clock className="h-4 w-4 text-slate-400" />;
    case 'processing':
      return <PlayCircle className="h-4 w-4 text-indigo-500 animate-pulse" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'cancelled':
      return <FileX className="h-4 w-4 text-slate-400" />;
    default:
      return null;
  }
};

// Status badge component
const StatusBadge: React.FC<{ status: JobStatus }> = ({ status }) => {
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  
  switch (status) {
    case 'queued':
      variant = "outline";
      break;
    case 'processing':
      variant = "default";
      break;
    case 'completed':
      variant = "secondary";
      break;
    case 'failed':
    case 'cancelled':
      variant = "destructive";
      break;
  }
  
  return (
    <Badge variant={variant} className="capitalize">
      <StatusIcon status={status} />
      <span className="ml-1">{status}</span>
    </Badge>
  );
};

// Job Log Dialog component
const JobLogDialog: React.FC<{ job: EncodingJob, isOpen: boolean, onClose: () => void }> = ({ job, isOpen, onClose }) => {
  const [logContent, setLogContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadLog();
    }
  }, [isOpen, job.id]);

  const loadLog = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const log = await getJobLog(job.id);
      setLogContent(log);
    } catch (err) {
      setError('Failed to load log: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenExternalLog = async () => {
    try {
      const result = await openJobLog(job.id);
      if (!result.success) {
        setError(result.error || 'Failed to open log file');
      }
    } catch (err) {
      setError('Error opening log: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Job Log: {job.id}</DialogTitle>
        </DialogHeader>
        
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <div>
              <Badge variant="outline" className="mb-2">{job.status}</Badge>
              <p className="text-sm text-muted-foreground mb-1">Input: {job.inputPath}</p>
              <p className="text-sm text-muted-foreground">Output: {job.outputPath}</p>
            </div>
            <Button onClick={handleOpenExternalLog} variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Open in Editor
            </Button>
          </div>
          {job.error && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{job.error}</AlertDescription>
            </Alert>
          )}
        </div>
        
        {isLoading ? (
          <div className="flex justify-center p-4">
            <p>Loading log...</p>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading log</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="h-[400px] border rounded-md bg-black p-4">
            <pre className="text-xs font-mono text-white whitespace-pre-wrap">
              {formatJobLogForDisplay(job, logContent)}
            </pre>
          </ScrollArea>
        )}
        
        <DialogFooter>
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Job details component
const JobDetails: React.FC<{ job: EncodingJob, onRemove?: (jobId: string) => void }> = ({ job, onRemove }) => {
  const [localProgress, setLocalProgress] = useState(job.progress);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);

  useEffect(() => {
    if (Math.abs(job.progress - localProgress) > 0.5) {
      console.log(`JobDetails: Updating progress for job ${job.id} from ${localProgress.toFixed(1)}% to ${job.progress.toFixed(1)}%`);
      setLocalProgress(job.progress);
      setLastUpdate(Date.now());
    }
  }, [job.progress, localProgress, job.id]);

  const getFilename = (path: string) => {
    return path.split(/[\/\\]/).pop() || path;
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center mb-1">
          <div className="text-xs text-muted-foreground">
            ID: {job.id}
          </div>
          <StatusBadge status={job.status} />
        </div>
        <CardTitle className="text-md font-medium truncate">
          {getFilename(job.outputPath)}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-sm font-medium">Input Path</div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="w-full text-left">
                    <div className="text-sm text-muted-foreground truncate max-w-[280px]">{job.inputPath}</div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{job.inputPath}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div>
              <div className="text-sm font-medium">Output Path</div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="w-full text-left">
                    <div className="text-sm text-muted-foreground truncate max-w-[280px]">{job.outputPath}</div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{job.outputPath}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Preset</div>
            <div className="text-sm text-muted-foreground">{job.preset?.name || 'Custom Settings'}</div>
          </div>
          <div>
            <div className="text-sm font-medium">Progress</div>
            <div className="flex items-center gap-2">
              <Progress 
                value={Math.max(0, Math.min(100, job.progress))} 
                className="flex-1" 
              />
              <span className="text-sm">{job.progress.toFixed(1)}%</span>
            </div>
            {job.status === 'processing' && (
              <div className="text-xs text-muted-foreground mt-1">
                Last updated: {new Date(lastUpdate).toLocaleTimeString()}
              </div>
            )}
          </div>
          {job.status === 'processing' && job.fps !== undefined && (
            <div className="text-sm text-muted-foreground">
              {job.fps.toFixed(1)} FPS
              {job.frame !== undefined && job.totalFrames !== undefined && (
                <span className="ml-2">Frame {job.frame} / {job.totalFrames}</span>
              )}
            </div>
          )}
          {job.error && (
            <Alert variant="destructive" className="py-2">
              <AlertTitle className="text-sm">Error</AlertTitle>
              <AlertDescription className="text-xs">{job.error}</AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
      <CardFooter className="py-2 flex gap-2">
        {job.status === 'queued' && onRemove && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => onRemove(job.id)}>
            <Trash2 className="h-4 w-4 mr-1" /> Remove
          </Button>
        )}
        
        {(job.status === 'completed' || job.status === 'failed' || job.status === 'processing') && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setIsLogDialogOpen(true)}>
            <FileText className="h-4 w-4 mr-1" /> View Log
          </Button>
        )}
        
        {isLogDialogOpen && <JobLogDialog job={job} isOpen={isLogDialogOpen} onClose={() => setIsLogDialogOpen(false)} />}
      </CardFooter>
    </Card>
  );
};

const QueueSettings: React.FC<{ maxJobs: number, onMaxJobsChange: (value: number) => void }> = ({ 
  maxJobs, 
  onMaxJobsChange 
}) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="max-parallel">Maximum Parallel Jobs</Label>
        <Select 
          value={maxJobs.toString()} 
          onValueChange={(value) => onMaxJobsChange(parseInt(value))}
        >
          <SelectTrigger id="max-parallel">
            <SelectValue placeholder="Select maximum parallel jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 job</SelectItem>
            <SelectItem value="2">2 jobs</SelectItem>
            <SelectItem value="3">3 jobs</SelectItem>
            <SelectItem value="4">4 jobs</SelectItem>
            <SelectItem value="6">6 jobs</SelectItem>
            <SelectItem value="8">8 jobs</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Higher values will use more system resources. For most systems, 2-4 is recommended.
        </p>
      </div>
    </div>
  );
};

// Helper to extract filename for table display
const getFilenameFromPath = (path: string) => path.split(/[\\/]/).pop() || path;

// Define columns for the TanStack Jobs Table
const jobTableColumns: ColumnDef<EncodingJob>[] = [
    {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="text-xs font-mono">{row.original.id.substring(0, 8)}...</span>,
        size: 80,
    },
    {
        accessorKey: 'inputPath',
        header: 'Input File',
        cell: ({ row }) => (
            <TooltipProvider delayDuration={100}> <Tooltip>
                <TooltipTrigger className="truncate text-left block w-full max-w-[180px] hover:underline">
                    <span className="text-xs">{getFilenameFromPath(row.original.inputPath)}</span>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-xs break-words"><p className="text-xs">{row.original.inputPath}</p></TooltipContent>
            </Tooltip></TooltipProvider>
        ),
        size: 200,
    },
    {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        size: 100,
    },
    {
        accessorKey: 'progress',
        header: 'Progress',
        cell: ({ row }) => {
            if (row.original.status === 'processing' || row.original.status === 'completed') {
                return (
                    <div className="flex items-center w-full max-w-[120px]">
                        <Progress value={row.original.progress} className="w-16 h-1.5 mr-1.5 flex-shrink-0" />
                        <span className="text-xs whitespace-nowrap">{row.original.progress.toFixed(0)}%</span>
                    </div>
                );
            }
            if (row.original.status === 'queued' && row.original.priority > 0) {
                 return <Badge variant="outline" className="text-xs">Priority {row.original.priority}</Badge>;
            }
            return <span className="text-xs">-</span>;
        },
        size: 120,
    },
    {
        accessorFn: (row) => row.preset?.name, // Use accessorFn for potentially undefined nested prop
        id: 'presetName',
        header: 'Preset',
        cell: info => <span className="text-xs">{info.getValue<string>() || 'Custom'}</span>,
        size: 100,
    },
    {
        accessorKey: 'addedAt',
        header: 'Queued',
        cell: ({ row }) => <span className="text-xs">{new Date(row.original.addedAt).toLocaleDateString()} {new Date(row.original.addedAt).toLocaleTimeString()}</span>,
        size: 130,
    },
    {
        id: 'actions',
        header: () => <div className="text-right">Log</div>,
        cell: ({ row }) => {
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
            const job = row.original;
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'processing' || job.status === 'verifying') {
                return (
                    <div className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsLogDialogOpen(true)}>
                            <FileText className="h-3.5 w-3.5" />
                        </Button>
                        {isLogDialogOpen && (
                            <JobLogDialog job={job} isOpen={isLogDialogOpen} onClose={() => setIsLogDialogOpen(false)} />
                        )}
                    </div>
                );
            }
            return <div className="text-right"><span className="text-xs">-</span></div>;
        },
        size: 50,
    }
];

const Queue: React.FC = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshTimestamp, setRefreshTimestamp] = useState(Date.now());
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');

  // Define callbacks with useCallback to ensure stable identity
  const onJobProgressCallback = useCallback((_job: EncodingJob) => {
    // console.log("Queue.tsx: onJobProgress callback triggered, setting refresh timestamp");
    setRefreshTimestamp(Date.now());
  }, []); // setRefreshTimestamp is stable, so empty dependency array is fine

  const onHistoryClearedCallback = useCallback(() => {
    // console.log("Queue.tsx: onHistoryCleared callback triggered, setting refresh timestamp");
    setRefreshTimestamp(Date.now());
  }, []); // setRefreshTimestamp is stable

  // Memoize the callbacks object to pass to useQueue
  const queueEventCallbacks = useMemo(() => ({
    onJobProgress: onJobProgressCallback,
    onHistoryCleared: onHistoryClearedCallback,
  }), [onJobProgressCallback, onHistoryClearedCallback]);

  // Use the useQueue hook with memoized callbacks
  const {
    jobs: allJobs,
    isProcessing,
    queueConfig,
    startQueue,
    pauseQueue,
    updateQueueConfig,
    getJobCounts,
    clearJobHistory,
    removeFromQueue
  } = useQueue(queueEventCallbacks);
  
  // Stats from useQueue hook or calculated from allJobs
  const counts = getJobCounts();
  const processingCount = counts.processing;
  const queuedCount = counts.queued;
  const completedCount = counts.completed;
  const failedCount = counts.failed; // This now includes historical failed/cancelled until cleared

  // Filter jobs based on selected status from ALL jobs (including history)
  const filteredJobs = statusFilter === 'all' 
    ? allJobs 
    : allJobs.filter(job => 
        statusFilter === 'failed' 
          ? job.status === 'failed' || job.status === 'cancelled'
          : job.status === statusFilter
      );

  // Sort the filtered jobs: active first, then historical by time
  const statusOrder: JobStatus[] = ['processing', 'verifying', 'queued', 'completed', 'failed', 'cancelled'];
  const sortedAndFilteredJobs = [...filteredJobs].sort((a, b) => {
    const statusIndexA = statusOrder.indexOf(a.status);
    const statusIndexB = statusOrder.indexOf(b.status);

    if (statusIndexA !== statusIndexB) {
        return statusIndexA - statusIndexB;
    }

    if (a.status === 'queued' || a.status === 'processing' || a.status === 'verifying') {
        return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime(); // Oldest active first
    } else { 
        const timeA = a.processingEndTime ? new Date(a.processingEndTime).getTime() : new Date(a.addedAt).getTime();
        const timeB = b.processingEndTime ? new Date(b.processingEndTime).getTime() : new Date(a.addedAt).getTime();
        return timeB - timeA; // Newest historical jobs first
    }
  });
  
  // Periodic refresh for progress updates - This might be simplified if useQueue handles all updates reliably
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (processingCount > 0) { // Only actively poll if jobs are processing
        // console.log(`Queue: Polling for updates (${processingCount} jobs processing)`);
        // useQueue handles job updates from the service, this is more of a failsafe UI refresh
        // The `allJobs` state is managed by the useQueue hook based on service events.
        // This polling `useEffect` primarily serves to force re-renders if local component state
        // needs to react to time-based changes not directly tied to job data updates (e.g. relative time displays)
        // or as a redundant check if there are concerns about useQueue updates not always triggering UI refresh.
        setRefreshTimestamp(Date.now()); 
      }
    }, 1000); // Check for updates (e.g. every second for active jobs)
    
    return () => clearInterval(refreshInterval);
  }, [processingCount]);
  
  // Subscribe to queue events - Handled by useQueue hook
  // useEffect(() => { ... subscriber logic removed ... }, []);
  
  const handleMaxJobsChange = (value: number) => {
    updateQueueConfig({ maxParallelJobs: value });
  };
  
  // Start and Pause queue are directly from useQueue hook
  // const startQueue = () => { ... };
  // const pauseQueue = () => { ... };
  
  const handleClearHistory = () => {
    clearJobHistory(); // Use the function from the hook
  };
  
  // Split jobs for card and table display
  const LATEST_CARD_COUNT = 3;
  const latestJobsForCards = sortedAndFilteredJobs.slice(0, LATEST_CARD_COUNT);
  const olderJobsForTable = sortedAndFilteredJobs.slice(LATEST_CARD_COUNT);

  // TanStack Table setup for older jobs
  const [sorting, setSorting] = useState<SortingState>([]);
  const tableInstance = useReactTable({
    data: olderJobsForTable,
    columns: jobTableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  
  return (
    // Remove fixed height constraints, let it flow naturally with the app's layout
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Encoding Queue</h1>
          <p className="text-muted-foreground">
            Manage and monitor encoding jobs
            {statusFilter !== 'all' && (
              <span className="ml-2 text-indigo-400">
                • Filtered by: <span className="capitalize">{statusFilter}</span>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="ml-1 p-0 h-auto text-indigo-400" 
                  onClick={() => setStatusFilter('all')}
                >
                  (Clear)
                </Button>
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Queue Settings</DialogTitle>
              </DialogHeader>
              {queueConfig && (
                <QueueSettings 
                  maxJobs={queueConfig.maxParallelJobs} 
                  onMaxJobsChange={handleMaxJobsChange} 
                />
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Close</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Button 
            onClick={isProcessing ? pauseQueue : startQueue}
            variant={isProcessing ? "outline" : "default"}
          >
            {isProcessing ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause Queue
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Queue
              </>
            )}
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { title: 'Processing', count: processingCount, Icon: PlayCircle, filter: 'processing' as JobStatus, color: 'text-indigo-500' },
          { title: 'Queued', count: queuedCount, Icon: Clock, filter: 'queued' as JobStatus, color: 'text-slate-400' },
          { title: 'Completed', count: completedCount, Icon: CheckCircle, filter: 'completed' as JobStatus, color: 'text-green-500' },
          { title: 'Failed', count: failedCount, Icon: AlertCircle, filter: 'failed' as JobStatus, color: 'text-red-500' },
        ].map(stat => (
            <Card key={stat.title}
              className={`cursor-pointer transition-colors ${statusFilter === stat.filter ? 'border-indigo-500 bg-indigo-900 bg-opacity-10' : ''}`}
              onClick={() => setStatusFilter(statusFilter === stat.filter ? 'all' : stat.filter)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div><p className="text-sm font-medium text-muted-foreground">{stat.title}</p><p className="text-2xl font-bold">{stat.count}</p></div>
                <stat.Icon className={`h-8 w-8 ${stat.color}`} />
              </CardContent>
            </Card>
        ))}
      </div>
      
      {(completedCount > 0 || failedCount > 0) && (
        <div className="flex justify-end mb-4">
          <Button variant="outline" onClick={handleClearHistory}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Completed & Failed
          </Button>
        </div>
      )}
      
      {sortedAndFilteredJobs.length === 0 ? (
        <Card className="p-8 text-center">
          <CardContent>
            <div className="flex flex-col items-center justify-center space-y-3">
              {statusFilter !== 'all' ? (
                <>
                  <div className="mb-2">
                    <StatusIcon status={statusFilter as JobStatus} />
                  </div>
                  <p className="text-lg font-medium">No {statusFilter} Jobs</p>
                  <p className="text-sm text-muted-foreground">
                    {statusFilter === 'processing' && "No jobs are currently processing."}
                    {statusFilter === 'queued' && "No jobs are currently in the queue."}
                    {statusFilter === 'completed' && "No jobs have been completed yet."}
                    {statusFilter === 'failed' && "No jobs have failed."}
                    <Button 
                      variant="link" 
                      className="ml-1 p-0 h-auto"
                      onClick={() => setStatusFilter('all')}
                    >
                      Show all jobs
                    </Button>
                  </p>
                </>
              ) : (
                <>
                  <Clock className="h-8 w-8 text-muted-foreground" />
                  <p className="text-lg font-medium">No Encoding Jobs</p>
                  <p className="text-sm text-muted-foreground">
                    Add files to the queue from the Media or Encoding pages.
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Latest Jobs as Cards */}
          {latestJobsForCards.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">Active & Recent</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {latestJobsForCards.map(job => (
                  <JobDetails key={job.id} job={job} onRemove={removeFromQueue} />
                ))}
              </div>
            </div>
          )}

          {/* Older Jobs in Table - no constraints */}
          {olderJobsForTable.length > 0 && (
            <div className="mb-4">
              <h2 className="text-xl font-semibold mb-3">Job History</h2>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    {tableInstance.getHeaderGroups().map(headerGroup => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <TableHead key={header.id} style={{ width: header.getSize() }}
                            onClick={header.column.getToggleSortingHandler()}
                            className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? null}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {tableInstance.getRowModel().rows.map(row => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map(cell => (
                          <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Queue; 