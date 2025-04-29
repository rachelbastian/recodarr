import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox"; // Might use later for bool options
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Check } from 'lucide-react'; // For loading indicators
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
// --- Import Types Explicitly ---
import type { 
    IElectronAPI, 
    ProbeData, 
    StreamInfo, 
    EncodingOptions, 
    EncodingResult,
    EncodingPreset
} from '../../types'; // Adjust path if needed
// Add Dialog components
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ProcessedFileDialog } from "src/components/ProcessedFileDialog";
import { getAudioTrackActions, getSubtitleTrackActions, loadPresets as loadPresetsUtil, 
  getPresetById, getDefaultEncodingOptions, getSubtitleType as getSubtitleTypeUtil, 
  orderSubtitlesByPreset } from '@/utils/presetUtil';

// Extend the EncodingOptions interface to add audioOptions
interface ExtendedEncodingOptions {
    inputPath: string;
    outputPath: string;
    overwriteInput?: boolean;
    // Video options
    videoCodec?: string; 
    videoPreset?: string; 
    videoQuality?: number | string; 
    lookAhead?: number; 
    pixelFormat?: string; 
    mapVideo?: string; 
    videoFilter?: string; // Add video filter for resolution
    // Audio options
    audioCodec?: string; 
    audioBitrate?: string; 
    audioFilter?: string; 
    mapAudio?: string; 
    audioOptions?: string[];
    // Subtitle options
    subtitleCodec?: string; 
    mapSubtitle?: string[];
    // General options
    hwAccel?: 'auto' | 'qsv' | 'nvenc' | 'cuda' | 'vaapi' | 'videotoolbox' | 'none';
    duration?: number;
    resolution?: string;
}

// Add TrackOption interface
interface TrackOption {
    index: number;
    description: string;
    type: 'audio' | 'subtitle';
    action: TrackAction;
}

// Cast window.electron to the imported type
const electronAPI = window.electron as IElectronAPI;

interface EncodingProgressUpdate {
    percent?: number; // Keep for potential fallback if frame/totalFrames missing
    status?: string;
    fps?: number;
    frame?: number;
    totalFrames?: number;
}

