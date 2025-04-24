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
import { Loader2 } from 'lucide-react'; // For loading indicators
// --- Import Types Explicitly ---
import type { 
    IElectronAPI, 
    ProbeData, 
    StreamInfo, 
    EncodingOptions, 
    EncodingResult 
} from '../../types'; // Adjust path if needed

// Extend the EncodingOptions interface to add audioOptions
interface ExtendedEncodingOptions extends EncodingOptions {
    audioOptions?: string[]; // Add support for additional audio codec options
}

// Cast window.electron to the imported type
const electronAPI = window.electron as IElectronAPI;

interface EncodingProgressUpdate {
    progress?: number;
    status?: string;
}

// --- Constants for UI Options --- 
const VIDEO_CODECS = ['hevc_qsv', 'h264_qsv', 'libx265', 'libx264', 'copy'] as const;
type VideoCodec = typeof VIDEO_CODECS[number];
const VIDEO_PRESETS = ['veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'ultrafast'] as const;
type VideoPreset = typeof VIDEO_PRESETS[number];
const AUDIO_CODECS_CONVERT = ['libopus', 'aac'] as const; // Codecs for conversion
type AudioCodecConvert = typeof AUDIO_CODECS_CONVERT[number];
const SUBTITLE_CODECS_CONVERT = ['srt', 'mov_text'] as const; // Common subtitle formats
type SubtitleCodecConvert = typeof SUBTITLE_CODECS_CONVERT[number];
const HW_ACCEL_OPTIONS = ['auto', 'qsv', 'nvenc', 'cuda', 'none'] as const;
type HwAccel = typeof HW_ACCEL_OPTIONS[number];
const AUDIO_LAYOUT_OPTIONS = ['keep', 'stereo', 'mono'] as const;
type AudioLayout = typeof AUDIO_LAYOUT_OPTIONS[number];
const TRACK_ACTION_OPTIONS = ['convert', 'keep', 'discard'] as const;
type TrackAction = typeof TRACK_ACTION_OPTIONS[number];

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
const EncodingQueue: React.FC = () => {
    // Input/Output State
    const [inputPath, setInputPath] = useState<string>('');
    const [outputPath, setOutputPath] = useState<string>('');

    // Probing State
    const [isProbing, setIsProbing] = useState(false);
    const [probeData, setProbeData] = useState<ProbeData | null>(null);
    const [probeError, setProbeError] = useState<string | null>(null);

    // Encoding Param State
    const [videoCodec, setVideoCodec] = useState<VideoCodec>('hevc_qsv');
    const [videoPreset, setVideoPreset] = useState<VideoPreset>('faster');
    const [videoQuality, setVideoQuality] = useState<number>(25);
    const [hwAccel, setHwAccel] = useState<HwAccel>('auto');
    const [audioCodecConvert, setAudioCodecConvert] = useState<AudioCodecConvert>('libopus');
    const [audioBitrate, setAudioBitrate] = useState<string>('128k');
    const [subtitleCodecConvert, setSubtitleCodecConvert] = useState<SubtitleCodecConvert>('srt');

    // Track/Layout Selection State
    const [selectedAudioLayout, setSelectedAudioLayout] = useState<AudioLayout>('keep');
    const [selectedAudioTracks, setSelectedAudioTracks] = useState<{ [index: number]: TrackAction }>({});
    const [selectedSubtitleTracks, setSelectedSubtitleTracks] = useState<{ [index: number]: TrackAction }>({});

    // Encoding Process State
    const [status, setStatus] = useState<string>('');
    const [progress, setProgress] = useState<number | undefined>(undefined);
    const [isEncoding, setIsEncoding] = useState(false);
    const [lastResult, setLastResult] = useState<EncodingResult | null>(null);

    // Effect for progress subscription
    useEffect(() => {
        const handleProgress = (data: EncodingProgressUpdate) => {
            if (data.progress !== undefined) setProgress(data.progress);
            if (data.status) setStatus(data.status);
        };
        let unsubscribe: (() => void) | undefined;
        // Use the casted electronAPI object
        if (electronAPI?.subscribeEncodingProgress) {
            unsubscribe = electronAPI.subscribeEncodingProgress(handleProgress);
        }
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
            // Call general unsubscribe if it exists and is needed
            // if (electronAPI?.unsubscribeEncodingProgress) { electronAPI.unsubscribeEncodingProgress(); } 
        };
    }, []);

    // --- File Handling & Probing --- 
    const handleSelectInputFile = useCallback(async () => {
        setInputPath('');
        setOutputPath('');
        setProbeData(null);
        setProbeError(null);
        setSelectedAudioLayout('keep');
        setSelectedAudioTracks({});
        setSelectedSubtitleTracks({});
        setStatus('');
        setProgress(undefined);
        setLastResult(null);

        try {
            // Use the casted electronAPI object
            const result = await electronAPI?.showOpenDialog({
                properties: ['openFile'],
                filters: [
                    { name: 'Video Files', extensions: ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv'] }
                ]
            });

            if (result && !result.canceled && result.filePaths?.[0]) {
                const selectedPath = result.filePaths[0];
                setInputPath(selectedPath);

                // Auto-generate output path
                const lastDotIndex = selectedPath.lastIndexOf('.');
                const name = lastDotIndex > -1 ? selectedPath.substring(0, lastDotIndex) : selectedPath;
                const extension = lastDotIndex > -1 ? selectedPath.substring(lastDotIndex) : '';
                setOutputPath(`${name}_encoded${extension}`);

                // Probe the file
                setStatus('Probing file...');
                setIsProbing(true);
                setProbeError(null);
                try {
                    // Use the casted electronAPI object
                    const probed = await electronAPI?.probeFile(selectedPath);
                    if (probed) {
                        setProbeData(probed);
                        // Set default selections based on probe data
                        const audioDefaults: { [index: number]: TrackAction } = {};
                        const subtitleDefaults: { [index: number]: TrackAction } = {};
                        let firstAudioFound = false;
                        // Use StreamInfo type here
                        probed.streams.forEach((stream: StreamInfo) => {
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
        if (!inputPath || !outputPath || !probeData) {
            setStatus('Please select input file and wait for probe to complete.');
            return;
        }

        setIsEncoding(true);
        setStatus('Building encoding options...');
        setProgress(0);
        setLastResult(null);

        try {
            // --- Build Structured Encoding Options --- 
            const options: ExtendedEncodingOptions = {
                inputPath,
                outputPath,
                hwAccel: hwAccel !== 'none' ? hwAccel : undefined,
                // --- Video --- 
                mapVideo: undefined,
                videoCodec: undefined,
                videoPreset: undefined,
                videoQuality: undefined,
                // lookAhead: videoCodec.includes('qsv') ? 1 : undefined, // Example
                // pixelFormat: videoCodec.startsWith('hevc') ? 'p010le' : undefined, // Example
                
                // --- Audio --- 
                mapAudio: undefined,
                audioCodec: undefined,
                audioBitrate: undefined,
                audioFilter: undefined,
                // mapAudio: undefined, // Reset mapAudio for simplicity
            };

            // --- Find First Streams --- 
            const firstVideoStream = probeData.streams.find((s: StreamInfo) => s.codec_type === 'video');
            const firstAudioStream = probeData.streams.find((s: StreamInfo) => 
                s.codec_type === 'audio' && 
                (selectedAudioTracks[s.index] === 'keep' || selectedAudioTracks[s.index] === 'convert')
            );
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
            }
           
            // --- Audio Options (for the first selected stream) ---
            if (firstAudioStream) {
                const action = selectedAudioTracks[firstAudioStream.index];
                
                // Calculate the audio-specific index (position among audio streams only)
                const audioStreamIndex = probeData.streams
                    .filter(s => s.codec_type === 'audio')
                    .findIndex(s => s.index === firstAudioStream.index);
                
                // --- DEBUG LOG --- 
                console.log(`[Debug] Original Audio Stream Index: ${firstAudioStream.index}, Audio-specific Index: ${audioStreamIndex}`);
                
                options.mapAudio = `0:a:${audioStreamIndex}`;
                
                if (action === 'keep') {
                    options.audioCodec = 'copy';
                } else if (action === 'convert') {
                    options.audioCodec = audioCodecConvert;
                    options.audioBitrate = audioBitrate;
                    
                    // Add appropriate audio filter based on selected layout
                    if (selectedAudioLayout === 'stereo') {
                        options.audioFilter = 'pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE';
                    } else if (selectedAudioLayout === 'mono') {
                        options.audioFilter = 'pan=mono|c0=0.5*FC+0.5*FL+0.5*FR+0.5*BL+0.5*BR+0.3*LFE';
                    } else {
                        options.audioFilter = ''; // Keep original layout
                    }

                    // Add libopus mapping_family parameter for multichannel support
                    if (audioCodecConvert === 'libopus' && selectedAudioLayout === 'keep') {
                        // Pass mapping_family for proper multichannel handling in libopus
                        options.audioOptions = ['-mapping_family:a', '255', '-application:a', 'audio'];
                    }
                }
            } else {
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
            
            // Generate multiple map strings
            options.mapSubtitle = subtitlesToMap.length > 0 
                ? subtitlesToMap.map((s: StreamInfo) => {
                    // Calculate subtitle-specific index for each subtitle
                    const subtitleIndex = probeData.streams
                        .filter(stream => stream.codec_type === 'subtitle')
                        .findIndex(stream => stream.index === s.index);
                    return `0:s:${subtitleIndex}`;
                }) 
                : undefined;

             // Determine codec: convert if ANY selected need conversion, else copy if ANY are selected, else undefined
             const needsConversion = subtitlesToMap.some((s: StreamInfo) => selectedSubtitleTracks[s.index] === 'convert');
             if (needsConversion) {
                 options.subtitleCodec = subtitleCodecConvert;
             } else if (subtitlesToMap.length > 0) { 
                 options.subtitleCodec = 'copy';
             } else {
                 options.subtitleCodec = undefined;
             }
            // --- DEBUG LOG --- 
            console.log(`[Debug] Mapping Subtitle Streams: ${options.mapSubtitle?.join(', ') ?? 'None'}`);
            console.log(`[Debug] Subtitle Codec Chosen: ${options.subtitleCodec ?? 'None'}`);

            // --- Log and Execute --- 
            setStatus('Starting encoding process...');
            console.log("Sending encoding options:", JSON.stringify(options, null, 2));
            
            if (!electronAPI?.startEncodingProcess) {
                throw new Error("startEncodingProcess function is not available");
            }
            const result = await electronAPI.startEncodingProcess(options);
            setLastResult(result);
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
        }
    };

    // --- Render --- 
    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Encoding Job</h1>
                <Button
                    onClick={handleStartEncoding}
                    disabled={isEncoding || isProbing || !inputPath || !outputPath || !probeData}
                    className="min-w-[140px]"
                >
                    {isEncoding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encoding...</> : 'Start Encoding'}
                </Button>
            </div>

            {/* Input/Output Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Files</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="input-file">Input File</Label>
                        <div className="flex gap-2">
                            <Input id="input-file" value={inputPath} readOnly placeholder="Select input file..." />
                            <Button onClick={handleSelectInputFile} disabled={isEncoding || isProbing}>
                                {isProbing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Browse
                            </Button>
                        </div>
                    </div>
                    {isProbing && <p className="text-sm text-muted-foreground flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Probing file...</p>}
                    {probeError && <Alert variant="destructive"><AlertDescription>{probeError}</AlertDescription></Alert>}

                    <div className="space-y-2">
                        <Label htmlFor="output-file">Output File</Label>
                        <div className="flex gap-2">
                            <Input id="output-file" value={outputPath} onChange={e => setOutputPath(e.target.value)} placeholder="Select or type output file..." disabled={isEncoding} />
                            <Button onClick={handleSelectOutputFile} disabled={isEncoding || isProbing}>Browse</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Encoding Options Card (Main Settings) */}
            <Card>
                <CardHeader>
                    <CardTitle>Encoding Settings</CardTitle>
                    <CardDescription>Configure the main video and audio conversion settings.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Video Settings */}
                    <div className="space-y-4 p-4 border rounded-md">
                        <h3 className="font-semibold text-lg mb-2">Video</h3>
                        <div className="space-y-2">
                            <Label>Codec</Label>
                            <Select value={videoCodec} onValueChange={(value: VideoCodec) => setVideoCodec(value)} disabled={isEncoding}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{VIDEO_CODECS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Preset</Label>
                            <Select value={videoPreset} onValueChange={(value: VideoPreset) => setVideoPreset(value)} disabled={isEncoding || videoCodec === 'copy'}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{VIDEO_PRESETS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Quality (Lower is better) - {videoQuality}</Label>
                            <Slider value={[videoQuality]} min={18} max={38} step={1} onValueChange={([v]) => setVideoQuality(v)} disabled={isEncoding || videoCodec === 'copy'} />
                        </div>
                        <div className="space-y-2">
                            <Label>Hardware Acceleration</Label>
                            <Select value={hwAccel} onValueChange={(value: HwAccel) => setHwAccel(value)} disabled={isEncoding}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{HW_ACCEL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Audio Settings (for converted tracks) */}
                    <div className="space-y-4 p-4 border rounded-md">
                        <h3 className="font-semibold text-lg mb-2">Audio (Converted Tracks)</h3>
                        <div className="space-y-2">
                            <Label>Codec</Label>
                            <Select value={audioCodecConvert} onValueChange={(value: AudioCodecConvert) => setAudioCodecConvert(value)} disabled={isEncoding}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{AUDIO_CODECS_CONVERT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Bitrate</Label>
                            <Select value={audioBitrate} onValueChange={setAudioBitrate} disabled={isEncoding}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{['64k', '96k', '128k', '192k', '256k'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Channel Layout (for Converted)</Label>
                            <Select value={selectedAudioLayout} onValueChange={(value: AudioLayout) => setSelectedAudioLayout(value)} disabled={isEncoding}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="keep">Keep Original</SelectItem>
                                    <SelectItem value="stereo">Stereo (Downmix)</SelectItem>
                                    <SelectItem value="mono">Mono (Downmix)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Subtitle Codec (Converted)</Label>
                            <Select value={subtitleCodecConvert} onValueChange={(value: SubtitleCodecConvert) => setSubtitleCodecConvert(value)} disabled={isEncoding}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{SUBTITLE_CODECS_CONVERT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Track Selection Card (Conditional) */}
            {probeData && (
                <Card>
                    <CardHeader>
                        <CardTitle>Track Selection</CardTitle>
                        <CardDescription>Choose which audio and subtitle tracks to keep, convert, or discard.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Audio Tracks */}
                        <div>
                            <h3 className="font-semibold mb-2">Audio Tracks</h3>
                            <div className="space-y-3">
                                {probeData.streams.filter((s: StreamInfo) => s.codec_type === 'audio').map((stream: StreamInfo) => (
                                    <div key={stream.index} className="flex items-center justify-between gap-4 p-2 border rounded-md">
                                        <span className="text-sm flex-1 truncate" title={getStreamDescription(stream)}>{getStreamDescription(stream)}</span>
                                        <Select 
                                            value={selectedAudioTracks[stream.index] || 'discard'} 
                                            onValueChange={(value: TrackAction) => setSelectedAudioTracks(prev => ({ ...prev, [stream.index]: value }))}
                                            disabled={isEncoding}
                                        >
                                            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="convert">Convert</SelectItem>
                                                <SelectItem value="keep">Keep (Copy)</SelectItem>
                                                <SelectItem value="discard">Discard</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ))}
                                {probeData.streams.filter((s: StreamInfo) => s.codec_type === 'audio').length === 0 && <p className="text-sm text-muted-foreground">No audio tracks found.</p>}
                            </div>
                        </div>
                        
                        <Separator />

                        {/* Subtitle Tracks */}
                        <div>
                            <h3 className="font-semibold mb-2">Subtitle Tracks</h3>
                             <div className="space-y-3">
                                {probeData.streams.filter((s: StreamInfo) => s.codec_type === 'subtitle').map((stream: StreamInfo) => (
                                    <div key={stream.index} className="flex items-center justify-between gap-4 p-2 border rounded-md">
                                        <span className="text-sm flex-1 truncate" title={getStreamDescription(stream)}>{getStreamDescription(stream)}</span>
                                         <Select 
                                            value={selectedSubtitleTracks[stream.index] || 'discard'} 
                                            onValueChange={(value: TrackAction) => setSelectedSubtitleTracks(prev => ({ ...prev, [stream.index]: value }))}
                                            disabled={isEncoding}
                                        >
                                            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="convert">Convert</SelectItem>
                                                <SelectItem value="keep">Keep (Copy)</SelectItem>
                                                <SelectItem value="discard">Discard</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ))}
                                {probeData.streams.filter((s: StreamInfo) => s.codec_type === 'subtitle').length === 0 && <p className="text-sm text-muted-foreground">No subtitle tracks found.</p>}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Progress and Status Card */}
            {(progress !== undefined || status || lastResult) && (
                <Card>
                     <CardHeader>
                        <CardTitle>Encoding Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {progress !== undefined && (
                            <div className="space-y-2">
                                <Label>Progress</Label>
                                <div className="w-full bg-gray-700 rounded-full h-2.5">
                                    <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-150 ease-out" style={{ width: `${progress}%` }} />
                                </div>
                                <p className="text-sm text-right">{progress.toFixed(1)}%</p>
                            </div>
                        )}
                        {status && (
                            <div>
                                <Label>Status</Label>
                                <p className="text-sm">{status}</p>
                            </div>
                        )}
                        {lastResult && (
                            <div className="space-y-2">
                                <Label>Last Result</Label>
                                <div className="text-sm space-y-1 bg-muted/50 p-3 rounded-md">
                                    <p>Success: <span className={lastResult.success ? 'text-green-400' : 'text-red-400'}>{lastResult.success ? 'Yes' : 'No'}</span></p>
                                    {lastResult.outputPath && <p>Output: <code className="text-xs">{lastResult.outputPath}</code></p>}
                                    {lastResult.initialSizeMB !== undefined && <p>Initial Size: {lastResult.initialSizeMB.toFixed(2)} MB</p>}
                                    {lastResult.finalSizeMB !== undefined && <p>Final Size: {lastResult.finalSizeMB.toFixed(2)} MB</p>}
                                    {lastResult.reductionPercent !== undefined && <p>Reduction: {lastResult.reductionPercent.toFixed(2)}%</p>}
                                    {lastResult.error && <p className="text-red-400">Error: {lastResult.error}</p>}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default EncodingQueue; 