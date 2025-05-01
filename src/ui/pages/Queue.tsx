import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Play, Pause, Trash2, FileX, SkipForward, Settings, AlertCircle, CheckCircle, PlayCircle, Clock } from 'lucide-react';
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
import queueService from "../../services/queueService";

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

// Job details component
const JobDetails: React.FC<{ job: EncodingJob }> = ({ job }) => {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-md font-medium">
            {job.inputPath.split('/').pop() || job.inputPath}
          </CardTitle>
          <StatusBadge status={job.status} />
        </div>
        <CardDescription>
          ID: {job.id}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-sm font-medium">Input Path</div>
              <div className="text-sm text-muted-foreground truncate max-w-[280px]">{job.inputPath}</div>
            </div>
            <div>
              <div className="text-sm font-medium">Output Path</div>
              <div className="text-sm text-muted-foreground truncate max-w-[280px]">{job.outputPath}</div>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Preset</div>
            <div className="text-sm text-muted-foreground">{job.preset?.name || 'Custom Settings'}</div>
          </div>
          <div>
            <div className="text-sm font-medium">Progress</div>
            <div className="flex items-center gap-2">
              <Progress value={job.progress} className="flex-1" />
              <span className="text-sm">{job.progress.toFixed(1)}%</span>
            </div>
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
      {job.status === 'queued' && (
        <CardFooter className="py-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-auto"
            onClick={() => queueService.removeJob(job.id)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Remove
          </Button>
        </CardFooter>
      )}
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

const Queue: React.FC = () => {
  const [jobs, setJobs] = useState<EncodingJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maxParallelJobs, setMaxParallelJobs] = useState(2);
  
  // Stats
  const processingCount = jobs.filter(job => job.status === 'processing').length;
  const queuedCount = jobs.filter(job => job.status === 'queued').length;
  const completedCount = jobs.filter(job => job.status === 'completed').length;
  const failedCount = jobs.filter(job => job.status === 'failed' || job.status === 'cancelled').length;
  
  // Subscribe to queue events
  useEffect(() => {
    // Set up event handling
    queueService.setEventCallbacks({
      onJobAdded: (job) => {
        setJobs(current => [...current, job]);
      },
      onJobStarted: (job) => {
        setJobs(current => current.map(j => j.id === job.id ? job : j));
      },
      onJobProgress: (job) => {
        setJobs(current => current.map(j => j.id === job.id ? job : j));
      },
      onJobCompleted: (job) => {
        setJobs(current => current.map(j => j.id === job.id ? job : j));
      },
      onJobFailed: (job) => {
        setJobs(current => current.map(j => j.id === job.id ? job : j));
      },
      onJobRemoved: (jobId) => {
        setJobs(current => current.filter(j => j.id !== jobId));
      },
      onQueueStarted: () => {
        setIsProcessing(true);
      },
      onQueuePaused: () => {
        setIsProcessing(false);
      }
    });
    
    // Initial load of jobs
    setJobs(queueService.getAllJobs());
    
    // Get current processing state
    const currentConfig = queueService.getConfig?.();
    if (currentConfig) {
      setMaxParallelJobs(currentConfig.maxParallelJobs);
    }
    
    // Cleanup on unmount
    return () => {
      queueService.setEventCallbacks({});
    };
  }, []);
  
  const handleMaxJobsChange = (value: number) => {
    setMaxParallelJobs(value);
    queueService.updateConfig({ maxParallelJobs: value });
  };
  
  const startQueue = () => {
    queueService.startProcessing();
  };
  
  const pauseQueue = () => {
    queueService.pauseProcessing();
  };
  
  const clearCompletedJobs = () => {
    // Filter out completed jobs and remove them
    jobs.forEach(job => {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        queueService.removeJob(job.id);
      }
    });
  };
  
  return (
    <div className="p-6 h-screen overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Encoding Queue</h1>
          <p className="text-muted-foreground">
            Manage and monitor encoding jobs
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
              <QueueSettings 
                maxJobs={maxParallelJobs} 
                onMaxJobsChange={handleMaxJobsChange} 
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Close</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {isProcessing ? (
            <Button onClick={pauseQueue}>
              <Pause className="h-4 w-4 mr-2" />
              Pause Queue
            </Button>
          ) : (
            <Button onClick={startQueue}>
              <Play className="h-4 w-4 mr-2" />
              Start Queue
            </Button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Processing</p>
              <p className="text-2xl font-bold">{processingCount}</p>
            </div>
            <PlayCircle className="h-8 w-8 text-indigo-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Queued</p>
              <p className="text-2xl font-bold">{queuedCount}</p>
            </div>
            <Clock className="h-8 w-8 text-slate-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{completedCount}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold">{failedCount}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-500" />
          </CardContent>
        </Card>
      </div>
      
      {/* Actions bar */}
      {(completedCount > 0 || failedCount > 0) && (
        <div className="flex justify-end mb-4">
          <Button variant="outline" onClick={clearCompletedJobs}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Completed & Failed
          </Button>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.length === 0 ? (
          <Card className="col-span-full p-8 text-center">
            <CardContent>
              <div className="flex flex-col items-center justify-center space-y-3">
                <Clock className="h-8 w-8 text-muted-foreground" />
                <p className="text-lg font-medium">No Encoding Jobs</p>
                <p className="text-sm text-muted-foreground">
                  Add files to the queue from the Media or Encoding pages.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Group by status: processing first, then queued, then others */}
            {jobs
              .filter(job => job.status === 'processing')
              .map(job => (
                <JobDetails key={job.id} job={job} />
              ))}
            
            {jobs
              .filter(job => job.status === 'queued')
              .map(job => (
                <JobDetails key={job.id} job={job} />
              ))}
              
            {jobs
              .filter(job => job.status !== 'processing' && job.status !== 'queued')
              .map(job => (
                <JobDetails key={job.id} job={job} />
              ))}
          </>
        )}
      </div>
    </div>
  );
};

export default Queue; 