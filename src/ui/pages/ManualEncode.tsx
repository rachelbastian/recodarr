import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Plus, CheckCircle, Folder } from 'lucide-react';
import type { 
    IElectronAPI, 
    ProbeData,
    StreamInfo,
    EncodingPreset
} from '../../types';
import { loadPresets as loadPresetsUtil, getPresetById, getDefaultEncodingOptions, getAudioTrackActions, getSubtitleTrackActions } from '@/utils/presetUtil.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import queueService from '../../services/queueService.js';
import { useNavigate } from 'react-router-dom';
import { toast } from "sonner";

// Cast window.electron to the imported type
const electronAPI = window.electron as IElectronAPI;

// Browser-compatible path helpers
const getFileName = (filePath: string): string => {
    const parts = filePath.split(/[\/\\]/);
    return parts[parts.length - 1];
};

const getFileNameWithoutExt = (filePath: string): string => {
    const fileName = getFileName(filePath);
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
};

const getFileExtension = (filePath: string): string => {
    const fileName = getFileName(filePath);
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : '';
};

const getDirPath = (filePath: string): string => {
    const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return lastSlashIndex !== -1 ? filePath.substring(0, lastSlashIndex) : '';
};

const joinPaths = (dirPath: string, fileName: string): string => {
    // Handle the case where dirPath might end with a slash
    if (dirPath.endsWith('/') || dirPath.endsWith('\\')) {
        return dirPath + fileName;
    }
    // Use forward slash for consistency
    return dirPath + '/' + fileName;
};

