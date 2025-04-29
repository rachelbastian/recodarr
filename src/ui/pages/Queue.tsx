import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Check, X, Play, Pause, Plus, Trash, FileText } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";

// Get the electron API from the window object
const electron = (window as any).electron;

interface QueueItem {
  id: string;
  inputPath: string;
  outputPath: string;
  presetId?: string;
  presetName?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  fileSize?: number;
  resultSize?: number;
  encodingOptions?: any; // This will store the preset options
  jobId?: string; // To track ffmpeg encoding job
}

interface Preset {
  id: string;
  name: string;
  options: any; // The encoding options from the preset
}

interface EncodeSettings {
  maxConcurrentJobs: number;
  overwriteInput: boolean;
  autoStart: boolean;
  outputDirectory?: string;
}

interface EncodingProgressUpdate {
  percent?: number;
  status?: string;
  fps?: number;
  frame?: number;
  totalFrames?: number;
  jobId?: string; // To match with our queue item
}

interface FileDialogOptions {
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>;
  filters?: Array<{ name: string; extensions: string[] }>;
}

interface FileDialogResult {
  canceled: boolean;
  filePaths: string[];
}

// Helper function to get basename from a path string (browser-safe)
const getBasename = (filePath: string): string => {
  if (!filePath) return '';
  // Replace backslashes with forward slashes for consistency
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  return parts[parts.length - 1];
};

