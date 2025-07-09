import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Play, CheckCircle, AlertTriangle, Database, Trash2 } from 'lucide-react';
import type { 
    IElectronAPI, 
    EncodingPreset
} from '../../types';
import { loadPresets as loadPresetsUtil, getPresetById, getAudioTrackActions, getSubtitleTrackActions } from '@/utils/presetUtil.js';
import queueService from '../../services/queueService.js';
import { useNavigate } from 'react-router-dom';
import { toast } from "sonner";

// Cast window.electron to the imported type
const electronAPI = window.electron as IElectronAPI;

// Define types for our data
interface MediaItem {
    id: number;
    title: string;
    filePath: string;
    libraryName: string;
    libraryType: 'TV' | 'Movies' | 'Anime';
    originalSize: number;
    currentSize: number;
    videoCodec: string | null;
    audioCodec: string | null;
    resolutionWidth: number | null;
    resolutionHeight: number | null;
    audioChannels: number | null;
}

interface LibraryOption {
    name: string;
    type: 'TV' | 'Movies' | 'Anime';
    fileCount: number;
    unprocessedCount: number;
    totalSize: number;
}

// Helper function to format bytes
const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const AutomaticReduction: React.FC = () => {
    const navigate = useNavigate();

    // Main state
    const [libraries, setLibraries] = useState<LibraryOption[]>([]);
    const [selectedLibrary, setSelectedLibrary] = useState<string>('');
    const [filesToProcess, setFilesToProcess] = useState<number>(10);
    const [maxConcurrentJobs, setMaxConcurrentJobs] = useState<number>(2);
    const [availablePresets, setAvailablePresets] = useState<EncodingPreset[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string>('');
    
    // Preview state
    const [previewFiles, setPreviewFiles] = useState<MediaItem[]>([]);
    const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
    
    // Processing state
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [isLoadingLibraries, setIsLoadingLibraries] = useState<boolean>(false);
    const [status, setStatus] = useState<string>('Ready to start automatic reduction');
    const [processedCount, setProcessedCount] = useState<number>(0);
    const [totalToProcess, setTotalToProcess] = useState<number>(0);

    // Load libraries and presets on mount
    useEffect(() => {
        loadLibraries();
        loadPresets();
    }, []);

    // Load available libraries with stats
    const loadLibraries = useCallback(async () => {
        setIsLoadingLibraries(true);
        try {
            // Query libraries with statistics
            const libraryStats = await electronAPI.dbQuery(`
                SELECT 
                    libraryName,
                    libraryType,
                    COUNT(*) as fileCount,
                    COUNT(CASE WHEN encodingJobId IS NULL THEN 1 END) as unprocessedCount,
                    SUM(currentSize) as totalSize
                FROM media 
                WHERE libraryName IS NOT NULL 
                GROUP BY libraryName, libraryType
                ORDER BY libraryName
            `);
            
            const libraryOptions: LibraryOption[] = libraryStats.map((lib: any) => ({
                name: lib.libraryName,
                type: lib.libraryType,
                fileCount: lib.fileCount || 0,
                unprocessedCount: lib.unprocessedCount || 0,
                totalSize: lib.totalSize || 0
            }));
            
            setLibraries(libraryOptions);
            
            // Auto-select first library with unprocessed files
            const firstWithUnprocessed = libraryOptions.find(lib => lib.unprocessedCount > 0);
            if (firstWithUnprocessed) {
                setSelectedLibrary(firstWithUnprocessed.name);
            }
        } catch (error) {
            console.error("Error loading libraries:", error);
            toast.error("Failed to load libraries", {
                description: error instanceof Error ? error.message : String(error)
            });
        } finally {
            setIsLoadingLibraries(false);
        }
    }, []);

    // Load presets
    const loadPresets = useCallback(async () => {
        try {
            const presets = await loadPresetsUtil(electronAPI);
            setAvailablePresets(presets);
            
            // Auto-select first preset
            if (presets.length > 0) {
                setSelectedPresetId(presets[0].id);
            }
        } catch (error) {
            console.error("Error loading presets:", error);
            toast.error("Failed to load presets", {
                description: error instanceof Error ? error.message : String(error)
            });
        }
    }, []);

    // Load preview of files that would be processed
    const loadPreview = useCallback(async () => {
        if (!selectedLibrary || filesToProcess <= 0) {
            setPreviewFiles([]);
            return;
        }
        
        setIsLoadingPreview(true);
        try {
            // Query largest unprocessed files in the selected library
            const files = await electronAPI.dbQuery(`
                SELECT 
                    id, title, filePath, libraryName, libraryType,
                    originalSize, currentSize, videoCodec, audioCodec,
                    resolutionWidth, resolutionHeight, audioChannels
                FROM media 
                WHERE libraryName = ? 
                  AND encodingJobId IS NULL
                ORDER BY currentSize DESC 
                LIMIT ?
            `, [selectedLibrary, filesToProcess]);
            
            setPreviewFiles(files as MediaItem[]);
        } catch (error) {
            console.error("Error loading preview:", error);
            toast.error("Failed to load file preview", {
                description: error instanceof Error ? error.message : String(error)
            });
        } finally {
            setIsLoadingPreview(false);
        }
    }, [selectedLibrary, filesToProcess]);

    // Load preview when parameters change
    useEffect(() => {
        loadPreview();
    }, [loadPreview]);

    // Start automatic processing
    const startProcessing = useCallback(async () => {
        if (!selectedLibrary || !selectedPresetId || previewFiles.length === 0) {
            toast.error("Missing required selections", {
                description: "Please select a library, preset, and ensure there are files to process"
            });
            return;
        }

        setIsProcessing(true);
        setProcessedCount(0);
        setTotalToProcess(previewFiles.length);
        setStatus(`Starting automatic reduction of ${previewFiles.length} files...`);

        try {
            const preset = getPresetById(availablePresets, selectedPresetId);
            if (!preset) {
                throw new Error("Selected preset not found");
            }

            let addedCount = 0;
            let errorCount = 0;

            // Update queue config to limit concurrent jobs
            queueService.updateConfig({ maxParallelJobs: maxConcurrentJobs });

            // Process each file
            for (const mediaItem of previewFiles) {
                try {
                    setStatus(`Processing file ${addedCount + 1}/${previewFiles.length}: ${mediaItem.title}`);
                    
                    // Probe the file for encoding options
                    const probeData = await electronAPI.probeFile(mediaItem.filePath);
                    if (!probeData) {
                        console.warn(`Failed to probe file: ${mediaItem.filePath}`);
                        errorCount++;
                        continue;
                    }

                    // Get track selections based on preset
                    const audioTrackSelections = getAudioTrackActions(probeData.streams, preset);
                    const subtitleTrackSelections = getSubtitleTrackActions(probeData.streams, preset);

                    // Create output path (temp file for overwrite)
                    const pathSeparator = window.navigator.platform.indexOf('Win') > -1 ? '\\' : '/';
                    const fileDir = mediaItem.filePath.split(/[/\\]/).slice(0, -1).join(pathSeparator);
                    const fileName = mediaItem.filePath.split(/[/\\]/).pop() || '';
                    const fileNameWithoutExt = fileName.split('.').slice(0, -1).join('.');
                    const fileExt = fileName.split('.').pop() || '';
                    const outputPath = `${fileDir}${pathSeparator}${fileNameWithoutExt}_tmp.${fileExt}`;

                    // Add job to queue with medium priority
                    const job = queueService.addJob(
                        mediaItem.filePath,
                        outputPath,
                        true, // overwriteInput = true for size reduction
                        preset,
                        probeData,
                        {
                            audio: audioTrackSelections,
                            subtitle: subtitleTrackSelections
                        },
                        50 // Medium priority
                    );

                    // Update media record with job ID for tracking
                    await electronAPI.dbQuery(
                        'UPDATE media SET encodingJobId = ? WHERE id = ?',
                        [job.id, mediaItem.id]
                    );

                    addedCount++;
                    setProcessedCount(addedCount);

                } catch (fileError) {
                    console.error(`Error processing file ${mediaItem.filePath}:`, fileError);
                    errorCount++;
                }
            }

            // Start queue processing
            queueService.startProcessing();
            queueService.forceProcessQueue();

            const successMessage = `Added ${addedCount} files to the queue. ${errorCount > 0 ? `${errorCount} files failed to process.` : ''}`;
            setStatus(successMessage);
            
            toast.success("Automatic reduction started", {
                description: successMessage,
                action: {
                    label: "View Queue",
                    onClick: () => navigate("/queue")
                }
            });

            // Refresh libraries and preview after processing
            setTimeout(() => {
                loadLibraries();
                loadPreview();
            }, 1000);

        } catch (error) {
            console.error("Error starting automatic processing:", error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            setStatus(`Error: ${errorMsg}`);
            toast.error("Failed to start automatic reduction", {
                description: errorMsg
            });
        } finally {
            setIsProcessing(false);
        }
    }, [selectedLibrary, selectedPresetId, previewFiles, availablePresets, maxConcurrentJobs, navigate, loadLibraries, loadPreview]);

    // Clear queue function
    const clearQueue = useCallback(() => {
        try {
            queueService.clearQueue();
            toast.success("Queue cleared", {
                description: "All pending jobs have been removed from the queue"
            });
            
            // Refresh libraries and preview to update unprocessed counts
            setTimeout(() => {
                loadLibraries();
                loadPreview();
            }, 500);
        } catch (error) {
            console.error("Error clearing queue:", error);
            toast.error("Failed to clear queue", {
                description: error instanceof Error ? error.message : String(error)
            });
        }
    }, [loadLibraries, loadPreview]);

    const selectedLibraryInfo = libraries.find(lib => lib.name === selectedLibrary);

    return (
        <div className="container mx-auto p-6 max-w-6xl space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold tracking-tight mb-1">Automatic File Reduction</h1>
                <p className="text-muted-foreground">Automatically process the largest unprocessed files in your library to reduce storage usage</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Configuration Card */}
                <Card className="border-none shadow-sm bg-card/50">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Database className="h-5 w-5" />
                            Configuration
                        </CardTitle>
                        <CardDescription>Select library, files to process, and encoding settings</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Library Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="library-select" className="text-sm font-medium">Library</Label>
                            <Select 
                                value={selectedLibrary} 
                                onValueChange={setSelectedLibrary}
                                disabled={isProcessing || isLoadingLibraries}
                            >
                                <SelectTrigger className="bg-background/50">
                                    <SelectValue placeholder="Select a library..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {libraries.map((library) => (
                                        <SelectItem key={library.name} value={library.name}>
                                            <div className="flex items-center justify-between w-full">
                                                <span>{library.name}</span>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
                                                    <Badge variant="outline">{library.type}</Badge>
                                                    <span>{library.unprocessedCount} unprocessed</span>
                                                </div>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedLibraryInfo && (
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    <span>Total files: {selectedLibraryInfo.fileCount}</span>
                                    <span>•</span>
                                    <span>Unprocessed: {selectedLibraryInfo.unprocessedCount}</span>
                                    <span>•</span>
                                    <span>Total size: {formatBytes(selectedLibraryInfo.totalSize)}</span>
                                </div>
                            )}
                        </div>

                        {/* Number of Files */}
                        <div className="space-y-2">
                            <Label htmlFor="files-count" className="text-sm font-medium">Number of Files to Process</Label>
                            <Input 
                                id="files-count"
                                type="number" 
                                value={filesToProcess} 
                                onChange={e => setFilesToProcess(Math.max(1, parseInt(e.target.value) || 1))}
                                min={1}
                                max={selectedLibraryInfo?.unprocessedCount || 1000}
                                disabled={isProcessing}
                                className="bg-background/50"
                            />
                            <p className="text-xs text-muted-foreground">
                                Will process the largest unprocessed files first
                            </p>
                        </div>

                        {/* Concurrent Jobs */}
                        <div className="space-y-2">
                            <Label htmlFor="concurrent-jobs" className="text-sm font-medium">Max Concurrent Jobs</Label>
                            <Input 
                                id="concurrent-jobs"
                                type="number" 
                                value={maxConcurrentJobs} 
                                onChange={e => setMaxConcurrentJobs(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
                                min={1}
                                max={8}
                                disabled={isProcessing}
                                className="bg-background/50"
                            />
                            <p className="text-xs text-muted-foreground">
                                Number of files to encode simultaneously (1-8)
                            </p>
                        </div>

                        <Separator />

                        {/* Preset Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="preset-select" className="text-sm font-medium">Encoding Preset</Label>
                            <Select 
                                value={selectedPresetId} 
                                onValueChange={setSelectedPresetId}
                                disabled={isProcessing || availablePresets.length === 0}
                            >
                                <SelectTrigger className="bg-background/50">
                                    <SelectValue placeholder="Select a preset..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availablePresets.map((preset) => (
                                        <SelectItem key={preset.id} value={preset.id}>
                                            {preset.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {availablePresets.length === 0 && (
                                <p className="text-xs text-muted-foreground">No presets found. Create presets in the Presets page.</p>
                            )}
                        </div>

                        {/* Start Button */}
                        <div className="pt-4">
                            <Button 
                                onClick={startProcessing} 
                                disabled={!selectedLibrary || !selectedPresetId || previewFiles.length === 0 || isProcessing} 
                                className="w-full bg-primary hover:bg-primary/90"
                                size="lg"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Processing ({processedCount}/{totalToProcess})
                                    </>
                                ) : (
                                    <>
                                        <Play className="mr-2 h-4 w-4" />
                                        Start Automatic Reduction
                                    </>
                                )}
                            </Button>
                            
                            {/* Clear Queue Button */}
                            <Button 
                                onClick={clearQueue}
                                disabled={isProcessing}
                                variant="outline"
                                size="lg"
                                className="w-full mt-3 border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Clear Queue
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Preview Card */}
                <Card className="border-none shadow-sm bg-card/50">
                    <CardHeader>
                        <CardTitle className="text-xl">File Preview</CardTitle>
                        <CardDescription>Files that will be processed (largest first)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingPreview ? (
                            <div className="flex items-center justify-center h-32">
                                <Loader2 className="h-6 w-6 animate-spin" />
                                <span className="ml-2">Loading preview...</span>
                            </div>
                        ) : previewFiles.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-muted-foreground">
                                {selectedLibrary ? 'No unprocessed files found in this library' : 'Select a library to see files'}
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {previewFiles.map((file, index) => (
                                    <div key={file.id} className="p-3 bg-background/50 rounded-md space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium truncate flex-1 mr-2">
                                                {index + 1}. {file.title}
                                            </span>
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                {formatBytes(file.currentSize)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            {file.videoCodec && <Badge variant="outline" className="text-xs">{file.videoCodec}</Badge>}
                                            {file.resolutionWidth && file.resolutionHeight && (
                                                <span>{file.resolutionWidth}x{file.resolutionHeight}</span>
                                            )}
                                            {file.audioCodec && <span>{file.audioCodec}</span>}
                                            {file.audioChannels && <span>{file.audioChannels}ch</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Status Display */}
            <Card className="border-none shadow-sm bg-card/50">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                        {isProcessing ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : processedCount > 0 ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm">{status}</span>
                    </div>
                    
                    {isProcessing && totalToProcess > 0 && (
                        <div className="mt-3">
                            <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                                <div 
                                    className="bg-primary h-2 rounded-full transition-all duration-300" 
                                    style={{ width: `${(processedCount / totalToProcess) * 100}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>{processedCount} of {totalToProcess} files added to queue</span>
                                <span>{Math.round((processedCount / totalToProcess) * 100)}%</span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Information Alert */}
            <Alert className="bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800">
                <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                    <strong>How it works:</strong> This feature automatically selects the largest unprocessed files in your chosen library 
                    and adds them to the encoding queue. Files are processed using the selected preset and will overwrite the original 
                    files to save space. Monitor progress in the Queue page.
                </AlertDescription>
            </Alert>
        </div>
    );
};

export default AutomaticReduction; 