// Constants for UI Options - just basic ones
const VIDEO_CODECS = ['hevc_qsv', 'h264_qsv', 'av1_qsv', 'libx265', 'libx264', 'copy'] as const;
type VideoCodec = typeof VIDEO_CODECS[number];
const VIDEO_PRESETS = ['veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'ultrafast'] as const;
type VideoPreset = typeof VIDEO_PRESETS[number];
const VIDEO_RESOLUTIONS = ['original', '480p', '720p', '1080p', '1440p', '2160p'] as const;
type VideoResolution = typeof VIDEO_RESOLUTIONS[number];
const HW_ACCEL_OPTIONS = ['auto', 'qsv', 'nvenc', 'cuda', 'none'] as const;
type HwAccel = typeof HW_ACCEL_OPTIONS[number];
const AUDIO_CODECS_CONVERT = ['libopus', 'aac', 'eac3'] as const;
type AudioCodecConvert = typeof AUDIO_CODECS_CONVERT[number];
const AUDIO_LAYOUT_OPTIONS = ['stereo', 'mono', 'surround5_1'] as const;
type AudioLayout = typeof AUDIO_LAYOUT_OPTIONS[number];
const TRACK_ACTION_OPTIONS = ['convert', 'keep', 'discard'] as const;
type TrackAction = typeof TRACK_ACTION_OPTIONS[number];

// Add TrackOption interface for track selection UI
interface TrackOption {
    index: number;
    description: string;
    type: 'audio' | 'subtitle';
    action: TrackAction;
}

// --- Helper Functions --- 
// Basic stream description function to show useful track info
const getStreamDescription = (stream: StreamInfo): string => {
    let desc = `Track ${stream.index} (${stream.codec_name ?? 'unknown'})`;
    if (stream.tags?.language) {
        desc += ` [${stream.tags.language.toUpperCase()}]`;
    }
    if (stream.tags?.title) {
        desc += ` (${stream.tags.title})`;
    }
    if (stream.codec_type === 'audio') {
        desc += ` - ${stream.channel_layout ?? (stream.channels ? `${stream.channels}ch` : '?ch')}`;
    }
    return desc;
};

// --- Component --- 
const ManualEncode: React.FC = () => {
    // Navigate hook for redirecting to Queue page
    const navigate = useNavigate();

    // Input/Output State
    const [inputPath, setInputPath] = useState<string>('');
    const [outputPath, setOutputPath] = useState<string>('');
    const [saveAsNew, setSaveAsNew] = useState(false);
    
    // Probing State
    const [isProbing, setIsProbing] = useState(false);
    const [probeData, setProbeData] = useState<ProbeData | null>(null);
    const [probeError, setProbeError] = useState<string | null>(null);
    const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
    
    // Preset State
    const [availablePresets, setAvailablePresets] = useState<EncodingPreset[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string>('custom');
    
    // Basic Encoding Param State
    const [videoCodec, setVideoCodec] = useState<VideoCodec>('hevc_qsv');
    const [videoPreset, setVideoPreset] = useState<VideoPreset>('faster');
    const [videoQuality, setVideoQuality] = useState<number>(25);
    const [videoResolution, setVideoResolution] = useState<VideoResolution>('original');
    const [hwAccel, setHwAccel] = useState<HwAccel>('auto');
    const [audioCodecConvert, setAudioCodecConvert] = useState<AudioCodecConvert>('libopus');
    const [audioBitrate, setAudioBitrate] = useState<string>('128k');
    const [selectedAudioLayout, setSelectedAudioLayout] = useState<AudioLayout>('stereo');
    const [audioLanguageOrder, setAudioLanguageOrder] = useState<string[]>(['eng', 'original']);
    
    // Subtitle Settings State
    const [subtitleLanguageOrder, setSubtitleLanguageOrder] = useState<string[]>(['eng']);
    const [subtitleTypeOrder, setSubtitleTypeOrder] = useState<string[]>(['forced', 'normal', 'sdh']);
    const [subtitleCodecConvert, setSubtitleCodecConvert] = useState<string>('srt');
    const [removeAllSubtitles, setRemoveAllSubtitles] = useState<boolean>(false);
    
    // Track Selection State
    const [selectedAudioTracks, setSelectedAudioTracks] = useState<{ [index: number]: TrackAction }>({});
    const [selectedSubtitleTracks, setSelectedSubtitleTracks] = useState<{ [index: number]: TrackAction }>({});
    const [selectedTracks, setSelectedTracks] = useState<TrackOption[]>([]);
    const [trackSelectOpen, setTrackSelectOpen] = useState(false);
    
    // Encoding/Queue State
    const [isEncoding, setIsEncoding] = useState(false);
    const [isAddingToQueue, setIsAddingToQueue] = useState(false);
    const [status, setStatus] = useState<string>('Ready to encode');
    
    // Progress tracking
    const [progress, setProgress] = useState(0);
    const [fps, setFps] = useState<number | null>(null);
    const [currentFrame, setCurrentFrame] = useState<number | null>(null);
    const [totalFrames, setTotalFrames] = useState<number | null>(null);

    // Success feedback
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

    // Form data state
    const [formData, setFormData] = useState({
        selectedFiles: [] as string[]
    });

    // Reset form function 
    const resetForm = useCallback(() => {
        setInputPath('');
        setOutputPath('');
        setSaveAsNew(false);
        setProbeData(null);
        setSelectedAudioTracks({});
        setSelectedSubtitleTracks({});
        setSelectedTracks([]);
        setStatus('Ready to encode');
        setProgress(0);
        setFps(null);
        setCurrentFrame(null);
        setTotalFrames(null);
        setSelectedFolderPath(null);
        setFormData({ selectedFiles: [] });
        
        // Reset encoding settings to defaults
        setVideoCodec('hevc_qsv');
        setVideoPreset('faster');
        setVideoQuality(25);
        setVideoResolution('original');
        setHwAccel('auto');
        setAudioCodecConvert('libopus');
        setAudioBitrate('128k');
        setSelectedAudioLayout('stereo');
        setAudioLanguageOrder(['eng', 'original']);
        setSubtitleLanguageOrder(['eng']);
        setSubtitleTypeOrder(['forced', 'normal', 'sdh']);
        setSubtitleCodecConvert('srt');
        setRemoveAllSubtitles(false);
        setSelectedPresetId('custom');
    }, []);

    // Queue-related functions
    const addToQueue = useCallback(async () => {
        // --- Handle Multiple Files Addition ---
        if (formData.selectedFiles && formData.selectedFiles.length > 0) {
            setIsAddingToQueue(true);
            setStatus(`Processing ${formData.selectedFiles.length} files...`);
            
            try {
                const preset = selectedPresetId !== 'custom' 
                    ? getPresetById(availablePresets, selectedPresetId)
                    : undefined;
                
                let addedCount = 0;
                let errorCount = 0;
                
                // Process each selected file
                for (const filePath of formData.selectedFiles) {
                    try {
                        const fileProbeData = await electronAPI.probeFile(filePath);
                        if (!fileProbeData || !fileProbeData.streams || !fileProbeData.format) {
                            console.warn(`Skipping file due to invalid probe data: ${filePath}`);
                            errorCount++;
                            continue;
                        }
                        
                        // For multiple files, let's provide similar options as single file mode
                        let outputFilePath;
                        let overwriteInput = !saveAsNew; // Use the same saveAsNew toggle for multiple files
                        
                        // Determine the output path based on whether we're overwriting or not
                        if (saveAsNew) {
                            // If saving as new, generate output path with "_encoded" suffix
                            const dirPath = getDirPath(filePath);
                            const ext = getFileExtension(filePath);
                            const basename = getFileNameWithoutExt(filePath);
                            outputFilePath = joinPaths(dirPath, `${basename}_encoded${ext}`);
                        } else {
                            // When overwriting, use a temp path during encoding but set overwriteInput=true
                            const dirPath = getDirPath(filePath);
                            const ext = getFileExtension(filePath);
                            const basename = getFileNameWithoutExt(filePath);
                            // Generate temp path with _tmp suffix
                            outputFilePath = joinPaths(dirPath, `${basename}_tmp${ext}`);
                            console.log(`ManualEncode: Using temp output path for batch overwrite: ${outputFilePath}`);
                        }
                        
                        // Get track selections based on probe and preset
                        const fileAudioDefaults = getAudioTrackActions(fileProbeData.streams, preset);
                        const fileSubtitleDefaults = getSubtitleTrackActions(fileProbeData.streams, preset);
                        const fileTrackSelections = {
                            audio: fileAudioDefaults,
                            subtitle: fileSubtitleDefaults
                        };
                        
                        // Add job to queue - use overwriteInput flag to ensure proper naming
                        const job = queueService.addJob(
                            filePath,
                            outputFilePath,
                            overwriteInput, // Use overwriteInput flag based on saveAsNew setting
                            preset,
                            fileProbeData,
                            fileTrackSelections,
                            0 // Default priority
                        );
                        addedCount++;
                        
                        // Update status incrementally
                        setStatus(`Added ${addedCount}/${formData.selectedFiles.length} files to queue...`);

                        // Check if the file exists in the media database to track it
                        try {
                            const dbResult = await electronAPI.dbQuery(
                                'SELECT id FROM media WHERE filePath = ?',
                                [filePath]
                            );
                            
                            if (dbResult && dbResult.length > 0) {
                                const mediaId = dbResult[0].id;
                                console.log(`ManualEncode: Batch file ${filePath} found in database with ID ${mediaId}, linking job ID ${job.id}`);
                                
                                // Update the media record with just the job ID for now
                                // The final size update will happen when the job completes via queueService's finalize process
                                await electronAPI.dbQuery(
                                    'UPDATE media SET encodingJobId = ? WHERE id = ?',
                                    [job.id, mediaId]
                                );
                            } else {
                                console.log(`ManualEncode: Batch file ${filePath} not found in media database, no record to update`);
                            }
                        } catch (dbError) {
                            console.error(`ManualEncode: Error checking/updating database for ${filePath}:`, dbError);
                            // Non-fatal error, continue processing files
                        }
                        
                    } catch (probeError) {
                        console.error(`Error probing file ${filePath}:`, probeError);
                        errorCount++;
                    }
                }
                
                queueService.startProcessing(); // Ensure queue starts/continues
                queueService.forceProcessQueue();
                
                const successMessage = `Added ${addedCount} files to the queue. ${errorCount > 0 ? `${errorCount} files failed to probe.` : ''}`;
                setSuccessMessage(successMessage);
                setShowSuccess(true);
                setStatus(successMessage);
                
                toast.success("Files added to queue", {
                    description: successMessage,
                    action: {
                        label: "View Queue",
                        onClick: () => navigate("/queue")
                    }
                });
                
                // Reset form after showing success message
                setTimeout(() => {
                    resetForm();
                    setShowSuccess(false);
                }, 2000);
                
            } catch (error) {
                console.error("Error adding files to queue:", error);
                const errorMsg = error instanceof Error ? error.message : String(error);
                setStatus(`Error processing files: ${errorMsg}`);
                toast.error("Failed to process files", {
                    description: errorMsg
                });
            } finally {
                setIsAddingToQueue(false);
            }
            
            return; // Stop here if we processed multiple files
        }
        
        // --- Handle Single File Addition (Original Logic) ---
        if (!inputPath) {
            setStatus("Please select an input file first");
            return;
        }
        
        if (!probeData) {
            setStatus("Please wait for file analysis to complete");
            return;
        }
        
        setIsAddingToQueue(true);
        
        try {
            // Get the selected preset if any
            const preset = selectedPresetId !== 'custom' 
                ? getPresetById(availablePresets, selectedPresetId)
                : undefined;
            
            // Create track selections object for the queue service
            const trackSelections = {
                audio: selectedAudioTracks,
                subtitle: selectedSubtitleTracks
            };
            
            // Determine the output path
            let jobOutputPath = outputPath;
            if (!saveAsNew) {
                // If overwriting, use a temp path during encoding
                const dirPath = getDirPath(inputPath);
                const ext = getFileExtension(inputPath);
                const basename = getFileNameWithoutExt(inputPath);
                // Generate temp path with _tmp suffix for overwrite mode
                jobOutputPath = joinPaths(dirPath, `${basename}_tmp${ext}`);
                console.log(`ManualEncode: Using temp output path for overwrite: ${jobOutputPath}`);
            }
            
            // Add job to queue
            const job = queueService.addJob(
                inputPath,
                jobOutputPath, // Use the temp output path we just created
                !saveAsNew,    // Still set overwriteInput flag correctly for proper finalization
                preset,
                probeData,
                trackSelections,
                0 // Default priority
            );
            
            // Make sure queue is actively processing - use the more robust method
            queueService.startProcessing();
            queueService.forceProcessQueue(); // This addresses any state inconsistencies
            
            // Log success for debugging
            console.log(`ManualEncode: Added job ${job.id} to queue and forced processing`);
            
            // Show success message
            setSuccessMessage(`File "${getFileName(inputPath)}" added to queue`);
            setShowSuccess(true);
            
            // Reset form for next file after 1.5 seconds
            setTimeout(() => {
                resetForm();
                setShowSuccess(false);
            }, 1500);
            
            // Show toast notification
            toast.success("Job added to queue", {
                description: `File "${getFileName(inputPath)}" was added to the encoding queue`,
                action: {
                    label: "View Queue",
                    onClick: () => navigate("/queue")
                }
            });
            
        } catch (error) {
            console.error("Error adding to queue:", error);
            setStatus(`Error adding to queue: ${error instanceof Error ? error.message : String(error)}`);
            toast.error("Failed to add job to queue", {
                description: error instanceof Error ? error.message : String(error)
            });
        } finally {
            setIsAddingToQueue(false);
        }
    }, [inputPath, outputPath, saveAsNew, probeData, selectedAudioTracks, selectedSubtitleTracks, 
        selectedPresetId, availablePresets, resetForm, navigate, selectedFolderPath, formData]);

    // Load presets on mount
    useEffect(() => {
        const loadPresets = async () => {
            try {
                const presets = await loadPresetsUtil(electronAPI);
                setAvailablePresets(presets);
            } catch (error) {
                console.error("Failed to load presets:", error);
            }
        };
        loadPresets();
    }, []);

    // Apply preset function
    const applyPreset = useCallback((presetId: string) => {
        setSelectedPresetId(presetId);
        
        if (presetId === 'custom') {
            // Reset to defaults for custom
            setVideoCodec('hevc_qsv');
            setVideoPreset('faster');
            setVideoQuality(25);
            setVideoResolution('original');
            setHwAccel('auto');
            setAudioCodecConvert('libopus');
            setAudioBitrate('128k');
            setSelectedAudioLayout('stereo');
            setAudioLanguageOrder(['eng', 'original']);
            setSubtitleLanguageOrder(['eng']);
            setSubtitleTypeOrder(['forced', 'normal', 'sdh']);
            setSubtitleCodecConvert('srt');
            setRemoveAllSubtitles(false);
            return;
        }
        
        const preset = getPresetById(availablePresets, presetId);
        if (preset) {
            console.log("Applying preset:", preset.name);
            
            // Get default options based on the preset
            const options = getDefaultEncodingOptions(preset);
            
            // Apply preset values
            setVideoCodec(options.videoCodec as VideoCodec);
            setVideoPreset(options.videoPreset as VideoPreset);
            setVideoQuality(options.videoQuality as number);
            setVideoResolution(options.videoResolution as VideoResolution || 'original');
            setHwAccel(options.hwAccel as HwAccel);
            setAudioCodecConvert(options.audioCodecConvert as AudioCodecConvert);
            setAudioBitrate(options.audioBitrate as string);
            setSelectedAudioLayout(options.selectedAudioLayout as AudioLayout);
            setAudioLanguageOrder(options.audioLanguageOrder as string[]);
            setSubtitleLanguageOrder(options.subtitleLanguageOrder as string[]);
            setSubtitleTypeOrder(options.subtitleTypeOrder as string[]);
            setSubtitleCodecConvert(options.subtitleCodecConvert as string);
            setRemoveAllSubtitles(options.removeAllSubtitles as boolean);
            
            // If we have probeData, also apply track selection based on preset
            if (probeData?.streams) {
                const audioDefaults = getAudioTrackActions(probeData.streams, preset);
                const subtitleDefaults = getSubtitleTrackActions(probeData.streams, preset);
                
                setSelectedAudioTracks(audioDefaults);
                setSelectedSubtitleTracks(subtitleDefaults);
            }
        }
    }, [availablePresets, probeData]);

    // Effect to update track selections when removeAllSubtitles changes
    useEffect(() => {
        if (removeAllSubtitles && probeData?.streams) {
            // When removeAllSubtitles is enabled, set all subtitle tracks to 'discard'
            const subtitleStreams = probeData.streams.filter(s => s.codec_type === 'subtitle');
            const newSubtitleTracks: { [index: number]: TrackAction } = {};
            
            subtitleStreams.forEach(stream => {
                newSubtitleTracks[stream.index] = 'discard';
            });
            
            setSelectedSubtitleTracks(newSubtitleTracks);
            console.log('ManualEncode: removeAllSubtitles enabled - setting all subtitle tracks to discard');
        }
    }, [removeAllSubtitles, probeData]);

    // Effect to update default audioBitrate when audioCodec changes
    useEffect(() => {
        if (audioCodecConvert === 'eac3') {
            setAudioBitrate('384k');
        } else if (audioCodecConvert === 'libopus') {
            setAudioBitrate('128k');
        } else if (audioCodecConvert === 'aac') {
            setAudioBitrate('192k');
        }
    }, [audioCodecConvert]);
    
    // Handler for track selection changes
    const handleTrackActionChange = (track: TrackOption, newAction: TrackAction) => {
        if (track.type === 'audio') {
            setSelectedAudioTracks(prev => ({ ...prev, [track.index]: newAction }));
        } else {
            setSelectedSubtitleTracks(prev => ({ ...prev, [track.index]: newAction }));
        }
    };
    
    // Update track selection when probe data changes
    useEffect(() => {
        if (!probeData?.streams) return;
        
        // Create a list of selected tracks for display
        const newTracks: TrackOption[] = [];
        
        // Add audio tracks
        probeData.streams
            .filter((s: StreamInfo) => s.codec_type === 'audio')
            .forEach((stream: StreamInfo) => {
                const action = selectedAudioTracks[stream.index] || 'discard';
                if (action !== 'discard') {
                    newTracks.push({
                        index: stream.index,
                        description: getStreamDescription(stream),
                        type: 'audio',
                        action
                    });
                }
            });
        
        // Add subtitle tracks
        probeData.streams
            .filter((s: StreamInfo) => s.codec_type === 'subtitle')
            .forEach((stream: StreamInfo) => {
                const action = selectedSubtitleTracks[stream.index] || 'discard';
                if (action !== 'discard') {
                    newTracks.push({
                        index: stream.index,
                        description: getStreamDescription(stream),
                        type: 'subtitle',
                        action
                    });
                }
            });
        
        // Only update state if the tracks have actually changed
        if (JSON.stringify(newTracks) !== JSON.stringify(selectedTracks)) {
            setSelectedTracks(newTracks);
        }
    }, [probeData, selectedAudioTracks, selectedSubtitleTracks]);

    // Implement real file probing
    const probeSelectedFile = useCallback(async (filePath: string) => {
        if (!filePath) return;
        
        setIsProbing(true);
        setProbeError(null);
        setProbeData(null);
        setSelectedFolderPath(null);
        
        try {
            // Call the electron API to probe the file
            const probeResult = await electronAPI.probeFile(filePath);
            
            if (!probeResult || !probeResult.streams || !probeResult.format) {
                throw new Error("Invalid probe data returned");
            }
            
            console.log("Probe data:", probeResult);
            setProbeData(probeResult);
            
            // Get the preset if one is selected
            const preset = selectedPresetId !== 'custom' 
                ? getPresetById(availablePresets, selectedPresetId)
                : undefined;
            
            // Set default track selections based on preset or sensible defaults
            const audioDefaults = getAudioTrackActions(probeResult.streams, preset);
            const subtitleDefaults = getSubtitleTrackActions(probeResult.streams, preset);
            
            setSelectedAudioTracks(audioDefaults);
            setSelectedSubtitleTracks(subtitleDefaults);
            
        } catch (error) {
            console.error("Probe error:", error);
            setProbeError(`Failed to analyze file: ${error instanceof Error ? error.message : String(error)}`);
            setStatus(`Error analyzing file: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsProbing(false);
        }
    }, [availablePresets, selectedPresetId]);

    // Simplified select file handler using real probing
    const handleSelectInputFile = useCallback(async () => {
        try {
            const options = {
                properties: ['openFile'],
                filters: [
                    { name: 'Video Files', extensions: ['mkv', 'mp4', 'avi', 'mov', 'webm'] }
                ]
            } as any;
            
            const result = await electronAPI.showOpenDialog(options);

            if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                setInputPath(filePath);
                
                // Generate default output path using our browser-compatible path helpers
                const ext = getFileExtension(filePath);
                const basename = getFileNameWithoutExt(filePath);
                const dirname = getDirPath(filePath);
                const newOutputPath = joinPaths(dirname, `${basename}_encoded${ext}`);
                setOutputPath(newOutputPath);
                
                setStatus(`Selected: ${getFileName(filePath)}`);
                setSelectedFolderPath(null);
                
                // Start probing the selected file
                probeSelectedFile(filePath);
            }
        } catch (error) {
            setStatus(`Error selecting input file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [probeSelectedFile]);
    
    // --- NEW: Handler for selecting a folder ---
    const handleSelectFolder = useCallback(async () => {
        try {
            const options = {
                properties: ['openFile', 'multiSelections'], // Allow selecting multiple files instead of a directory
                filters: [
                    { name: 'Video Files', extensions: ['mkv', 'mp4', 'avi', 'mov', 'webm'] }
                ]
            } as any;
            
            const result = await electronAPI.showOpenDialog(options);
            
            if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                // Store all selected file paths
                setSelectedFolderPath(getDirPath(result.filePaths[0])); // Just store the directory of the first file for display
                // Update status to show how many files were selected
                setStatus(`Selected ${result.filePaths.length} files. Ready to add to queue.`);
                
                // Store the file paths for later processing
                setFormData(prev => ({
                    ...prev,
                    selectedFiles: result.filePaths
                }));
                
                // Clear single file path and probe data
                setInputPath('');
                setProbeData(null);
                setProbeError(null);
            }
        } catch (error) {
            setStatus(`Error selecting files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, []);
    
    // --- Handle Direct Encoding ---
    const handleStartEncoding = useCallback(async () => {
        if (selectedFolderPath) {
            setStatus("Direct encoding is not available for folders. Use 'Add to Queue' instead.");
            return;
        }
        
        if (!inputPath) {
            setStatus("Please select an input file first");
            return;
        }
        
        if (!probeData) {
            setStatus("Please wait for file analysis to complete");
            return;
        }
        
        setIsEncoding(true);
        setStatus("Encoding started...");
        setProgress(0); // Explicitly reset progress to 0
        setFps(null);
        setCurrentFrame(null);
        setTotalFrames(null);
        
        try {
            // Get the selected preset if any
            const preset = selectedPresetId !== 'custom' 
                ? getPresetById(availablePresets, selectedPresetId)
                : undefined;
            
            // Create track selections object for the encoding service
            const trackSelections = {
                audio: selectedAudioTracks,
                subtitle: selectedSubtitleTracks
            };
            
            // Determine output path based on saveAsNew setting
            let jobOutputPath = saveAsNew ? outputPath : inputPath;
            
            // If we're overwriting, use a temp path during encoding
            if (!saveAsNew) {
                const dirPath = getDirPath(inputPath);
                const ext = getFileExtension(inputPath);
                const basename = getFileNameWithoutExt(inputPath);
                // Generate temp path with _tmp suffix for overwrite mode
                jobOutputPath = joinPaths(dirPath, `${basename}_tmp${ext}`);
                console.log(`ManualEncode: Using temp output path for overwrite: ${jobOutputPath}`);
            }
            
            // Add job to queue with high priority for immediate processing
            const job = queueService.addJob(
                inputPath,
                jobOutputPath, // Use the temp output path if overwriting
                !saveAsNew,    // Keep the overwriteInput flag for proper finalization
                preset,
                probeData,
                trackSelections,
                100 // High priority to process immediately
            );
            
            // Store the job ID for tracking this specific job
            const trackingJobId = job.id;
            console.log(`ManualEncode: Queue service created job with ID: ${trackingJobId}`);
            
            // Make sure queue is processing - use the more robust method
            queueService.startProcessing();
            queueService.forceProcessQueue(); // This addresses any state inconsistencies
            
            // Track if component is still mounted (to prevent state updates after unmount)
            let isMounted = true;
            
            // Subscribe to progress through queue events - with job-specific filters
            queueService.setEventCallbacks({
                onJobProgress: (updatedJob) => {
                    // Only update UI for our specific job
                    if (isMounted && updatedJob.id === trackingJobId) {
                        console.log(`ManualEncode: Progress update for job ${trackingJobId}:`, 
                                    updatedJob.progress, updatedJob.fps, 
                                    updatedJob.frame, updatedJob.totalFrames);
                        
                        // Set all state updates at once to reduce renders
                        setProgress(prevProgress => {
                            // Only log when progress changes significantly to avoid console spam
                            if (Math.abs(prevProgress - updatedJob.progress) > 1) {
                                console.log(`ManualEncode: Updating progress from ${prevProgress}% to ${updatedJob.progress}%`);
                            }
                            return updatedJob.progress;
                        });
                        
                        setFps(updatedJob.fps ?? null);
                        setCurrentFrame(updatedJob.frame ?? null);
                        setTotalFrames(updatedJob.totalFrames ?? null);
                        
                        if (updatedJob.status === 'processing') {
                            setStatus("Encoding in progress...");
                        }
                    } else if (updatedJob.id !== trackingJobId) {
                        console.log(`ManualEncode: Ignoring progress update for job ${updatedJob.id}, waiting for ${trackingJobId}`);
                    }
                },
                onJobCompleted: (updatedJob) => {
                    // Only respond to our specific job completion
                    if (isMounted && updatedJob.id === trackingJobId) {
                        console.log(`ManualEncode: Job ${trackingJobId} completed`);
                        setStatus(`Encoding completed successfully! File saved to: ${updatedJob.outputPath || updatedJob.inputPath}`);
                        setProgress(100);
                        
                        // Check if the encoded file exists in the media database and mark it as processed
                        // This step is critical for ensuring files encoded through ManualEncode get properly tagged
                        (async () => {
                            try {
                                // Query the database to see if this file exists in the media library
                                const dbResult = await electronAPI.dbQuery(
                                    'SELECT id FROM media WHERE filePath = ?',
                                    [!saveAsNew ? inputPath : updatedJob.outputPath]
                                );
                                
                                if (dbResult && dbResult.length > 0) {
                                    const mediaId = dbResult[0].id;
                                    console.log(`ManualEncode: Found file in database with ID ${mediaId}, updating record`);
                                    
                                    // Update the media record with the encoding job ID and current size
                                    const fileSize = await electronAPI.getFileSize(!saveAsNew ? inputPath : updatedJob.outputPath);
                                    await electronAPI.dbQuery(
                                        'UPDATE media SET encodingJobId = ?, currentSize = ?, lastSizeCheckAt = CURRENT_TIMESTAMP WHERE id = ?',
                                        [
                                            updatedJob.id,
                                            fileSize,
                                            mediaId
                                        ]
                                    );
                                    console.log(`ManualEncode: Updated database record for media ID ${mediaId}`);
                                } else {
                                    console.log(`ManualEncode: File not found in media database, no record to update`);
                                }
                            } catch (error) {
                                console.error(`ManualEncode: Error updating media database:`, error);
                            }
                        })();
                        
                        // Show success with option to encode another
                        setSuccessMessage("Encoding completed successfully!");
                        setShowSuccess(true);
                        
                        // Reset form after 3 seconds
                        setTimeout(() => {
                            if (isMounted) {
                                resetForm();
                                setShowSuccess(false);
                            }
                        }, 3000);
                        
                        // Show toast notification
                        toast.success("Encoding completed", {
                            description: `File "${getFileName(inputPath)}" was successfully encoded`
                        });
                    }
                },
                onJobFailed: (updatedJob) => {
                    // Only respond to our specific job failure
                    if (isMounted && updatedJob.id === trackingJobId) {
                        console.log(`ManualEncode: Job ${trackingJobId} failed:`, updatedJob.error);
                        setStatus(`Encoding failed: ${updatedJob.error || "Unknown error"}`);
                        
                        // Show error toast
                        toast.error("Encoding failed", {
                            description: updatedJob.error || "Unknown error occurred during encoding"
                        });
                    }
                }
            });
            
            // Wait until job is no longer in the queue (completed or failed)
            const checkJobStatus = () => {
                const currentJob = queueService.getJob(trackingJobId);
                if (currentJob && (currentJob.status === 'processing' || currentJob.status === 'queued')) {
                    setTimeout(checkJobStatus, 500);
                } else {
                    // Job is done, restore original callbacks
                    if (isMounted) {
                        queueService.setEventCallbacks({});
                        setIsEncoding(false);
                        
                        // Force process queue one more time to ensure next jobs start
                        queueService.forceProcessQueue();
                    }
                }
            };
            
            // Start checking status
            checkJobStatus();
            
            // Return cleanup function to handle component unmount
            return () => {
                isMounted = false;
                queueService.setEventCallbacks({});
            };
            
        } catch (error) {
            console.error("Encoding error:", error);
            setStatus(`Encoding error: ${error instanceof Error ? error.message : String(error)}`);
            setIsEncoding(false);
            
            // Show error toast
            toast.error("Encoding error", {
                description: error instanceof Error ? error.message : String(error)
            });
        }
    }, [inputPath, outputPath, saveAsNew, probeData, selectedAudioTracks, selectedSubtitleTracks, 
        videoCodec, videoPreset, videoQuality, videoResolution, hwAccel, audioCodecConvert, audioBitrate, selectedAudioLayout,
        availablePresets, selectedPresetId, audioLanguageOrder, resetForm, selectedFolderPath]);

    // --- Track Selection Dialog --- 
    const openTrackSelect = () => {
        setTrackSelectOpen(true);
    };

    // --- Render --- 
    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold tracking-tight mb-1">Manual Encoding</h1>
                <p className="text-muted-foreground">Configure and start video encoding with custom settings</p>
            </div>

            <div className="space-y-8">
                {/* Input/Output Card */}
                <Card className="border-none shadow-sm bg-card/50">
                    <CardHeader>
                        <CardTitle className="text-xl">Input & Output</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="input-file" className="text-sm font-medium">Input File / Folder</Label>
                                <div className="flex gap-3">
                                    <Input 
                                        id="input-file" 
                                        value={formData.selectedFiles?.length > 0 
                                            ? `${formData.selectedFiles.length} files selected from ${getFileName(selectedFolderPath || '')}` 
                                            : inputPath} 
                                        readOnly 
                                        placeholder="Select input file or multiple files..." 
                                        className="bg-background/50"
                                    />
                                    <Button 
                                        onClick={handleSelectInputFile} 
                                        variant="outline"
                                        className="min-w-[100px] flex items-center justify-center"
                                        disabled={isEncoding || isAddingToQueue}
                                    >
                                        {isProbing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Browse File
                                    </Button>
                                    <Button 
                                        onClick={handleSelectFolder} 
                                        variant="outline"
                                        className="min-w-[150px] w-auto px-4 flex items-center justify-center whitespace-nowrap"
                                        disabled={isEncoding || isAddingToQueue}
                                    >
                                        <Folder className="mr-2 h-4 w-4" />
                                        Select Multiple
                                    </Button>
                                </div>
                                {formData.selectedFiles?.length > 0 && (
                                    <p className="text-xs text-muted-foreground pt-1">
                                        {formData.selectedFiles.length} files selected from: {selectedFolderPath}
                                    </p>
                                )}
                            </div>
                            
                            {/* Preset Dropdown */}
                            <div className="space-y-2 pt-2">
                                <Label htmlFor="preset-select" className="text-sm font-medium">Encoding Preset</Label>
                                <Select 
                                    value={selectedPresetId} 
                                    onValueChange={applyPreset}
                                    disabled={isEncoding || isAddingToQueue || availablePresets.length === 0}
                                >
                                    <SelectTrigger id="preset-select" className="bg-background/50">
                                        <SelectValue placeholder="Select a preset..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="custom">Custom Settings</SelectItem>
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
                            
                            {/* Save As New Option */}
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="save-as-new"
                                    checked={saveAsNew}
                                    onCheckedChange={(checked) => {
                                        setSaveAsNew(checked as boolean);
                                    }}
                                    disabled={isEncoding || isAddingToQueue}
                                />
                                <Label
                                    htmlFor="save-as-new"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Save as New File {formData.selectedFiles?.length > 0 ? `(${formData.selectedFiles.length} files)` : ''}
                                </Label>
                            </div>

                            {saveAsNew && (
                                <div className="space-y-2">
                                    {formData.selectedFiles?.length > 0 ? (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Each file will be saved as [filename]_encoded[extension] in its original folder.
                                        </p>
                                    ) : (
                                        <>
                                            <Label htmlFor="output-file" className="text-sm font-medium">Output File</Label>
                                            <div className="flex gap-3">
                                                <Input 
                                                    id="output-file" 
                                                    value={outputPath} 
                                                    onChange={e => setOutputPath(e.target.value)} 
                                                    placeholder="Select or type output file..." 
                                                    disabled={isEncoding || isAddingToQueue}
                                                    className="bg-background/50"
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Tracks Card - Only shown when we have probe data (and not folder selected) */}
                {probeData && !selectedFolderPath && (
                    <Card className="border-none shadow-sm bg-card/50">
                        <CardHeader>
                            <CardTitle className="text-xl">Track Selection (Single File)</CardTitle>
                            <CardDescription>Choose which tracks to keep, convert, or discard</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {selectedTracks.length > 0 ? (
                                <div className="space-y-4">
                                    {selectedTracks.map(track => (
                                        <div key={track.index} className="flex items-center justify-between p-3 bg-background/50 rounded-md">
                                            <div className="flex items-center gap-3">
                                                <Badge variant={track.type === 'audio' ? 'default' : 'secondary'}>
                                                    {track.type === 'audio' ? 'Audio' : 'Subtitle'}
                                                </Badge>
                                                <span className="text-sm">{track.description}</span>
                                            </div>
                                            <Select 
                                                value={track.action} 
                                                onValueChange={(value: TrackAction) => handleTrackActionChange(track, value)}
                                                disabled={isEncoding}
                                            >
                                                <SelectTrigger className="w-[110px] h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="convert">Convert</SelectItem>
                                                    <SelectItem value="keep">Keep</SelectItem>
                                                    <SelectItem value="discard">Discard</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No tracks selected</p>
                            )}
                            
                            <div className="flex justify-end">
                                <Button 
                                    variant="outline" 
                                    onClick={openTrackSelect}
                                    disabled={isEncoding}
                                >
                                    Show All Tracks
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Video Settings Card - Hide if folder selected? Or keep for preset editing? Keep for now */}
                <Card className="border-none shadow-sm bg-card/50">
                    <CardHeader>
                        <CardTitle className="text-xl">Encoding Settings</CardTitle>
                        <CardDescription>Basic video and audio parameters</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm">Video Codec</Label>
                                <Select value={videoCodec} onValueChange={(value: VideoCodec) => setVideoCodec(value)} disabled={isEncoding}>
                                    <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                    <SelectContent>{VIDEO_CODECS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-sm">Video Preset</Label>
                                <Select value={videoPreset} onValueChange={(value: VideoPreset) => setVideoPreset(value)} disabled={isEncoding || videoCodec === 'copy'}>
                                    <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                    <SelectContent>{VIDEO_PRESETS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <Label className="text-sm">Quality</Label>
                                    <span className="text-sm text-muted-foreground">{videoQuality}</span>
                                </div>
                                <Slider 
                                    value={[videoQuality]} 
                                    min={18} 
                                    max={38} 
                                    step={1} 
                                    onValueChange={([v]) => setVideoQuality(v)} 
                                    disabled={isEncoding || videoCodec === 'copy'}
                                    className="[&>span]:bg-indigo-600"
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-sm">Resolution</Label>
                                <Select 
                                    value={videoResolution} 
                                    onValueChange={(value: VideoResolution) => setVideoResolution(value)} 
                                    disabled={isEncoding || videoCodec === 'copy'}
                                >
                                    <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {VIDEO_RESOLUTIONS.map(r => (
                                            <SelectItem key={r} value={r}>
                                                {r === 'original' ? 'Original' : r}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-sm">Hardware Acceleration</Label>
                                <Select value={hwAccel} onValueChange={(value: HwAccel) => setHwAccel(value)} disabled={isEncoding}>
                                    <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                    <SelectContent>{HW_ACCEL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            
                            <Separator className="my-2" />
                            
                            <div className="space-y-2">
                                <Label className="text-sm">Audio Codec</Label>
                                <Select value={audioCodecConvert} onValueChange={(value: AudioCodecConvert) => setAudioCodecConvert(value)} disabled={isEncoding}>
                                    <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                    <SelectContent>{AUDIO_CODECS_CONVERT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-sm">Audio Bitrate</Label>
                                <Select value={audioBitrate} onValueChange={setAudioBitrate} disabled={isEncoding}>
                                    <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {audioCodecConvert === 'eac3' ? (
                                            ['192k', '256k', '384k', '448k', '640k'].map(r => (
                                                <SelectItem key={r} value={r}>{r}</SelectItem>
                                            ))
                                        ) : (
                                            ['64k', '96k', '128k', '192k', '256k'].map(r => (
                                                <SelectItem key={r} value={r}>{r}</SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-sm">Audio Layout</Label>
                                <Select value={selectedAudioLayout} onValueChange={(value: AudioLayout) => setSelectedAudioLayout(value)} disabled={isEncoding}>
                                    <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="stereo">Stereo</SelectItem>
                                        <SelectItem value="mono">Mono</SelectItem>
                                        <SelectItem value="surround5_1">5.1 Surround</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <Separator className="my-2" />
                            
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="remove-all-subtitles"
                                    checked={removeAllSubtitles}
                                    onCheckedChange={(checked) => setRemoveAllSubtitles(checked as boolean)}
                                    disabled={isEncoding || isAddingToQueue}
                                />
                                <Label
                                    htmlFor="remove-all-subtitles"
                                    className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Remove all subtitles from output
                                </Label>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Start Encoding Button Section - Updated to include Add to Queue */}
                <div className="flex justify-end gap-3">
                    <Button 
                        onClick={addToQueue} 
                        variant="outline"
                        disabled={(!inputPath && formData.selectedFiles?.length === 0) || isProbing || (!probeData && formData.selectedFiles?.length === 0) || isEncoding || isAddingToQueue} 
                    >
                        {isAddingToQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        {formData.selectedFiles?.length > 0 ? `Add ${formData.selectedFiles.length} Files to Queue` : 'Add to Queue'}
                    </Button>
                    
                    <Button 
                        onClick={handleStartEncoding} 
                        disabled={!!selectedFolderPath || !inputPath || isProbing || !probeData || isEncoding || isAddingToQueue} 
                        className="bg-primary hover:bg-primary/90"
                    >
                        {isEncoding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Start Encoding (Single File)
                    </Button>
                </div>

                {/* Status Display with Progress Bar - Only show progress for single file encoding */}
                <div className="bg-card/50 p-4 rounded-md">
                    <div className="flex flex-col gap-2">
                        <p className="text-sm">Status: {status}</p>
                        
                        {isEncoding && !selectedFolderPath && (
                            <>
                                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
                                    <div 
                                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
                                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                                    ></div>
                                </div>
                                
                                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                    <span>{progress.toFixed(1)}%</span>
                                    {fps !== null && <span>{fps.toFixed(1)} FPS</span>}
                                    {currentFrame !== null && totalFrames !== null && (
                                        <span>Frame {currentFrame} / {totalFrames}</span>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
                
                {/* Success indicator */}
                {showSuccess && (
                    <div className="fixed bottom-4 right-4 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 p-4 rounded-md shadow-lg animate-in fade-in duration-300 flex items-center z-50">
                        <CheckCircle className="h-5 w-5 mr-2" />
                        {successMessage}
                    </div>
                )}
                
                {/* Error alert */}
                {probeError && !selectedFolderPath && (
                    <Alert variant="destructive" className="bg-destructive/10 border-none">
                        <AlertDescription>{probeError}</AlertDescription>
                    </Alert>
                )}
            </div>
            
            {/* Track Selection Dialog */}
            <Dialog open={trackSelectOpen} onOpenChange={setTrackSelectOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Select Tracks (All Available)</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
                        {probeData?.streams
                            ?.filter(s => s.codec_type === 'audio' || s.codec_type === 'subtitle')
                            .map(stream => {
                                const streamType = stream.codec_type as 'audio' | 'subtitle';
                                const currentAction = streamType === 'audio' 
                                    ? selectedAudioTracks[stream.index] || 'discard'
                                    : selectedSubtitleTracks[stream.index] || 'discard';
                                
                                return (
                                    <div key={stream.index} className="flex items-center justify-between p-3 bg-background/50 rounded-md">
                                        <div className="flex items-center gap-3">
                                            <Badge variant={streamType === 'audio' ? 'default' : 'secondary'}>
                                                {streamType === 'audio' ? 'Audio' : 'Subtitle'}
                                            </Badge>
                                            <span className="text-sm">{getStreamDescription(stream)}</span>
                                        </div>
                                        <Select 
                                            value={currentAction} 
                                            onValueChange={(value: TrackAction) => {
                                                const track: TrackOption = {
                                                    index: stream.index,
                                                    description: getStreamDescription(stream),
                                                    type: streamType,
                                                    action: value as TrackAction
                                                };
                                                handleTrackActionChange(track, value as TrackAction);
                                            }}
                                            disabled={isEncoding || isAddingToQueue}
                                        >
                                            <SelectTrigger className="w-[110px] h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="convert">Convert</SelectItem>
                                                <SelectItem value="keep">Keep</SelectItem>
                                                <SelectItem value="discard">Discard</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                );
                            })}
                        {!probeData?.streams && (
                            <p className="text-sm text-muted-foreground p-4 text-center">Probe a file to see available tracks.</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTrackSelectOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ManualEncode; 