const Queue: React.FC = () => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [settings, setSettings] = useState<EncodeSettings>({
    maxConcurrentJobs: 1,
    overwriteInput: false,
    autoStart: true,
    outputDirectory: undefined,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [presets, setPresets] = useState<Preset[]>([]);

  // Load saved queue and settings from electron store
  useEffect(() => {
    const loadQueueData = async () => {
      try {
        // Load saved queue data from the electron store
        if (electron && electron.loadQueueData) {
          const queueData = await electron.loadQueueData();
          if (queueData.queue) setQueue(queueData.queue);
          if (queueData.settings) setSettings(queueData.settings);
        }

        // Load presets from the electron store
        if (electron && electron.getPresets) {
          const loadedPresets = await electron.getPresets();
          setPresets(loadedPresets || []);
        } else {
          // Fallback mock data
          setPresets([
            { id: 'preset1', name: 'HD 1080p', options: {} },
            { id: 'preset2', name: '4K SDR', options: {} },
            { id: 'preset3', name: 'Animation', options: {} },
          ]);
        }
      } catch (error) {
        console.error('Failed to load queue data:', error);
      }
    };

    loadQueueData();

    // Set up event listener for encoding progress
    if (electron && electron.onEncodingProgress) {
      const progressHandler = (event: any, progress: EncodingProgressUpdate) => {
        if (progress.jobId) {
          setQueue(prev => prev.map(item => 
            item.jobId === progress.jobId 
              ? { 
                  ...item, 
                  progress: progress.percent !== undefined ? Math.floor(progress.percent) : item.progress 
                } 
              : item
          ));
        }
      };

      // Add the event listener
      electron.onEncodingProgress(progressHandler);

      // Remove event listener on cleanup
      return () => {
        if (electron && electron.removeEncodingProgressListener) {
          electron.removeEncodingProgressListener(progressHandler);
        }
      };
    }
  }, []);

  // Save queue data when it changes
  useEffect(() => {
    const saveQueueData = async () => {
      try {
        // Save queue data to the electron store
        if (electron && electron.saveQueueData) {
          await electron.saveQueueData({ queue, settings });
        }
      } catch (error) {
        console.error('Failed to save queue data:', error);
      }
    };

    saveQueueData();
  }, [queue, settings]);

  // Process the queue
  useEffect(() => {
    if (!isProcessing) return;

    const processQueue = async () => {
      // Count how many items are currently processing
      const processingItems = queue.filter(item => item.status === 'processing');
      if (processingItems.length >= settings.maxConcurrentJobs) return;

      // Find the next item to process
      const nextItem = queue.find(item => item.status === 'queued');
      if (!nextItem) {
        // No more items to process, check if queue is finished
        if (processingItems.length === 0) {
          setIsProcessing(false);
        }
        return;
      }

      // Generate a unique job ID for this encoding task
      const jobId = Date.now().toString() + Math.random().toString(36).substring(2);

      // Start processing this item
      setQueue(prev => prev.map(item => 
        item.id === nextItem.id 
          ? { ...item, status: 'processing', startTime: new Date(), progress: 0, jobId } 
          : item
      ));

      try {
        // Get the encoding options from the preset or use defaults
        let encodingOptions = nextItem.encodingOptions;
        if (!encodingOptions && nextItem.presetId) {
          const preset = presets.find(p => p.id === nextItem.presetId);
          encodingOptions = preset ? preset.options : {};
        }

        // Call the electron API to start encoding
        if (electron && electron.startEncoding) {
          // Prepare encoding options with input and output paths
          const options = {
            ...encodingOptions,
            inputPath: nextItem.inputPath,
            outputPath: nextItem.outputPath,
            overwriteInput: settings.overwriteInput,
            jobId, // Include the job ID for progress tracking
          };

          // Start the encoding process
          const result = await electron.startEncoding(options);

          if (result.success) {
            // Update the queue item with the result
            setQueue(prev => prev.map(item => 
              item.id === nextItem.id 
                ? { 
                    ...item, 
                    status: 'completed', 
                    progress: 100, 
                    endTime: new Date(),
                    resultSize: result.finalSizeMB,
                  } 
                : item
            ));
          } else {
            // Update the queue item with the error
            setQueue(prev => prev.map(item => 
              item.id === nextItem.id 
                ? { 
                    ...item, 
                    status: 'failed', 
                    error: result.error,
                    endTime: new Date(),
                  } 
                : item
            ));
          }
        } else {
          // Mock encoding for development
          console.log('No electron API available, using mock encoding');
          
          // Simulate encoding progress updates
          let progress = 0;
          const interval = setInterval(() => {
            progress += Math.random() * 5;
            if (progress >= 100) {
              progress = 100;
              clearInterval(interval);
              
              // Mark as completed
              setQueue(prev => prev.map(item => 
                item.id === nextItem.id 
                  ? { 
                      ...item, 
                      status: 'completed', 
                      progress: 100, 
                      endTime: new Date(),
                      resultSize: Math.floor(item.fileSize ? item.fileSize * 0.7 : 0) // Mock 30% reduction
                    } 
                  : item
              ));
            } else {
              // Update progress
              setQueue(prev => prev.map(item => 
                item.id === nextItem.id 
                  ? { ...item, progress: Math.floor(progress) } 
                  : item
              ));
            }
          }, 200);
          
          // Return a cleanup function
          return () => clearInterval(interval);
        }
      } catch (error) {
        console.error(`Error encoding file: ${nextItem.inputPath}`, error);
        setQueue(prev => prev.map(item => 
          item.id === nextItem.id 
            ? { ...item, status: 'failed', error: String(error), endTime: new Date() } 
            : item
        ));
      }
    };

    processQueue();
  }, [queue, isProcessing, settings.maxConcurrentJobs, presets]);

  const addToQueue = async () => {
    if (!selectedFiles.length || !selectedPreset) return;
    
    // Find the selected preset
    const preset = presets.find(p => p.id === selectedPreset);
    if (!preset) return;
    
    const newItems: QueueItem[] = await Promise.all(selectedFiles.map(async (filePath) => {
      // Generate output path based on settings
      let outputPath = filePath; // Keep full path for backend
      if (settings.outputDirectory) {
        // Backend will handle joining path.basename(filePath) if needed
        // For now, just pass the full path and let the backend figure it out
        // or adjust backend logic if necessary
        // This example assumes backend will determine filename from inputPath if needed
        outputPath = settings.outputDirectory; // Pass directory, backend joins
      }
      
      // Get file size if electron API is available
      let fileSize: number | undefined = undefined;
      try {
        if (electron && electron.getFileSize) { // Check if function exists
          fileSize = await electron.getFileSize(filePath);
        } else {
          console.warn('Electron API for getFileSize not available, mocking size.');
          // Mock file size for development
          fileSize = Math.floor(Math.random() * 2000) + 500;
        }
      } catch (error) {
        console.error('Failed to get file size:', error);
      }
      
      return {
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        inputPath: filePath,
        outputPath, // This might just be the directory or the original path
        presetId: selectedPreset,
        presetName: preset.name,
        status: 'queued',
        progress: 0,
        fileSize,
        encodingOptions: preset.options,
      };
    }));
    
    setQueue(prev => [...prev, ...newItems]);
    setSelectedFiles([]);
    
    // If autoStart is enabled and we're not already processing, start processing
    if (settings.autoStart && !isProcessing) {
      setIsProcessing(true);
    }
  };

  const selectFiles = async () => {
    try {
      // Check if electron API and showOpenDialog function exist
      if (electron && typeof electron.showOpenDialog === 'function') {
        const options: FileDialogOptions = {
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm'] }
          ]
        };
        
        const result: FileDialogResult = await electron.showOpenDialog(options);
        if (!result.canceled && result.filePaths.length > 0) {
          setSelectedFiles(result.filePaths);
        }
      } else {
        console.error('Electron API showOpenDialog function is not available.');
        // Mock file selection for development if API is not available
        const mockSelectedFiles = [
          'C:\Users\Movies\movie1.mkv',
          'C:\Users\Movies\movie2.mp4'
        ];
        setSelectedFiles(mockSelectedFiles);
      }
    } catch (error) {
      console.error('Failed to select files:', error);
    }
  };

  const selectOutputDirectory = async () => {
    try {
      // Check if electron API and showOpenDialog function exist
      if (electron && typeof electron.showOpenDialog === 'function') {
        const options: FileDialogOptions = {
          properties: ['openDirectory']
        };
        
        const result: FileDialogResult = await electron.showOpenDialog(options);
        if (!result.canceled && result.filePaths.length > 0) {
          setSettings(prev => ({ ...prev, outputDirectory: result.filePaths[0] }));
        }
      } else {
        console.error('Electron API showOpenDialog function is not available.');
        // Mock directory selection for development if API is not available
        const mockSelectedDir = 'C:\Users\Movies\Encoded';
        setSettings(prev => ({ ...prev, outputDirectory: mockSelectedDir }));
      }
    } catch (error) {
      console.error('Failed to select output directory:', error);
    }
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const clearQueue = () => {
    // Only clear items that aren't currently processing
    setQueue(prev => prev.filter(item => item.status === 'processing'));
  };

  const clearCompleted = () => {
    setQueue(prev => prev.filter(item => item.status !== 'completed'));
  };

  const startQueue = () => {
    setIsProcessing(true);
  };

  const pauseQueue = () => {
    setIsProcessing(false);
  };

  const viewLog = async (jobId?: string) => {
    if (!jobId) return;
    
    try {
      // Check if electron API and openEncodingLog function exist
      if (electron && typeof electron.openEncodingLog === 'function') {
        await electron.openEncodingLog(jobId);
      } else {
        console.error('Electron API openEncodingLog function is not available.');
        console.log('Mock: Opening log file for job', jobId);
      }
    } catch (error) {
      console.error('Failed to open log file:', error);
    }
  };

  // Helper to format file size
  const formatFileSize = (sizeInMB?: number) => {
    if (sizeInMB === undefined) return 'Unknown';
    if (sizeInMB < 1000) return `${sizeInMB.toFixed(2)} MB`;
    return `${(sizeInMB / 1024).toFixed(2)} GB`;
  };

  // Calculate queue statistics
  const queueStats = {
    total: queue.length,
    queued: queue.filter(item => item.status === 'queued').length,
    processing: queue.filter(item => item.status === 'processing').length,
    completed: queue.filter(item => item.status === 'completed').length,
    failed: queue.filter(item => item.status === 'failed').length,
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Encoding Queue</h1>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={clearCompleted}
            disabled={queueStats.completed === 0}
          >
            Clear Completed
          </Button>
          <Button 
            variant="outline" 
            onClick={clearQueue}
            disabled={queueStats.queued === 0}
          >
            Clear Queue
          </Button>
          {isProcessing ? (
            <Button 
              variant="outline" 
              onClick={pauseQueue}
              className="flex items-center gap-2"
            >
              <Pause className="h-4 w-4" /> Pause
            </Button>
          ) : (
            <Button 
              variant="default" 
              onClick={startQueue}
              className="flex items-center gap-2"
              disabled={queueStats.queued === 0}
            >
              <Play className="h-4 w-4" /> Start
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Queue statistics */}
        <Card className="lg:col-span-5">
          <CardHeader className="py-4">
            <CardTitle>Queue Statistics</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Badge variant="outline" className="text-sm py-2 px-4">
              Total: {queueStats.total}
            </Badge>
            <Badge variant="outline" className="text-sm py-2 px-4 bg-blue-500/10 text-blue-500">
              Queued: {queueStats.queued}
            </Badge>
            <Badge variant="outline" className="text-sm py-2 px-4 bg-yellow-500/10 text-yellow-500">
              Processing: {queueStats.processing}
            </Badge>
            <Badge variant="outline" className="text-sm py-2 px-4 bg-green-500/10 text-green-500">
              Completed: {queueStats.completed}
            </Badge>
            <Badge variant="outline" className="text-sm py-2 px-4 bg-red-500/10 text-red-500">
              Failed: {queueStats.failed}
            </Badge>
          </CardContent>
        </Card>

        {/* Queue settings */}
        <Card className="lg:col-span-2">
          <CardHeader className="py-4">
            <CardTitle>Queue Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="maxJobs">Maximum Concurrent Jobs</Label>
              <Select 
                value={settings.maxConcurrentJobs.toString()} 
                onValueChange={(value) => setSettings(prev => ({ ...prev, maxConcurrentJobs: parseInt(value) }))}
              >
                <SelectTrigger id="maxJobs">
                  <SelectValue placeholder="Select max concurrent jobs" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map(num => (
                    <SelectItem key={num} value={num.toString()}>
                      {num}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="outputDir">Output Directory</Label>
              <div className="flex gap-2">
                <Input 
                  id="outputDir" 
                  value={settings.outputDirectory || ''} 
                  placeholder="Same as input" 
                  readOnly 
                  className="flex-1"
                />
                <Button onClick={selectOutputDirectory} variant="outline">
                  Browse
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="autoStart">Auto-start queue when adding files</Label>
              <Switch 
                id="autoStart"
                checked={settings.autoStart}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoStart: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="overwriteInput">Overwrite input files when complete</Label>
              <Switch 
                id="overwriteInput"
                checked={settings.overwriteInput}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, overwriteInput: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Add to queue */}
        <Card className="lg:col-span-3">
          <CardHeader className="py-4">
            <CardTitle>Add Files to Queue</CardTitle>
            <CardDescription>
              Select files and an encoding preset to add to the queue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="files">Input Files</Label>
              <div className="flex gap-2">
                <Input 
                  id="files" 
                  value={`${selectedFiles.length} file(s) selected`} 
                  readOnly 
                  className="flex-1"
                />
                <Button onClick={selectFiles} variant="outline">
                  Browse
                </Button>
              </div>
              {selectedFiles.length > 0 && (
                <div className="text-sm text-muted-foreground mt-1">
                  {selectedFiles.map(file => getBasename(file)).join(', ')}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="preset">Encoding Preset</Label>
              <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                <SelectTrigger id="preset">
                  <SelectValue placeholder="Select a preset" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map(preset => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={addToQueue} 
              disabled={selectedFiles.length === 0 || !selectedPreset}
              className="w-full mt-4"
            >
              <Plus className="h-4 w-4 mr-2" /> Add to Queue
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Queue items table */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle>Queue Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Preset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Queue is empty. Add files to start encoding.
                    </TableCell>
                  </TableRow>
                ) : (
                  queue.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {getBasename(item.inputPath)}
                      </TableCell>
                      <TableCell>{item.presetName || 'Default'}</TableCell>
                      <TableCell>
                        {item.status === 'queued' && <Badge variant="outline" className="bg-blue-500/10 text-blue-500">Queued</Badge>}
                        {item.status === 'processing' && (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> Processing
                          </Badge>
                        )}
                        {item.status === 'completed' && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-500 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Completed
                          </Badge>
                        )}
                        {item.status === 'failed' && (
                          <Badge variant="outline" className="bg-red-500/10 text-red-500 flex items-center gap-1">
                            <X className="h-3 w-3" /> Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Progress value={item.progress} className="h-2" />
                          <span className="text-xs text-muted-foreground">{item.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.status === 'completed' && item.fileSize && item.resultSize ? (
                          <div className="text-sm">
                            <div>{formatFileSize(item.fileSize)} → {formatFileSize(item.resultSize)}</div>
                            <div className="text-xs text-green-500">
                              {Math.round((1 - (item.resultSize / item.fileSize)) * 100)}% reduction
                            </div>
                          </div>
                        ) : (
                          <div>{formatFileSize(item.fileSize)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {item.status === 'failed' && item.jobId && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="View Log"
                              onClick={() => viewLog(item.jobId)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                          {(item.status === 'queued' || item.status === 'failed' || item.status === 'completed') && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => removeFromQueue(item.id)} 
                              title="Remove"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default Queue; 