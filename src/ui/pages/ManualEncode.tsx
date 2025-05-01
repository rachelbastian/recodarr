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
import { Loader2 } from 'lucide-react';
import type { 
    IElectronAPI, 
    ProbeData,
    StreamInfo,
    EncodingPreset
} from '../../types';
import { loadPresets as loadPresetsUtil, getPresetById, getDefaultEncodingOptions, getAudioTrackActions, getSubtitleTrackActions } from '@/utils/presetUtil.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";

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
    // Input/Output State
    const [inputPath, setInputPath] = useState<string>('');
    const [outputPath, setOutputPath] = useState<string>('');
    const [saveAsNew, setSaveAsNew] = useState(false);
    
    // Probing State
    const [isProbing, setIsProbing] = useState(false);
    const [probeData, setProbeData] = useState<ProbeData | null>(null);
    const [probeError, setProbeError] = useState<string | null>(null);
    
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
    
    // Track Selection State
    const [selectedAudioTracks, setSelectedAudioTracks] = useState<{ [index: number]: TrackAction }>({});
    const [selectedSubtitleTracks, setSelectedSubtitleTracks] = useState<{ [index: number]: TrackAction }>({});
    const [selectedTracks, setSelectedTracks] = useState<TrackOption[]>([]);
    const [trackSelectOpen, setTrackSelectOpen] = useState(false);
    
    // Status State
    const [status, setStatus] = useState<string>('Ready to encode');
    const [isEncoding, setIsEncoding] = useState(false);

    // Progress tracking
    const [progress, setProgress] = useState(0);
    const [fps, setFps] = useState<number | null>(null);
    const [currentFrame, setCurrentFrame] = useState<number | null>(null);
    const [totalFrames, setTotalFrames] = useState<number | null>(null);

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
            
            // If we have probeData, also apply track selection based on preset
            if (probeData?.streams) {
                const audioDefaults = getAudioTrackActions(probeData.streams, preset);
                const subtitleDefaults = getSubtitleTrackActions(probeData.streams, preset);
                
                setSelectedAudioTracks(audioDefaults);
                setSelectedSubtitleTracks(subtitleDefaults);
            }
        }
    }, [availablePresets, probeData]);

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
                
                // Start probing the selected file
                probeSelectedFile(filePath);
            }
        } catch (error) {
            setStatus(`Error selecting input file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [probeSelectedFile]);
    
    // Handle start encoding
    const handleStartEncoding = useCallback(async () => {
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
            
            // Set up resolution filter based on selected resolution
            let videoFilter: string | undefined;
            let resolution: string | undefined;
            
            if (videoCodec !== 'copy' && videoResolution !== 'original') {
                // Define resolution mapping with explicit values for scale filter
                const resolutionMap: Record<string, string> = {
                    '480p': 'scale=w=-2:h=480',
                    '720p': 'scale=w=-2:h=720',
                    '1080p': 'scale=w=-2:h=1080',
                    '1440p': 'scale=w=-2:h=1440',
                    '2160p': 'scale=w=-2:h=2160'
                };
                
                // Define exact resolutions (width x height)
                const exactResolutions: Record<string, string> = {
                    '480p': '854x480',    // 16:9 aspect for 480p
                    '720p': '1280x720',   // 720p HD
                    '1080p': '1920x1080', // 1080p Full HD
                    '1440p': '2560x1440', // 1440p QHD
                    '2160p': '3840x2160'  // 4K UHD
                };
                
                videoFilter = resolutionMap[videoResolution];
                resolution = exactResolutions[videoResolution];
            }
            
            // Handle audio track ordering according to language preferences
            const selectedAudioStreams = probeData.streams
                .filter(stream => stream.codec_type === 'audio' && selectedAudioTracks[stream.index] !== 'discard')
                .map(stream => ({
                    stream,
                    index: stream.index,
                    language: stream.tags?.language?.toLowerCase() || '',
                    isOriginalTrack: probeData.streams
                        .filter(s => s.codec_type === 'audio')
                        .findIndex(s => s.index === stream.index) === 0,
                    ffmpegIndex: probeData.streams
                        .filter(s => s.codec_type === 'audio')
                        .findIndex(s => s.index === stream.index)
                }));
            
            // Sort audio streams according to language preferences
            if (preset && Array.isArray(preset.audioLanguageOrder) && preset.audioLanguageOrder.length > 0) {
                const audioOrder = preset.audioLanguageOrder; // Store in variable to satisfy TypeScript
                selectedAudioStreams.sort((a, b) => {
                    const aLang = a.language;
                    const bLang = b.language;
                    const aIsOriginal = a.isOriginalTrack;
                    const bIsOriginal = b.isOriginalTrack;
                    
                    // Check if languages are in the preset's order
                    const aIndex = audioOrder.findIndex(
                        lang => lang.toLowerCase() === 'original' ? aIsOriginal : lang.toLowerCase() === aLang
                    );
                    const bIndex = audioOrder.findIndex(
                        lang => lang.toLowerCase() === 'original' ? bIsOriginal : lang.toLowerCase() === bLang
                    );
                    
                    // Rest of the comparison logic
                    if (aIndex >= 0 && bIndex >= 0) {
                        return aIndex - bIndex;
                    }
                    
                    if (aIndex >= 0) return -1;
                    if (bIndex >= 0) return 1;
                    
                    return a.ffmpegIndex - b.ffmpegIndex;
                });
            }
            
            // Handle subtitle track ordering according to language and type preferences
            const selectedSubtitleStreams = probeData.streams
                .filter(stream => stream.codec_type === 'subtitle' && selectedSubtitleTracks[stream.index] !== 'discard')
                .map(stream => {
                    // Get subtitle type from stream
                    const getSubtitleTypeFromTags = (stream: StreamInfo): string => {
                        if (stream.disposition?.forced) return 'forced';
                        
                        const title = (stream.tags?.title || '').toLowerCase();
                        if (title.includes('sdh') || title.includes('hearing')) return 'sdh';
                        if (title.includes('cc') || title.includes('caption')) return 'cc';
                        if (title.includes('sign') || title.includes('text')) return 'signs';
                        if (title.includes('song') || title.includes('lyric')) return 'song';
                        
                        return 'normal';
                    };
                    
                    return {
                        stream,
                        index: stream.index,
                        language: stream.tags?.language?.toLowerCase() || '',
                        type: getSubtitleTypeFromTags(stream),
                        ffmpegIndex: probeData.streams
                            .filter(s => s.codec_type === 'subtitle')
                            .findIndex(s => s.index === stream.index)
                    };
                });
            
            // Sort subtitle streams according to language and type preferences
            if (preset) {
                // First prioritize by language
                if (Array.isArray(preset.subtitleLanguageOrder) && preset.subtitleLanguageOrder.length > 0) {
                    selectedSubtitleStreams.sort((a, b) => {
                        const aLang = a.language;
                        const bLang = b.language;
                        
                        const aIndex = preset.subtitleLanguageOrder?.findIndex(
                            lang => lang.toLowerCase() === aLang
                        ) ?? -1;
                        const bIndex = preset.subtitleLanguageOrder?.findIndex(
                            lang => lang.toLowerCase() === bLang
                        ) ?? -1;
                        
                        // If both languages are in the preset, sort by preset order
                        if (aIndex >= 0 && bIndex >= 0) {
                            // If same language, don't change order yet (will sort by type later)
                            if (aIndex === bIndex) return 0;
                            return aIndex - bIndex;
                        }
                        
                        // If only one language is in preset, prioritize it
                        if (aIndex >= 0) return -1;
                        if (bIndex >= 0) return 1;
                        
                        // If neither language is in preset, keep original order
                        return a.ffmpegIndex - b.ffmpegIndex;
                    });
                }
                
                // Then sort by subtitle type within each language group
                if (Array.isArray(preset.subtitleTypeOrder) && preset.subtitleTypeOrder.length > 0) {
                    // Group by language first
                    const subtitlesByLanguage: {[lang: string]: typeof selectedSubtitleStreams} = {};
                    
                    selectedSubtitleStreams.forEach(sub => {
                        if (!subtitlesByLanguage[sub.language]) {
                            subtitlesByLanguage[sub.language] = [];
                        }
                        subtitlesByLanguage[sub.language].push(sub);
                    });
                    
                    // Sort each language group by type preference
                    Object.keys(subtitlesByLanguage).forEach(lang => {
                        subtitlesByLanguage[lang].sort((a, b) => {
                            const aType = a.type;
                            const bType = b.type;
                            
                            const aIndex = preset.subtitleTypeOrder?.indexOf(aType as any) ?? -1;
                            const bIndex = preset.subtitleTypeOrder?.indexOf(bType as any) ?? -1;
                            
                            // If both types are in the preset, sort by preset order
                            if (aIndex >= 0 && bIndex >= 0) {
                                return aIndex - bIndex;
                            }
                            
                            // If only one type is in preset, prioritize it
                            if (aIndex >= 0) return -1;
                            if (bIndex >= 0) return 1;
                            
                            // If neither type is in preset, keep original order
                            return a.ffmpegIndex - b.ffmpegIndex;
                        });
                    });
                    
                    // Flatten the grouped and sorted subtitles back to a single array
                    selectedSubtitleStreams.length = 0;
                    Object.keys(subtitlesByLanguage).forEach(lang => {
                        selectedSubtitleStreams.push(...subtitlesByLanguage[lang]);
                    });
                }
            }
            
            // Use the electronAPI to create and start the encoding job
            const result = await electronAPI.startEncodingProcess({
                inputPath,
                outputPath: saveAsNew ? outputPath : inputPath,
                overwriteInput: !saveAsNew,
                videoCodec,
                videoPreset: videoCodec !== 'copy' ? videoPreset : undefined,
                videoQuality: videoCodec !== 'copy' ? videoQuality : undefined,
                videoFilter,      // Add video filter for resolution scaling
                resolution,       // Add explicit resolution
                hwAccel,
                audioCodec: audioCodecConvert,
                audioBitrate,
                audioFilter: (() => {
                    // Set appropriate audio filter based on codec and layout
                    if (audioCodecConvert === 'eac3') {
                        // For EAC3, no remapping
                        return undefined;
                    } else if (audioCodecConvert === 'libopus') {
                        // For Opus, apply appropriate channel layout
                        if (selectedAudioLayout === 'stereo') {
                            return 'pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE';
                        } else if (selectedAudioLayout === 'mono') {
                            return 'pan=mono|c0=0.5*FC+0.5*FL+0.5*FR+0.5*BL+0.5*BR+0.3*LFE';
                        } else if (selectedAudioLayout === 'surround5_1') {
                            return 'channelmap=FL-FL|FR-FR|FC-FC|LFE-LFE|SL-BL|SR-BR:5.1';
                        }
                    } else {
                        // Default audio filters for other codecs
                        if (selectedAudioLayout === 'stereo') {
                            return 'pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE';
                        } else if (selectedAudioLayout === 'mono') {
                            return 'pan=mono|c0=0.5*FC+0.5*FL+0.5*FR+0.5*BL+0.5*BR+0.3*LFE';
                        }
                    }
                    return undefined;
                })(),
                // Add any additional audio options needed for libopus multichannel
                audioOptions: audioCodecConvert === 'libopus' && selectedAudioLayout === 'surround5_1' 
                    ? ['-mapping_family:a', '255', '-application:a', 'audio'] 
                    : undefined,
                // Map tracks in the preferred order
                mapVideo: '0:v:0', // First video stream
                mapAudio: selectedAudioStreams
                    .map(stream => `0:a:${stream.ffmpegIndex}`)
                    .join(';'),
                mapSubtitle: selectedSubtitleStreams
                    .map(stream => `0:s:${stream.ffmpegIndex}`),
                subtitleCodec: (() => {
                    // Check if any subtitles are marked for conversion
                    const hasSubtitlesToConvert = Object.values(selectedSubtitleTracks).includes('convert');
                    // If so, use the preset conversion format, otherwise copy
                    return hasSubtitlesToConvert ? (preset?.subtitleCodecConvert || 'srt') : 'copy';
                })(),
            });
            
            if (result.success) {
                setStatus(`Encoding completed successfully! File saved to: ${result.outputPath}`);
            } else {
                setStatus(`Encoding failed: ${result.error}`);
            }
        } catch (error) {
            console.error("Encoding error:", error);
            setStatus(`Encoding error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsEncoding(false);
        }
    }, [inputPath, outputPath, saveAsNew, probeData, selectedAudioTracks, selectedSubtitleTracks, 
        videoCodec, videoPreset, videoQuality, videoResolution, hwAccel, audioCodecConvert, audioBitrate, selectedAudioLayout,
        availablePresets, selectedPresetId, audioLanguageOrder]);

    // Subscribe to encoding progress
    useEffect(() => {
        if (!isEncoding) return;
        
        // Clear previous progress
        setProgress(0);
        setFps(null);
        setCurrentFrame(null);
        setTotalFrames(null);
        
        // Subscribe to progress updates
        const unsubscribe = electronAPI.subscribeEncodingProgress((data: any) => {
            // Use type assertion to handle API variations
            if (data.percent !== undefined) {
                setProgress(data.percent);
            } else if (data.progress !== undefined) {
                setProgress(data.progress);
            }
            
            if (data.fps !== undefined) {
                setFps(data.fps);
            }
            if (data.frame !== undefined) {
                setCurrentFrame(data.frame);
            }
            if (data.totalFrames !== undefined) {
                setTotalFrames(data.totalFrames);
            }
            if (data.status) {
                setStatus(data.status);
            }
        });
        
        // Cleanup subscription when component unmounts or encoding stops
        return () => {
            unsubscribe();
        };
    }, [isEncoding]);

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
                                        onClick={handleSelectInputFile} 
                                        variant="outline"
                                        className="min-w-[100px]"
                                        disabled={isEncoding}
                                    >
                                        {isProbing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Browse
                                    </Button>
                                </div>
                            </div>
                            
                            {/* Preset Dropdown */}
                            <div className="space-y-2 pt-2">
                                <Label htmlFor="preset-select" className="text-sm font-medium">Encoding Preset</Label>
                                <Select 
                                    value={selectedPresetId} 
                                    onValueChange={applyPreset}
                                    disabled={isEncoding || availablePresets.length === 0}
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
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Tracks Card - Only shown when we have probe data */}
                {probeData && (
                    <Card className="border-none shadow-sm bg-card/50">
                        <CardHeader>
                            <CardTitle className="text-xl">Track Selection</CardTitle>
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

                {/* Video Settings Card */}
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
                        </div>
                    </CardContent>
                </Card>

                {/* Start Encoding Button */}
                <div className="flex justify-end">
                    <Button 
                        onClick={handleStartEncoding} 
                        disabled={!inputPath || isEncoding || isProbing || !probeData} 
                        className="bg-primary hover:bg-primary/90"
                    >
                        {isEncoding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Start Encoding
                    </Button>
                </div>

                {/* Status Display with Progress Bar */}
                <div className="bg-card/50 p-4 rounded-md">
                    <div className="flex flex-col gap-2">
                        <p className="text-sm">Status: {status}</p>
                        
                        {isEncoding && (
                            <>
                                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
                                    <div 
                                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" 
                                        style={{ width: `${progress}%` }}
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
                
                {probeError && (
                    <Alert variant="destructive" className="bg-destructive/10 border-none">
                        <AlertDescription>{probeError}</AlertDescription>
                    </Alert>
                )}
            </div>
            
            {/* Track Selection Dialog */}
            <Dialog open={trackSelectOpen} onOpenChange={setTrackSelectOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Select Tracks</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
                        {probeData?.streams
                            .filter(s => s.codec_type === 'audio' || s.codec_type === 'subtitle')
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