// --- Constants for UI Options --- 
const VIDEO_CODECS = ['hevc_qsv', 'h264_qsv', 'av1_qsv', 'libx265', 'libx264', 'copy'] as const;
type VideoCodec = typeof VIDEO_CODECS[number];
const VIDEO_PRESETS = ['veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'ultrafast'] as const;
type VideoPreset = typeof VIDEO_PRESETS[number];
const VIDEO_RESOLUTIONS = ['original', '480p', '720p', '1080p', '1440p', '2160p'] as const;
type VideoResolution = typeof VIDEO_RESOLUTIONS[number];
const AUDIO_CODECS_CONVERT = ['libopus', 'aac', 'eac3'] as const; // Codecs for conversion
type AudioCodecConvert = typeof AUDIO_CODECS_CONVERT[number];
const SUBTITLE_CODECS_CONVERT = ['srt', 'mov_text'] as const; // Common subtitle formats
type SubtitleCodecConvert = typeof SUBTITLE_CODECS_CONVERT[number];
const HW_ACCEL_OPTIONS = ['auto', 'qsv', 'nvenc', 'cuda', 'none'] as const;
type HwAccel = typeof HW_ACCEL_OPTIONS[number];
const AUDIO_LAYOUT_OPTIONS = ['stereo', 'mono', 'surround5_1'] as const;
type AudioLayout = typeof AUDIO_LAYOUT_OPTIONS[number];
const TRACK_ACTION_OPTIONS = ['convert', 'keep', 'discard'] as const;
type TrackAction = typeof TRACK_ACTION_OPTIONS[number];

// Add at the top where constants and types are defined
const SUBTITLE_TYPES = ['forced', 'sdh', 'cc', 'hi', 'normal', 'signs', 'song'] as const;
type SubtitleType = typeof SUBTITLE_TYPES[number];

// --- Helper Functions --- 
// Basic stream description
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
const ManualEncode: React.FC = () => { // Renamed component
    // Input/Output State
    const [inputPath, setInputPath] = useState<string>('');
    const [outputPath, setOutputPath] = useState<string>('');
    const [saveAsNew, setSaveAsNew] = useState(false); // Add state for "Save as New" option

    // Probing State
    const [isProbing, setIsProbing] = useState(false);
    const [probeData, setProbeData] = useState<ProbeData | null>(null);
    const [probeError, setProbeError] = useState<string | null>(null);

    // --- Preset State --- 
    const [availablePresets, setAvailablePresets] = useState<EncodingPreset[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string>('custom'); // 'custom' represents no preset selected
    // --- End Preset State ---

    // Encoding Param State
    const [videoCodec, setVideoCodec] = useState<VideoCodec>('hevc_qsv');
    const [videoPreset, setVideoPreset] = useState<VideoPreset>('faster');
    const [videoQuality, setVideoQuality] = useState<number>(25);
    const [videoResolution, setVideoResolution] = useState<VideoResolution>('original');
    const [hwAccel, setHwAccel] = useState<HwAccel>('auto');
    const [audioCodecConvert, setAudioCodecConvert] = useState<AudioCodecConvert>('libopus');
    const [audioBitrate, setAudioBitrate] = useState<string>('128k');
    const [subtitleCodecConvert, setSubtitleCodecConvert] = useState<SubtitleCodecConvert>('srt');

    // Add state for the new audio order preference (to be set by preset)
    const [audioLanguageOrder, setAudioLanguageOrder] = useState<string[]>(['eng', 'original']);

    // Effect to update default audioBitrate when audioCodec changes
    useEffect(() => {
        if (audioCodecConvert === 'eac3') {
            setAudioBitrate('384k'); // Higher default for EAC3
        } else if (audioCodecConvert === 'libopus') {
            setAudioBitrate('128k'); // Opus can sound good at lower bitrates
        } else if (audioCodecConvert === 'aac') {
            setAudioBitrate('192k'); // Higher bitrate for AAC
        }
    }, [audioCodecConvert]);

    // Track/Layout Selection State
    const [selectedAudioLayout, setSelectedAudioLayout] = useState<AudioLayout>('stereo');
    const [selectedAudioTracks, setSelectedAudioTracks] = useState<{ [index: number]: TrackAction }>({});
    const [selectedSubtitleTracks, setSelectedSubtitleTracks] = useState<{ [index: number]: TrackAction }>({});

    // Encoding Process State
    const [status, setStatus] = useState<string>('');
    const [percent, setPercent] = useState<number | undefined>(undefined);
    const [isEncoding, setIsEncoding] = useState(false);
    const [lastResult, setLastResult] = useState<EncodingResult | null>(null);
    const [lastJobId, setLastJobId] = useState<string | null>(null); // State for last Job ID
    const [logContent, setLogContent] = useState<string | null>(null); // State for log content
    const [isFetchingLog, setIsFetchingLog] = useState(false); // State for log fetching status

    // Add state for the new progress metrics
    const [fps, setFps] = useState<number | undefined>(undefined);
    const [frame, setFrame] = useState<number | undefined>(undefined);
    const [totalFrames, setTotalFrames] = useState<number | undefined>(undefined);

    // State for UI-calculated elapsed time
    const [encodingStartTime, setEncodingStartTime] = useState<number | null>(null);
    const [elapsedTimeString, setElapsedTimeString] = useState<string>("00:00:00");

    // Add new state for track selection UI
    const [trackSelectOpen, setTrackSelectOpen] = useState(false);
    const [selectedTracks, setSelectedTracks] = useState<TrackOption[]>([]);

    // Add new state for dialog
    const [processedDialogOpen, setProcessedDialogOpen] = useState(false);
    const [isReencodingDialog, setIsReencodingDialog] = useState(false);

    // --- Load Presets on Mount --- 
    useEffect(() => {
        const loadPresets = async () => {
            try {
                const presets = await loadPresetsUtil(electronAPI);
                setAvailablePresets(presets);
            } catch (error) {
                console.error("Failed to load presets:", error);
                // Optionally show an error to the user
            }
        };
        loadPresets();
    }, []);
    // --- End Load Presets ---

    // --- Apply Preset Logic --- 
    const applyPreset = useCallback((presetId: string) => {
        setSelectedPresetId(presetId);
        if (presetId === 'custom') {
            // Reset to the default manual encode values
            setVideoCodec('hevc_qsv');
            setVideoPreset('faster');
            setVideoQuality(25);
            setVideoResolution('original');
            setHwAccel('auto');
            setAudioCodecConvert('libopus');
            setAudioBitrate('128k');
            setSelectedAudioLayout('stereo');
            setSubtitleCodecConvert('srt');
            setAudioLanguageOrder(['eng', 'original']); // Reset audio order
            return;
        }

        const preset = getPresetById(availablePresets, presetId);
        if (preset) {
            console.log("Applying preset:", preset.name, preset);
            
            // Get default options based on the preset
            const options = getDefaultEncodingOptions(preset);
            
            // Apply preset values to state
            setVideoCodec(options.videoCodec as VideoCodec);
            setVideoPreset(options.videoPreset as VideoPreset);
            setVideoQuality(options.videoQuality as number);
            setVideoResolution(options.videoResolution as VideoResolution);
            setHwAccel(options.hwAccel as HwAccel);
            setAudioCodecConvert(options.audioCodecConvert as AudioCodecConvert);
            setAudioBitrate(options.audioBitrate as string);
            setSelectedAudioLayout(options.selectedAudioLayout as AudioLayout);
            setSubtitleCodecConvert(options.subtitleCodecConvert as SubtitleCodecConvert);
            setAudioLanguageOrder(options.audioLanguageOrder as string[]);
        }
    }, [availablePresets]);
    // --- End Apply Preset Logic ---

    // Add this useEffect to monitor state changes
    useEffect(() => {
        console.log('[UI] State updated:', {
            percent, 
            fps,
            frame,
            totalFrames,
            status,
            isEncoding,
            encodingStartTime,
            elapsedTimeString
        });
    }, [percent, fps, frame, totalFrames, status, isEncoding, encodingStartTime, elapsedTimeString]);

    // Effect for Elapsed Time Timer
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (isEncoding && encodingStartTime) {
            intervalId = setInterval(() => {
                const now = Date.now();
                const elapsedSeconds = Math.floor((now - encodingStartTime) / 1000);
                setElapsedTimeString(formatTime(elapsedSeconds));
            }, 1000); // Update every second
        }

        // Cleanup function
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [isEncoding, encodingStartTime]); // Rerun when encoding starts/stops

    // Effect for progress subscription
    useEffect(() => {
        const handleProgress = (data: EncodingProgressUpdate) => {
            console.log('[UI] Received progress update:', data);
            
            // Update status always
            if (data.status) {
                console.log(`[UI] Status update: ${data.status}`);
                setStatus(data.status);
                // Set progress to 100% if we get a completion message
                if (data.status.toLowerCase().includes('complete')) {
                    console.log('[UI] Encoding complete, setting progress to 100%');
                    setPercent(100);
                    return;
                }
            }

            // Update frame and totalFrames
            if (data.frame !== undefined) {
                 console.log(`[UI] Frame update: ${data.frame}`);
                 setFrame(data.frame);
            }
            if (data.totalFrames !== undefined) {
                console.log(`[UI] Total frames update: ${data.totalFrames}`);
                setTotalFrames(data.totalFrames);
            }

            // Calculate percentage if possible and not complete
            if (data.frame !== undefined && data.totalFrames !== undefined && data.totalFrames > 0) {
                const calculatedPercent = Math.min(100, Math.max(0, (data.frame / data.totalFrames) * 100));
                console.log(`[UI] Calculated percent: ${calculatedPercent.toFixed(1)}% (from ${data.frame}/${data.totalFrames})`);
                setPercent(calculatedPercent);
            } else if (data.percent !== undefined) { // Use backend percent as fallback
                 console.log(`[UI] Using backend percent fallback: ${data.percent.toFixed(1)}%`);
                 setPercent(data.percent);
            }
            
            if (data.fps !== undefined) {
                console.log(`[UI] FPS update: ${data.fps}`);
                setFps(data.fps);
            }
        };
        
        let unsubscribe: (() => void) | undefined;
        // Use the casted electronAPI object
        if (electronAPI?.subscribeEncodingProgress) {
            console.log('[UI] Subscribing to encoding progress');
            unsubscribe = electronAPI.subscribeEncodingProgress(handleProgress);
        }
        
        return () => {
            console.log('[UI] Unsubscribing from encoding progress');
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, []);

    // --- Add useEffect for Preset-based Track Selection ---
    useEffect(() => {
        if (probeData?.streams && selectedPresetId !== 'custom') {
            const activePreset = getPresetById(availablePresets, selectedPresetId);
            
            if (activePreset) {
                console.log(`[Preset Track Select] Applying track selection from preset "${activePreset.name}"`);
                
                // Get audio track actions based on preset
                const audioDefaults = getAudioTrackActions(probeData.streams, activePreset);
                setSelectedAudioTracks(audioDefaults);
                console.log("[Preset Track Select] Updated selectedAudioTracks:", audioDefaults);
                
                // Get subtitle track actions based on preset
                const subtitleDefaults = getSubtitleTrackActions(probeData.streams, activePreset);
                setSelectedSubtitleTracks(subtitleDefaults);
                console.log("[Preset Track Select] Updated selectedSubtitleTracks based on preset:", subtitleDefaults);
            } 
            else if (probeData.streams) {
                // Default selection for custom mode
                const audioDefaults: { [index: number]: TrackAction } = {};
                const subtitleDefaults: { [index: number]: TrackAction } = {};
                let firstAudioFound = false;
                
                probeData.streams.forEach((stream: StreamInfo) => {
                    if (stream.codec_type === 'audio') {
                        audioDefaults[stream.index] = !firstAudioFound ? 'convert' : 'discard';
                        firstAudioFound = true;
                    }
                    if (stream.codec_type === 'subtitle') {
                        subtitleDefaults[stream.index] = (stream.tags?.language?.toLowerCase() === 'eng') ? 'keep' : 'discard';
                    }
                });
                
                setSelectedAudioTracks(audioDefaults);
                setSelectedSubtitleTracks(subtitleDefaults);
                console.log("[Manual Track Select] Set default tracks for 'custom' mode.");
            }
        }
    }, [probeData, selectedPresetId, availablePresets]);
    // --- End Track Selection Effect ---

    // Update track selection when probe data changes
    useEffect(() => {
        if (probeData?.streams) {
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
            
            setSelectedTracks(newTracks);
        }
    }, [probeData, selectedAudioTracks, selectedSubtitleTracks]);

    // Handler for track selection changes
    const handleTrackActionChange = (track: TrackOption, newAction: TrackAction) => {
        if (track.type === 'audio') {
            setSelectedAudioTracks(prev => ({ ...prev, [track.index]: newAction }));
        } else {
            setSelectedSubtitleTracks(prev => ({ ...prev, [track.index]: newAction }));
        }
    };

    // --- File Handling & Probing --- 
    const handleFileSelect = useCallback(async () => {
        try {
            // Use typed options matching what's expected in the preload API
            const fileOptions: FileDialogOptions = {
                properties: ['openFile'],
                filters: [
                    { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'] }
                ]
            };
            
            // Use the casted electronAPI object with proper types
            const result = await electronAPI?.showOpenDialog(fileOptions as any);
            
            if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                const selectedPath = result.filePaths[0];
                console.log("Selected file:", selectedPath);
                setInputPath(selectedPath);
                setOutputPath(selectedPath); // Set output path same as input by default

                // Probe the file
                setStatus('Probing file...');
                setIsProbing(true);
                setProbeError(null);
                try {
                    // Use the casted electronAPI object
                    const probed = await electronAPI?.probeFile(selectedPath);
                    if (probed) {
                        setProbeData(probed);
                        
                        // Check if file was already processed by Recodarr
                        if (probed.processedByRecodarr?.processed) {
                            console.log("File was already processed by Recodarr", probed.processedByRecodarr);
                            
                            // Open our custom dialog instead of using electronAPI.showConfirmationDialog
                            setIsReencodingDialog(false);
                            setProcessedDialogOpen(true);
                            
                            // The rest of the handling will be in the dialog callbacks
                        } else {
                            // Continue with normal flow when file is not previously processed
                            // --- Default track selection (used for 'custom' mode or if preset logic fails) ---
                            // This section will now primarily handle the 'custom' case,
                            // as the useEffect above handles preset-based selection.
                            if (selectedPresetId === 'custom') {
                                const audioDefaults: { [index: number]: TrackAction } = {};
                                const subtitleDefaults: { [index: number]: TrackAction } = {};
                                let firstAudioFound = false;
                                // Use StreamInfo type here
                                probed.streams.forEach((stream: StreamInfo) => {
                                    if (stream.codec_type === 'audio') {
                                        // Default to converting first audio, discard others in custom mode
                                        audioDefaults[stream.index] = !firstAudioFound ? 'convert' : 'discard';
                                        firstAudioFound = true;
                                    }
                                    if (stream.codec_type === 'subtitle') {
                                        // Default to keeping English, discard others in custom mode
                                        subtitleDefaults[stream.index] = (stream.tags?.language?.toLowerCase() === 'eng') ? 'keep' : 'discard';
                                    }
                                });
                                setSelectedAudioTracks(audioDefaults);
                                setSelectedSubtitleTracks(subtitleDefaults);
                                console.log("[Manual Track Select] Set default tracks for 'custom' mode.");
                            }
                            // --- End Default Track Selection ---
                            setStatus('Probe complete. Configure options.');
                        }
                    } else {
                        setProbeError('Failed to probe file. Check logs.');
                        setStatus('Probe failed.');
                    }
                } catch (probeErr) {
                    console.error('Error probing file:', probeErr);
                    const message = probeErr instanceof Error ? probeErr.message : String(probeErr);
                    setProbeError(`Probe error: ${message}`);
                    setStatus('Probe failed.');
                } finally {
                    setIsProbing(false);
                }
            }
        } catch (error) {
            console.error('Error selecting input file:', error);
            setStatus(`Error selecting input file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, []);

    const handleSelectOutputFile = useCallback(async () => {
        try {
            // Use the casted electronAPI object
            const result = await electronAPI?.showSaveDialog({
                defaultPath: outputPath || undefined,
                filters: [
                    { name: 'Video Files', extensions: ['mkv', 'mp4'] } 
                ]
            });
            if (result && !result.canceled && result.filePath) {
                setOutputPath(result.filePath);
            }
        } catch (error) {
            console.error('Error selecting output file:', error);
            setStatus(`Error selecting output file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [outputPath]);

    // --- Encoding --- 
    const handleStartEncoding = async () => {
        if (!inputPath || (!saveAsNew && !inputPath) || (saveAsNew && !outputPath) || !probeData) {
            setStatus('Please select input file and wait for probe to complete.');
            return;
        }

        // Check if file was already processed
        if (probeData.processedByRecodarr?.processed) {
            console.log("File was already processed by Recodarr", probeData.processedByRecodarr);
            
            // Open our custom dialog with re-encoding warning instead of electronAPI.showConfirmationDialog
            setIsReencodingDialog(true);
            setProcessedDialogOpen(true);
            
            // The rest of encoding will be handled when the user confirms in the dialog
            return;
        }

        // If we get here, either the file was not processed before or user confirmed re-encoding
        await startEncodingProcess();
    };
    
    // Extract encoding logic to a separate async function to fix the "await" linter error
    const startEncodingProcess = async () => {
        if (!probeData) {
            setStatus('Probe data is missing. Cannot start encoding.');
            console.error('startEncodingProcess called without valid probeData');
            return;
        }
        
        setIsEncoding(true);
        setEncodingStartTime(Date.now());
        setElapsedTimeString("00:00:00");
        setStatus('Building encoding options...');
        setPercent(0);
        setFps(undefined);
        setFrame(undefined);
        setTotalFrames(undefined);
        setLastResult(null);
        setLastJobId(null); // Reset job id before starting
        setLogContent(null);

        try {
            // --- DEBUG LOG: Inspect state before building options ---
            console.log('[startEncodingProcess] Inspecting state before building options:');
            console.log('Selected Preset ID:', selectedPresetId);
            console.log('Probe Data Streams:', probeData?.streams);
            console.log('Selected Audio Tracks State:', JSON.stringify(selectedAudioTracks, null, 2));
            console.log('Selected Subtitle Tracks State:', JSON.stringify(selectedSubtitleTracks, null, 2));
            // --- END DEBUG LOG ---

            // --- Build Structured Encoding Options ---
            const options: ExtendedEncodingOptions = {
                inputPath,
                outputPath: saveAsNew ? outputPath : inputPath, // Use input path if not saving as new
                overwriteInput: !saveAsNew, // Set overwriteInput flag based on saveAsNew
                // --- Video --- 
                mapVideo: undefined,
                videoCodec: undefined,
                videoPreset: undefined,
                videoQuality: undefined,
                // --- Audio --- 
                mapAudio: undefined,
                audioCodec: undefined,
                audioBitrate: undefined,
                audioFilter: undefined,
                audioOptions: undefined, // Add support for additional audio codec options
                // --- Hardware acceleration ---
                hwAccel: hwAccel !== 'none' ? hwAccel : undefined,
            };

            // --- Find First Streams --- 
            const firstVideoStream = probeData.streams.find((s: StreamInfo) => s.codec_type === 'video');
            const firstSubtitleStream = probeData.streams.find((s: StreamInfo) => 
                s.codec_type === 'subtitle' && 
                (selectedSubtitleTracks[s.index] === 'keep' || selectedSubtitleTracks[s.index] === 'convert')
            );

            // --- Video Options --- 
            // Calculate the video-specific index (position among video streams only)
            const videoStreamIndex = firstVideoStream ? probeData.streams
                .filter(s => s.codec_type === 'video')
                .findIndex(s => s.index === firstVideoStream.index) : -1;
            
            // --- DEBUG LOG --- 
            if (firstVideoStream) {
                console.log(`[Debug] Original Video Stream Index: ${firstVideoStream.index}, Video-specific Index: ${videoStreamIndex}`);
            }
            
            options.mapVideo = firstVideoStream ? `0:v:${videoStreamIndex}` : undefined;
            if (options.mapVideo) { // Only set codec if video is mapped
                 options.videoCodec = videoCodec; 
                 options.videoPreset = videoCodec !== 'copy' ? videoPreset : undefined;
                 options.videoQuality = videoCodec !== 'copy' ? videoQuality : undefined;
                 
                 // Add resolution filter if not original
                 if (videoResolution !== 'original' && videoCodec !== 'copy') {
                     // Define explicit resolutions (width x height)
                     const exactResolutions: Record<string, string> = {
                         '480p': '854x480',    // 16:9 aspect for 480p
                         '720p': '1280x720',   // 720p HD
                         '1080p': '1920x1080', // 1080p Full HD
                         '1440p': '2560x1440', // 1440p QHD
                         '2160p': '3840x2160'  // 4K UHD
                     };
                     
                     // More robust resolution mapping with explicit values for scale filter
                     const resolutionMap: Record<string, string> = {
                         '480p': 'scale=w=-2:h=480',
                         '720p': 'scale=w=-2:h=720',
                         '1080p': 'scale=w=-2:h=1080',
                         '1440p': 'scale=w=-2:h=1440',
                         '2160p': 'scale=w=-2:h=2160'
                     };
                     
                     // Use both approaches:
                     // 1. Set the -s parameter for exact resolution
                     options.resolution = exactResolutions[videoResolution];
                     
                     // 2. Also set the videoFilter for better aspect ratio handling
                     options.videoFilter = resolutionMap[videoResolution];
                     
                     console.log(`[Debug] Setting resolution to ${videoResolution}: ${options.resolution}, filter: ${options.videoFilter}`);
                 } else {
                     console.log(`[Debug] No resolution filter applied: resolution=${videoResolution}, codec=${videoCodec}`);
                 }
            }
           
            // --- Audio Options (multi-track) ---
            // Find all audio streams selected for keep or convert
            const audioStreamsToMap = probeData.streams
                .filter((s: StreamInfo) => 
                    s.codec_type === 'audio' && 
                    (selectedAudioTracks[s.index] === 'keep' || selectedAudioTracks[s.index] === 'convert')
                );
            
            // Setup for first audio stream (for backwards compatibility with the existing code)
            const firstAudioStream = audioStreamsToMap.length > 0 ? audioStreamsToMap[0] : undefined;
            
            // Generate multiple map strings
            if (audioStreamsToMap.length > 0) {
                // Get active preset for language ordering
                const activePreset = selectedPresetId !== 'custom' && availablePresets.length > 0 
                    ? availablePresets.find(p => p.id === selectedPresetId)
                    : null;
                
                // Convert stream info to DTO with stream index and language info
                const audioStreamDTOs = audioStreamsToMap.map(s => ({
                    streamIndex: s.index,
                    language: s.tags?.language?.toLowerCase() || '',
                    isOriginalTrack: probeData.streams
                        .filter(stream => stream.codec_type === 'audio')
                        .findIndex(stream => stream.index === s.index) === 0,
                    ffmpegIndex: probeData.streams
                         .filter(stream => stream.codec_type === 'audio')
                         .findIndex(stream => stream.index === s.index)
                }));
                
                // Sort streams according to the preset's language priorities
                if (activePreset && Array.isArray(activePreset.audioLanguageOrder) && activePreset.audioLanguageOrder.length > 0) {
                    console.log(`[Debug] Sorting audio streams according to preset "${activePreset.name}" language priorities:`, activePreset.audioLanguageOrder);
                    
                    // Create list of sorted streams
                    const sortedStreams: typeof audioStreamDTOs = [];
                    
                    // Process each language priority in order
                    for (const lang of activePreset.audioLanguageOrder) {
                        if (lang.toLowerCase() === 'original') {
                            // Find the original audio track (0:a:0)
                            const originalTrack = audioStreamDTOs.find(dto => dto.isOriginalTrack);
                            if (originalTrack && !sortedStreams.includes(originalTrack)) {
                                sortedStreams.push(originalTrack);
                                console.log(`[Debug] Added original track (${originalTrack.ffmpegIndex}) to position ${sortedStreams.length - 1}`);
                            }
                        } else {
                            // Find tracks matching this language
                            const langTracks = audioStreamDTOs.filter(
                                dto => dto.language === lang.toLowerCase() && !sortedStreams.includes(dto)
                            );
                            
                            // Add all matching tracks in their original order
                            for (const track of langTracks) {
                                sortedStreams.push(track);
                                console.log(`[Debug] Added ${lang} track (${track.ffmpegIndex}) to position ${sortedStreams.length - 1}`);
                            }
                        }
                    }
                    
                    // Add any remaining tracks that weren't in the preset
                    for (const track of audioStreamDTOs) {
                        if (!sortedStreams.includes(track)) {
                            sortedStreams.push(track);
                            console.log(`[Debug] Added remaining track (${track.ffmpegIndex}) to position ${sortedStreams.length - 1}`);
                        }
                    }
                    
                    // Replace the original array with the sorted one
                    audioStreamDTOs.length = 0;
                    audioStreamDTOs.push(...sortedStreams);
                    
                    // Detailed debug logging to help troubleshoot
                    console.log(`[Debug] Final Audio Track Order:`);
                    audioStreamDTOs.forEach((dto, idx) => {
                        console.log(`[Debug] Position ${idx}: Stream ${dto.streamIndex} (ffmpeg index ${dto.ffmpegIndex}): ` +
                            `Language="${dto.language}", IsOriginal=${dto.isOriginalTrack}`);
                    });
                }
                
                // Get the final mapping indices in the sorted order
                const mappedAudioIndices = audioStreamDTOs.map(dto => dto.ffmpegIndex);
                
                // Determine if we need to convert any audio streams
                const needsAudioConversion = audioStreamsToMap.some(
                    (s: StreamInfo) => selectedAudioTracks[s.index] === 'convert'
                );
                
                // DEBUG: Log the audio mapping information
                console.log(`[Debug] Final Audio Mapping Order: ${mappedAudioIndices.join(', ')}`);
                console.log(`[Debug] Audio streams that need conversion: ${needsAudioConversion}`);
                
                // Set audio codec based on selection - if any need conversion, use the selected codec
                if (needsAudioConversion) {
                    options.audioCodec = audioCodecConvert;
                    options.audioBitrate = audioBitrate;
                    
                    // Apply audio filter (for the first stream, as filters can't be easily applied to multiple tracks)
                    if (audioCodecConvert === 'eac3') {
                        // For EAC3, we don't want to remap channels, just preserve the original layout
                        options.audioFilter = ''; // No audio filter for EAC3
                        if (!audioBitrate.endsWith('k')) {
                            options.audioBitrate = `${audioBitrate}k`; // Ensure bitrate has 'k' suffix
                        }
                    } else {
                        // For other codecs like opus and aac, apply the audio layout filter
                        if (selectedAudioLayout === 'stereo') {
                            options.audioFilter = 'pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE';
                        } else if (selectedAudioLayout === 'mono') {
                            options.audioFilter = 'pan=mono|c0=0.5*FC+0.5*FL+0.5*FR+0.5*BL+0.5*BR+0.3*LFE';
                        } else if (selectedAudioLayout === 'surround5_1') {
                            options.audioFilter = 'channelmap=FL-FL|FR-FR|FC-FC|LFE-LFE|SL-BL|SR-BR:5.1';
                        }
                    }

                    // Add libopus mapping_family parameter for multichannel support
                    if (audioCodecConvert === 'libopus' && selectedAudioLayout === 'surround5_1') {
                        // Pass mapping_family for proper multichannel handling in libopus
                        options.audioOptions = ['-mapping_family:a', '255', '-application:a', 'audio'];
                    } else {
                        options.audioOptions = undefined;
                    }
                } else if (audioStreamsToMap.length > 0) {
                    // If all selected tracks are 'keep', set codec to copy
                    options.audioCodec = 'copy';
                    options.audioBitrate = undefined;
                    options.audioFilter = undefined;
                }
                
                // Set map strings for all audio streams
                options.mapAudio = mappedAudioIndices.map(idx => `0:a:${idx}`).join(';');
                console.log(`[Debug] Final Audio Map String: ${options.mapAudio}`);
            } else {
                // No audio tracks selected
                options.mapAudio = undefined;
                options.audioCodec = undefined;
                options.audioBitrate = undefined;
                options.audioFilter = undefined;
            }

            // --- Subtitle Options (handle multiple selections) ---
            const subtitlesToMap = probeData.streams
                .filter((s: StreamInfo) => 
                    s.codec_type === 'subtitle' && 
                    (selectedSubtitleTracks[s.index] === 'keep' || selectedSubtitleTracks[s.index] === 'convert')
                );
            
            // Early return if no subtitles selected
            if (subtitlesToMap.length === 0) {
                options.mapSubtitle = undefined;
                options.subtitleCodec = undefined;
            } else {
                // Get active preset for subtitle ordering
                const activePreset = selectedPresetId !== 'custom' && availablePresets.length > 0 
                    ? availablePresets.find(p => p.id === selectedPresetId)
                    : null;
                
                // Convert subtitle streams to DTOs with metadata
                let subtitleStreamDTOs = subtitlesToMap.map(s => {
                    // Identify subtitle type - look for keywords in the title or disposition
                    const subtitleType = getSubtitleType(s);
                    console.log(`[Debug] Subtitle ${s.index}: Language=${s.tags?.language || 'unknown'}, Title="${s.tags?.title || ''}", Detected Type=${subtitleType}`);
                    
                    return {
                        streamIndex: s.index,
                        language: s.tags?.language?.toLowerCase() || '',
                        title: s.tags?.title || '',
                        disposition: s.disposition || {},
                        ffmpegIndex: probeData.streams
                            .filter(stream => stream.codec_type === 'subtitle')
                            .findIndex(stream => stream.index === s.index),
                        type: subtitleType,
                        action: selectedSubtitleTracks[s.index] // 'keep' or 'convert'
                    };
                });
                
                // Sort the subtitle streams if we have a preset with subtitle priorities
                if (activePreset) {
                    subtitleStreamDTOs = orderSubtitlesByPreset(subtitleStreamDTOs, activePreset);
                    console.log(`[Debug] Sorted subtitle streams according to preset "${activePreset.name}" priorities:`, 
                        subtitleStreamDTOs.map(s => `${s.language}:${s.type}`));
                }
                
                // Generate mapping strings for the sorted subtitles
                options.mapSubtitle = subtitleStreamDTOs.map(dto => `0:s:${dto.ffmpegIndex}`);
                
                // Determine codec based on the actions
                const needsConversion = subtitleStreamDTOs.some(dto => dto.action === 'convert');
                options.subtitleCodec = needsConversion ? subtitleCodecConvert : 'copy';
                
                // Debug log final subtitle mapping
                console.log(`[Debug] Final Subtitle Mapping Generated: ${options.mapSubtitle.join(', ')}`);
                console.log(`[Debug] Final Subtitle Codec: ${options.subtitleCodec}`);
            }

            // --- Log and Execute --- 
            setStatus('Starting encoding process...');
            console.log("Sending encoding options:", JSON.stringify(options, null, 2));
            
            if (!electronAPI?.startEncodingProcess) {
                throw new Error("startEncodingProcess function is not available");
            }
            // Use type assertion to bypass the type check
            const result = await electronAPI.startEncodingProcess(options as any);
            setLastResult(result);
            setLastJobId(result.jobId || null); // Store the jobId from the result
            if (!result.success) {
                setStatus(`Encoding failed: ${result.error || 'Unknown error'}`);
            }

        } catch (error) {
            console.error('Encoding error:', error);
            const message = error instanceof Error ? error.message : String(error);
            setStatus(`Error: ${message}`);
            setLastResult({ success: false, error: message });
        } finally {
            setIsEncoding(false);
            // Don't reset start time here, keep final elapsed time displayed
        }
    };

    // Handle dialog cancellation
    const handleDialogCancel = () => {
        setProcessedDialogOpen(false);
        
        if (!isReencodingDialog) {
            // This was the initial dialog when selecting the file
            setInputPath('');
            setOutputPath('');
            setProbeData(null);
            setStatus('Operation cancelled - file was already encoded');
        } else {
            // This was the dialog when trying to start encoding
            setStatus('Encoding cancelled - file was already processed');
        }
    };
    
    // Handle dialog confirmation - update to call async startEncodingProcess
    const handleDialogConfirm = () => {
        setProcessedDialogOpen(false);
        
        if (isReencodingDialog) {
            // User confirmed re-encoding, proceed with the encoding process
            void startEncodingProcess();
        } else {
            // This was the initial warning, continue with probe data setup
            const audioDefaults: { [index: number]: TrackAction } = {};
            const subtitleDefaults: { [index: number]: TrackAction } = {};
            let firstAudioFound = false;
            
            if (probeData) {
                probeData.streams.forEach((stream: StreamInfo) => {
                    if (stream.codec_type === 'audio') {
                        audioDefaults[stream.index] = !firstAudioFound ? 'convert' : 'discard';
                        firstAudioFound = true;
                    }
                    if (stream.codec_type === 'subtitle') {
                        subtitleDefaults[stream.index] = (stream.tags?.language?.toLowerCase() === 'eng') ? 'keep' : 'discard';
                    }
                });
                setSelectedAudioTracks(audioDefaults);
                setSelectedSubtitleTracks(subtitleDefaults);
                setStatus('Probe complete. Configure options.');
            }
        }
    };

    // --- New function to handle viewing the log ---
    const handleViewLog = async () => {
        if (!lastJobId) return;
        setIsFetchingLog(true);
        setLogContent(null);
        try {
            if (!electronAPI?.getEncodingLog) {
                throw new Error("getEncodingLog function is not available on electronAPI");
            }
            const fetchedLog = await electronAPI.getEncodingLog(lastJobId);
            setLogContent(fetchedLog ?? "Log content not found or empty.");
        } catch (error) {
            console.error("Error fetching log:", error);
            setLogContent(`Error fetching log: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsFetchingLog(false);
        }
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
                        <CardTitle className="text-xl">Source & Destination</CardTitle>
                        <CardDescription>Select input, output, and optionally apply an encoding preset</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="input-file" className="text-sm font-medium">Input File</Label>
                                <div className="flex gap-3">
                                    <Input 
                                        id="input-file" 
                                        value={inputPath} 
                                        readOnly 
                                        placeholder="Select input file..." 
                                        className="bg-background/50"
                                    />
                                    <Button 
                                        onClick={handleFileSelect} 
                                        disabled={isEncoding || isProbing}
                                        variant="outline"
                                        className="min-w-[100px]"
                                    >
                                        {isProbing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} 
                                        Browse
                                    </Button>
                                </div>
                            </div>

                            {/* Save As New Option */}
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="save-as-new"
                                    checked={saveAsNew}
                                    onCheckedChange={(checked) => {
                                        setSaveAsNew(checked as boolean);
                                        if (!checked) {
                                            setOutputPath(inputPath); // Reset output path to input path when unchecking
                                        }
                                    }}
                                    disabled={isEncoding}
                                />
                                <Label
                                    htmlFor="save-as-new"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Save as New File
                                </Label>
                            </div>

                            {/* Output File Section - Only shown when saveAsNew is true */}
                            {saveAsNew && (
                                <div className="space-y-2">
                                    <Label htmlFor="output-file" className="text-sm font-medium">Output File</Label>
                                    <div className="flex gap-3">
                                        <Input 
                                            id="output-file" 
                                            value={outputPath} 
                                            onChange={e => setOutputPath(e.target.value)} 
                                            placeholder="Select or type output file..." 
                                            disabled={isEncoding}
                                            className="bg-background/50"
                                        />
                                        <Button 
                                            onClick={handleSelectOutputFile} 
                                            disabled={isEncoding || isProbing}
                                            variant="outline"
                                            className="min-w-[100px]"
                                        >
                                            Browse
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* --- Preset Dropdown (New Position) --- */}
                            <div className="space-y-2 pt-2"> {/* Added pt-2 for spacing */} 
                                <Label htmlFor="preset-select" className="text-sm font-medium">Encoding Preset</Label>
                                <Select 
                                    value={selectedPresetId} 
                                    onValueChange={applyPreset} // Call applyPreset when selection changes
                                    disabled={isEncoding || isProbing || availablePresets.length === 0} // Disable if encoding or no presets
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
                                {/* Display message only if no presets are available after initial load attempt */}
                                {availablePresets.length === 0 && (
                                    <p className="text-xs text-muted-foreground">No presets found. Create presets in the Presets page.</p>
                                )}
                            </div>
                            {/* --- End Preset Dropdown (New Position) --- */}

                            {isProbing && (
                                <p className="text-sm text-muted-foreground flex items-center">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                                    Analyzing file...
                                </p>
                            )}
                            {probeError && (
                                <Alert variant="destructive" className="bg-destructive/10 border-none">
                                    <AlertDescription>{probeError}</AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* --- Conditionally Render Encoding Settings Card --- */}
                {selectedPresetId === 'custom' && (
                    <Card className="border-none shadow-sm bg-card/50">
                        <CardHeader>
                            <CardTitle className="text-xl">Encoding Settings</CardTitle>
                            <CardDescription>Configure video and audio conversion parameters</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            {/* Video Settings */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-lg text-foreground/90">Video Settings</h3>
                                    <Badge variant="outline" className="font-normal">Primary</Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-sm">Codec</Label>
                                            <Select value={videoCodec} onValueChange={(value: VideoCodec) => setVideoCodec(value)} disabled={isEncoding}>
                                                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                                <SelectContent>{VIDEO_CODECS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-sm">Preset</Label>
                                            <Select value={videoPreset} onValueChange={(value: VideoPreset) => setVideoPreset(value)} disabled={isEncoding || videoCodec === 'copy'}>
                                                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                                <SelectContent>{VIDEO_PRESETS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-sm">Resolution</Label>
                                            <Select value={videoResolution} onValueChange={(value: VideoResolution) => setVideoResolution(value)} disabled={isEncoding || videoCodec === 'copy'}>
                                                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="original">Original</SelectItem>
                                                    <SelectItem value="480p">480p (SD)</SelectItem>
                                                    <SelectItem value="720p">720p (HD)</SelectItem>
                                                    <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                                                    <SelectItem value="1440p">1440p (QHD)</SelectItem>
                                                    <SelectItem value="2160p">2160p (4K UHD)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
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
                                            <p className="text-xs text-muted-foreground">Lower values produce better quality but larger files</p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-sm">Hardware Acceleration</Label>
                                            <Select value={hwAccel} onValueChange={(value: HwAccel) => setHwAccel(value)} disabled={isEncoding}>
                                                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                                <SelectContent>{HW_ACCEL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Separator className="bg-border/50" />

                            {/* Audio Settings */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-lg text-foreground/90">Audio Settings</h3>
                                    <Badge variant="outline" className="font-normal">For Converted Tracks</Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-sm">Codec</Label>
                                            <Select value={audioCodecConvert} onValueChange={(value: AudioCodecConvert) => setAudioCodecConvert(value)} disabled={isEncoding}>
                                                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                                <SelectContent>{AUDIO_CODECS_CONVERT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-sm">Bitrate</Label>
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
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-sm">Channel Layout</Label>
                                            <Select value={selectedAudioLayout} onValueChange={(value: AudioLayout) => setSelectedAudioLayout(value)} disabled={isEncoding}>
                                                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="stereo">Stereo (Downmix)</SelectItem>
                                                    <SelectItem value="mono">Mono (Downmix)</SelectItem>
                                                    <SelectItem value="surround5_1">5.1 Surround (Remap)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-sm">Subtitle Format</Label>
                                            <Select value={subtitleCodecConvert} onValueChange={(value: SubtitleCodecConvert) => setSubtitleCodecConvert(value)} disabled={isEncoding}>
                                                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                                <SelectContent>{SUBTITLE_CODECS_CONVERT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )} 
                {/* --- End Conditional Render --- */}

                {/* Track Selection Card - Conditionally render */}
                {selectedPresetId === 'custom' && probeData && (
                    <Card className="border-none shadow-sm bg-card/50">
                        <CardHeader>
                            <CardTitle className="text-xl">Track Selection</CardTitle>
                            <CardDescription>Choose which audio and subtitle tracks to include</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Audio Track Selection */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Audio Tracks</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full justify-between bg-background/50 h-auto py-4"
                                            >
                                                <div className="flex flex-col items-start gap-1">
                                                    <div className="flex flex-wrap gap-1">
                                                        {selectedTracks.filter(t => t.type === 'audio').length > 0 ? (
                                                            selectedTracks
                                                                .filter(t => t.type === 'audio')
                                                                .map(track => (
                                                                    <Badge 
                                                                        key={`${track.type}-${track.index}`}
                                                                        variant="secondary"
                                                                        className={cn(
                                                                            "text-xs bg-indigo-500/10",
                                                                            track.action === 'convert' ? "border-dashed" : ""
                                                                        )}
                                                                    >
                                                                        🔊 {track.description}
                                                                        {track.action === 'convert' ? ' (Convert)' : ' (Copy)'}
                                                                    </Badge>
                                                                ))
                                                        ) : (
                                                            <span className="text-sm text-muted-foreground">No audio tracks selected</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-xs text-muted-foreground ml-2">Click to modify</span>
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[400px] p-0" side="bottom" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search audio tracks..." />
                                                <CommandEmpty>No audio tracks found.</CommandEmpty>
                                                <ScrollArea className="h-[300px]">
                                                    <CommandGroup>
                                                        {probeData.streams
                                                            .filter((s: StreamInfo) => s.codec_type === 'audio')
                                                            .map((stream: StreamInfo) => (
                                                                <CommandItem key={`audio-${stream.index}`} className="flex flex-col items-start p-2">
                                                                    <div className="flex items-center justify-between w-full">
                                                                        <span className="text-sm">{getStreamDescription(stream)}</span>
                                                                        <Select
                                                                            value={selectedAudioTracks[stream.index] || 'discard'}
                                                                            onValueChange={(value: TrackAction) => handleTrackActionChange({ 
                                                                                index: stream.index, 
                                                                                description: getStreamDescription(stream),
                                                                                type: 'audio',
                                                                                action: value as TrackAction 
                                                                            }, value as TrackAction)}
                                                                        >
                                                                            <SelectTrigger className="h-7 w-[100px]">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="convert">Convert</SelectItem>
                                                                                <SelectItem value="keep">Keep</SelectItem>
                                                                                <SelectItem value="discard">Discard</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                </CommandItem>
                                                            ))}
                                                    </CommandGroup>
                                                </ScrollArea>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    <p className="text-xs text-muted-foreground">
                                        {Object.values(selectedAudioTracks).filter(action => action !== 'discard').length} of {probeData.streams.filter(s => s.codec_type === 'audio').length} audio tracks selected
                                    </p>
                                </div>

                                {/* Subtitle Track Selection */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Subtitle Tracks</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                             <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full justify-between bg-background/50 h-auto py-4"
                                            >
                                                <div className="flex flex-col items-start gap-1">
                                                    <div className="flex flex-wrap gap-1">
                                                        {selectedTracks.filter(t => t.type === 'subtitle').length > 0 ? (
                                                            selectedTracks
                                                                .filter(t => t.type === 'subtitle')
                                                                .map(track => (
                                                                    <Badge 
                                                                        key={`${track.type}-${track.index}`}
                                                                        variant="secondary"
                                                                        className={cn(
                                                                            "text-xs bg-emerald-500/10",
                                                                            track.action === 'convert' ? "border-dashed" : ""
                                                                        )}
                                                                    >
                                                                        💬 {track.description}
                                                                        {track.action === 'convert' ? ' (Convert)' : ' (Copy)'}
                                                                    </Badge>
                                                                ))
                                                        ) : (
                                                            <span className="text-sm text-muted-foreground">No subtitle tracks selected</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-xs text-muted-foreground ml-2">Click to modify</span>
                                            </Button>
                                        </PopoverTrigger>
                                         <PopoverContent className="w-[400px] p-0" side="bottom" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search subtitle tracks..." />
                                                <CommandEmpty>No subtitle tracks found.</CommandEmpty>
                                                <ScrollArea className="h-[300px]">
                                                    <CommandGroup>
                                                        {probeData.streams
                                                            .filter((s: StreamInfo) => s.codec_type === 'subtitle')
                                                            .map((stream: StreamInfo) => (
                                                                <CommandItem key={`subtitle-${stream.index}`} className="flex flex-col items-start p-2">
                                                                    <div className="flex items-center justify-between w-full">
                                                                        <span className="text-sm">{getStreamDescription(stream)}</span>
                                                                        <Select
                                                                            value={selectedSubtitleTracks[stream.index] || 'discard'}
                                                                            onValueChange={(value: TrackAction) => handleTrackActionChange({
                                                                                index: stream.index,
                                                                                description: getStreamDescription(stream),
                                                                                type: 'subtitle',
                                                                                action: value as TrackAction
                                                                            }, value as TrackAction)}
                                                                        >
                                                                            <SelectTrigger className="h-7 w-[100px]">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="convert">Convert</SelectItem>
                                                                                <SelectItem value="keep">Keep</SelectItem>
                                                                                <SelectItem value="discard">Discard</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                </CommandItem>
                                                            ))}
                                                    </CommandGroup>
                                                </ScrollArea>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    <p className="text-xs text-muted-foreground">
                                        {Object.values(selectedSubtitleTracks).filter(action => action !== 'discard').length} of {probeData.streams.filter(s => s.codec_type === 'subtitle').length} subtitle tracks selected
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Start Encode Button */}
                <div className="flex justify-end">
                    <Button
                        onClick={handleStartEncoding}
                        disabled={isEncoding || isProbing || !inputPath || !outputPath || !probeData}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8"
                    >
                        {isEncoding ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encoding...</>
                        ) : (
                            'Start Encode'
                        )}
                    </Button>
                </div>

                {/* Progress Card */}
                {(percent !== undefined || status || lastResult) && (
                    <Card className="border-none shadow-sm bg-card/50">
                        <CardHeader>
                            <CardTitle className="text-xl">Encoding Progress</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {percent !== undefined && (
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-sm mb-2">
                                        <span className="text-muted-foreground">Progress</span>
                                        <span className="font-medium">{percent.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-background/50 rounded-full h-2">
                                        <div 
                                            className="bg-indigo-600 h-2 rounded-full transition-all duration-150 ease-out" 
                                            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} 
                                        />
                                    </div>
                                </div>
                            )}
                            
                            <div className="grid grid-cols-3 gap-6">
                                {fps !== undefined && (
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Speed</Label>
                                        <p className="text-sm font-medium">{fps.toFixed(1)} FPS</p>
                                    </div>
                                )}
                                {frame !== undefined && (
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Frames</Label>
                                        <p className="text-sm font-medium">
                                            {frame.toLocaleString()}{totalFrames ? ` / ${totalFrames.toLocaleString()}` : ''}
                                        </p>
                                    </div>
                                )}
                                {elapsedTimeString && (
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Time</Label>
                                        <p className="text-sm font-medium">{elapsedTimeString}</p>
                                    </div>
                                )}
                            </div>
                            
                            {status && (
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Status</Label>
                                    <p className="text-sm">{status}</p>
                                </div>
                            )}

                            {lastResult && (
                                <div className="space-y-3">
                                    {/* --- Last Result Header with View Log Button --- */}
                                    <div className="flex justify-between items-center">
                                        <Label className="text-xs text-muted-foreground">Last Result</Label>
                                        {lastJobId && (
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={handleViewLog} 
                                                        disabled={isFetchingLog}
                                                    >
                                                        {isFetchingLog ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                                                        View Log
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="max-w-3xl max-h-[80vh] w-full flex flex-col fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] p-6">
                                                    <DialogHeader className="mb-4">
                                                        <DialogTitle>Encoding Log (Job ID: {lastJobId})</DialogTitle>
                                                    </DialogHeader>
                                                    <div className="flex-1 min-h-0">
                                                        <ScrollArea className="h-[calc(80vh-10rem)]">
                                                            <pre className="text-xs p-4 bg-muted/50 rounded whitespace-pre-wrap break-words">
                                                                {logContent ?? 'Loading log...'}
                                                            </pre>
                                                        </ScrollArea>
                                                    </div>
                                                    <DialogFooter className="sm:justify-end mt-6">
                                                        <DialogClose asChild>
                                                            <Button type="button" variant="secondary">
                                                                Close
                                                            </Button>
                                                        </DialogClose>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        )}
                                    </div>
                                    {/* --- End Header --- */}

                                    {/* ... Rest of Last Result Display ... */}
                                    <div className="text-sm space-y-2 bg-background/50 p-4 rounded-lg">
                                        <p>Status: <span className={lastResult.success ? 'text-green-500' : 'text-red-500'}>
                                            {lastResult.success ? 'Completed' : 'Failed'}
                                        </span></p>
                                        {lastResult.outputPath && (
                                            <p className="font-mono text-xs truncate" title={lastResult.outputPath}>
                                                Output: {lastResult.outputPath}
                                            </p>
                                        )}
                                        {lastResult.initialSizeMB !== undefined && (
                                            <p>Initial Size: {lastResult.initialSizeMB.toFixed(2)} MB</p>
                                        )}
                                        {lastResult.finalSizeMB !== undefined && (
                                            <p>Final Size: {lastResult.finalSizeMB.toFixed(2)} MB</p>
                                        )}
                                        {lastResult.reductionPercent !== undefined && (
                                            <p>Reduction: {lastResult.reductionPercent.toFixed(2)}%</p>
                                        )}
                                        {lastResult.error && (
                                            <p className="text-red-500">Error: {lastResult.error}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Add the custom dialog component with proper null checking */}
            {probeData?.processedByRecodarr?.processed && (
                <ProcessedFileDialog
                    isOpen={processedDialogOpen}
                    onOpenChange={setProcessedDialogOpen}
                    title={isReencodingDialog ? "WARNING: File Already Processed" : "File Already Processed"}
                    message={isReencodingDialog 
                        ? "This file has already been processed by Recodarr. Re-encoding will cause quality degradation!"
                        : "This file has already been processed by Recodarr"}
                    date={probeData?.processedByRecodarr?.date || "Unknown"}
                    videoCodec={probeData?.processedByRecodarr?.videoCodec || "Unknown"}
                    audioCodec={probeData?.processedByRecodarr?.audioCodec || "Unknown"}
                    onCancel={handleDialogCancel}
                    onConfirm={handleDialogConfirm}
                    cancelLabel="Cancel"
                    confirmLabel={isReencodingDialog ? "Proceed Anyway" : "I understand"}
                    isReencode={isReencodingDialog}
                />
            )}
        </div>
    );
};

// Helper function to format seconds into HH:MM:SS
const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0')
    ].join(':');
};

// Fix type definition issue - create a proper FileDialogOptions type
interface FileDialogOptions {
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>;
  filters?: Array<{ name: string; extensions: string[] }>;
}

interface FileDialogResult {
  canceled: boolean;
  filePaths: string[];
}

// Add this helper function
// Function to determine subtitle type from stream info
const getSubtitleType = (stream: StreamInfo): SubtitleType => {
    return getSubtitleTypeUtil(stream) as SubtitleType;
};

export default ManualEncode; // Renamed export 