import { IElectronAPI, EncodingPreset, StreamInfo } from '../types.js';

// Constants from ManualEncode/Presets
const VIDEO_CODECS = ['hevc_qsv', 'h264_qsv', 'av1_qsv', 'hevc_nvenc', 'h264_nvenc', 'av1_nvenc', 'libx265', 'libx264', 'copy'] as const;
type VideoCodec = typeof VIDEO_CODECS[number];

// For utility functions
export type HardwarePlatformUtil = 'INTEL_GPU' | 'NVIDIA_GPU' | 'CPU_SOFTWARE' | 'NONE';
export type TargetVideoFormatUtil = 'AV1' | 'H265' | 'H264' | 'COPY';

const VIDEO_PRESETS = ['veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'ultrafast'] as const;
type VideoPreset = typeof VIDEO_PRESETS[number];

const VIDEO_RESOLUTIONS = ['original', '480p', '720p', '1080p', '1440p', '2160p'] as const;
type VideoResolution = typeof VIDEO_RESOLUTIONS[number];

const AUDIO_CODECS_CONVERT = ['libopus', 'aac', 'eac3'] as const;
type AudioCodecConvert = typeof AUDIO_CODECS_CONVERT[number];

const SUBTITLE_CODECS_CONVERT = ['srt', 'mov_text'] as const;
type SubtitleCodecConvert = typeof SUBTITLE_CODECS_CONVERT[number];

const HW_ACCEL_OPTIONS = ['auto', 'qsv', 'nvenc', 'cuda', 'none'] as const;
type HwAccel = typeof HW_ACCEL_OPTIONS[number];

const AUDIO_LAYOUT_OPTIONS = ['stereo', 'mono', 'surround5_1'] as const;
type AudioLayout = typeof AUDIO_LAYOUT_OPTIONS[number];

const TRACK_ACTION_OPTIONS = ['keep', 'convert', 'discard'] as const;
type TrackAction = typeof TRACK_ACTION_OPTIONS[number];

/**
 * Derives the FFMPEG video codec string from hardware and target format selections.
 * @param hardware The selected hardware platform.
 * @param format The selected target video format.
 * @returns The corresponding FFMPEG VideoCodec string.
 */
export function deriveFfmpegCodec(hardware: HardwarePlatformUtil, format: TargetVideoFormatUtil): VideoCodec {
    if (format === 'COPY') return 'copy';

    switch (hardware) {
        case 'INTEL_GPU':
            if (format === 'AV1') return 'av1_qsv';
            if (format === 'H265') return 'hevc_qsv';
            if (format === 'H264') return 'h264_qsv';
            break;
        case 'NVIDIA_GPU':
            if (format === 'AV1') return 'av1_nvenc';
            if (format === 'H265') return 'hevc_nvenc';
            if (format === 'H264') return 'h264_nvenc';
            break;
        case 'CPU_SOFTWARE':
            if (format === 'H265') return 'libx265';
            if (format === 'H264') return 'libx264';
            // AV1 for CPU (e.g., libaom-av1, svt-av1) is not in VIDEO_CODECS,
            // so AV1 with CPU_SOFTWARE will fall through to default or needs specific handling.
            // For now, returning a common fallback if specific CPU AV1 isn't listed.
            if (format === 'AV1') return 'libx265'; // Fallback: Or throw error / handle in UI
            break;
        case 'NONE':
            // If hardware is 'NONE', the only sensible outcome is 'copy'.
            // Regardless of the chosen format, if hardware is NONE, we treat it as a 'copy' operation.
            return 'copy';
    }
    // Fallback for unhandled combinations - default to a common software encoder.
    // The UI should ideally prevent invalid combinations.
    console.warn(`Unsupported hardware/format combination: ${hardware}/${format}. Defaulting to libx265.`);
    return 'libx265';
}

/**
 * Derives hardware and target format selections from an FFMPEG video codec string.
 * @param codec The FFMPEG VideoCodec string.
 * @returns An object with `hardwarePlatform` and `targetVideoFormat`.
 */
export function deriveHardwareAndFormat(codec: VideoCodec | undefined | null): { hardwarePlatform: HardwarePlatformUtil, targetVideoFormat: TargetVideoFormatUtil } {
    if (!codec) { // Default if codec is undefined or null
        return { hardwarePlatform: 'INTEL_GPU', targetVideoFormat: 'H265' };
    }
    switch (codec) {
        case 'av1_qsv': return { hardwarePlatform: 'INTEL_GPU', targetVideoFormat: 'AV1' };
        case 'hevc_qsv': return { hardwarePlatform: 'INTEL_GPU', targetVideoFormat: 'H265' };
        case 'h264_qsv': return { hardwarePlatform: 'INTEL_GPU', targetVideoFormat: 'H264' };
        case 'av1_nvenc': return { hardwarePlatform: 'NVIDIA_GPU', targetVideoFormat: 'AV1' };
        case 'hevc_nvenc': return { hardwarePlatform: 'NVIDIA_GPU', targetVideoFormat: 'H265' };
        case 'h264_nvenc': return { hardwarePlatform: 'NVIDIA_GPU', targetVideoFormat: 'H264' };
        case 'libx265': return { hardwarePlatform: 'CPU_SOFTWARE', targetVideoFormat: 'H265' };
        case 'libx264': return { hardwarePlatform: 'CPU_SOFTWARE', targetVideoFormat: 'H264' };
        case 'copy': return { hardwarePlatform: 'NONE', targetVideoFormat: 'COPY' };
        default:
            // Fallback for unknown or older codecs
            console.warn(`Unknown video codec "${codec}" for deriving hardware/format. Defaulting to CPU_SOFTWARE/H265.`);
            return { hardwarePlatform: 'CPU_SOFTWARE', targetVideoFormat: 'H265' };
    }
}

// Default values for a new preset - copied from Presets.tsx
export const defaultPresetValues: Omit<EncodingPreset, 'id'> = {
    name: '',
    videoCodec: 'hevc_qsv',
    videoPreset: 'faster',
    videoQuality: 25,
    videoResolution: 'original',
    hwAccel: 'auto',
    audioCodecConvert: 'libopus',
    audioBitrate: '128k',
    selectedAudioLayout: 'stereo',
    audioLanguageOrder: ['eng', 'original'], // Default to English first, then Original
    subtitleLanguageOrder: ['eng'], // Default to English subtitles
    subtitleTypeOrder: ['forced', 'normal', 'sdh'], // Default type order
    subtitleCodecConvert: 'srt',
    removeAllSubtitles: false, // Default to keeping subtitles
};

/**
 * Load presets from the electron API
 */
export const loadPresets = async (electronAPI: IElectronAPI): Promise<EncodingPreset[]> => {
    try {
        const presets = await electronAPI.getPresets();
        // Ensure audioLanguageOrder is always an array, even if null from DB
        return presets.map((p: EncodingPreset) => ({ 
            ...p, 
            audioLanguageOrder: p.audioLanguageOrder ?? [],
            subtitleLanguageOrder: p.subtitleLanguageOrder ?? [],
            subtitleTypeOrder: p.subtitleTypeOrder ?? []
        }));
    } catch (error) {
        console.error("Failed to load presets:", error);
        return [];
    }
};

/**
 * Get a preset by ID
 */
export const getPresetById = (presets: EncodingPreset[], presetId: string): EncodingPreset | undefined => {
    return presets.find(p => p.id === presetId);
};

/**
 * Get default encoding options based on a preset
 */
export const getDefaultEncodingOptions = (preset: EncodingPreset | undefined) => {
    if (!preset) {
        return defaultPresetValues;
    }

    return {
        videoCodec: preset.videoCodec ?? defaultPresetValues.videoCodec,
        videoPreset: preset.videoPreset ?? defaultPresetValues.videoPreset,
        videoQuality: preset.videoQuality ?? defaultPresetValues.videoQuality,
        videoResolution: preset.videoResolution ?? defaultPresetValues.videoResolution,
        hwAccel: preset.hwAccel ?? defaultPresetValues.hwAccel,
        audioCodecConvert: preset.audioCodecConvert ?? defaultPresetValues.audioCodecConvert,
        audioBitrate: preset.audioBitrate ?? defaultPresetValues.audioBitrate,
        selectedAudioLayout: preset.selectedAudioLayout ?? defaultPresetValues.selectedAudioLayout,
        subtitleCodecConvert: preset.subtitleCodecConvert ?? defaultPresetValues.subtitleCodecConvert,
        audioLanguageOrder: preset.audioLanguageOrder ?? defaultPresetValues.audioLanguageOrder,
        subtitleLanguageOrder: preset.subtitleLanguageOrder ?? defaultPresetValues.subtitleLanguageOrder,
        subtitleTypeOrder: preset.subtitleTypeOrder ?? defaultPresetValues.subtitleTypeOrder,
        removeAllSubtitles: preset.removeAllSubtitles ?? defaultPresetValues.removeAllSubtitles,
    };
};

/**
 * Apply track selection based on preset
 */
export const getAudioTrackActions = (
    streams: StreamInfo[],
    preset: EncodingPreset | undefined
): { [index: number]: TrackAction } => {
    const audioStreams = streams.filter(s => s.codec_type === 'audio');
    const audioDefaults: { [index: number]: TrackAction } = {};

    console.log(`[Preset Track Select] Processing ${audioStreams.length} audio streams`);
    audioStreams.forEach(stream => {
        const lang = stream.tags?.language?.toLowerCase() || 'unknown';
        console.log(`  - Stream ${stream.index}: ${lang} (${stream.codec_name})`);
    });

    if (!preset || !Array.isArray(preset.audioLanguageOrder) || preset.audioLanguageOrder.length === 0) {
        // Default selection for custom mode (or invalid preset): convert first audio track, discard others
        let firstAudioFound = false;
        audioStreams.forEach((stream: StreamInfo) => {
            audioDefaults[stream.index] = !firstAudioFound ? 'convert' : 'discard';
            firstAudioFound = true;
        });
        console.log(`[Preset Track Select] No preset audio order, using default (first track convert)`);
        return audioDefaults;
    }

    console.log(`[Preset Track Select] Using preset audio order: [${preset.audioLanguageOrder.join(', ')}]`);

    // Apply preset-based audio track selection
    const presetLangsLower = preset.audioLanguageOrder.map((lang: string) => lang.toLowerCase());
    const selectedIndices: number[] = [];
    
    // Track which preset languages have been matched
    const matchedPresetLangs = new Set<string>();

    // Process each language in the preset's order
    for (const langCode of presetLangsLower) {
        if (langCode === 'original') {
            // Find the audio stream with the lowest index (the true "first" track in the file)
            const firstAudioStream = audioStreams.reduce((lowest, current) => 
                (lowest.index < current.index) ? lowest : current
            );
            
            if (firstAudioStream) {
                const originalLang = firstAudioStream.tags?.language?.toLowerCase() || 'unknown';
                console.log(`[Preset Track Select] Processing "original" track - Index ${firstAudioStream.index} (${originalLang})`);
                
                // Always include the original track (first audio stream by index), even if already selected
                if (!selectedIndices.includes(firstAudioStream.index)) {
                    console.log(`[Preset Track Select] Adding "original" track: Index ${firstAudioStream.index} (${originalLang})`);
                    selectedIndices.push(firstAudioStream.index);
                } else {
                    console.log(`[Preset Track Select] "original" track (Index ${firstAudioStream.index}, ${originalLang}) already selected by previous language match`);
                }
                matchedPresetLangs.add(langCode);
            } else {
                console.log(`[Preset Track Select] No audio streams found for "original"`);
            }
            continue;
        }

        // Find streams for the current language code that haven't already been selected
        const foundStreams = audioStreams.filter(stream => 
            !selectedIndices.includes(stream.index) && 
            stream.tags?.language?.toLowerCase() === langCode
        );

        if (foundStreams.length > 0) {
            console.log(`[Preset Track Select] Found ${foundStreams.length} match(es) for "${langCode}"`);
            foundStreams.forEach((streamToSelect: StreamInfo) => {
                if (!selectedIndices.includes(streamToSelect.index)) {
                    selectedIndices.push(streamToSelect.index);
                    console.log(`  - Adding ${langCode} track: Index ${streamToSelect.index}`);
                }
            });
            matchedPresetLangs.add(langCode);
        } else {
            console.log(`[Preset Track Select] No available tracks found for "${langCode}" (might be selected already or doesn't exist)`);
        }
    }

    console.log(`[Preset Track Select] Selected track indices: [${selectedIndices.join(', ')}]`);

    // Set track actions based on the found indices
    audioStreams.forEach((stream: StreamInfo) => {
        // Mark tracks in selectedIndices for conversion, others for discard
        audioDefaults[stream.index] = selectedIndices.includes(stream.index) ? 'convert' : 'discard';
        console.log(`[Preset Track Select] Stream ${stream.index}: ${audioDefaults[stream.index]}`);
    });

    return audioDefaults;
};

/**
 * Apply subtitle track selection based on preset
 */
export const getSubtitleTrackActions = (
    streams: StreamInfo[],
    preset: EncodingPreset | undefined
): { [index: number]: TrackAction } => {
    const subtitleDefaults: { [index: number]: TrackAction } = {};
    const subtitleStreams = streams.filter(s => s.codec_type === 'subtitle');

    // If preset specifies to remove all subtitles, discard all subtitle streams
    if (preset?.removeAllSubtitles) {
        subtitleStreams.forEach((stream: StreamInfo) => {
            subtitleDefaults[stream.index] = 'discard';
            console.log(`[Preset Track Select] Setting subtitle ${stream.index} to 'discard' - removeAllSubtitles enabled`);
        });
        return subtitleDefaults;
    }

    if (!preset || !Array.isArray(preset.subtitleLanguageOrder) || preset.subtitleLanguageOrder.length === 0) {
        // Default selection for custom mode (or invalid preset): keep English subtitles
        subtitleStreams.forEach((stream: StreamInfo) => {
            subtitleDefaults[stream.index] = (stream.tags?.language?.toLowerCase() === 'eng') ? 'keep' : 'discard';
        });
        return subtitleDefaults;
    }

    // Apply preset-based subtitle track selection
    const presetSubLangsLower = preset.subtitleLanguageOrder.map((lang: string) => lang.toLowerCase());
    
    subtitleStreams.forEach((stream: StreamInfo) => {
        const langLower = stream.tags?.language?.toLowerCase() || 'unknown';
        
        // Keep subtitles whose language is in the preset's order
        if (presetSubLangsLower.includes(langLower)) {
            subtitleDefaults[stream.index] = 'keep';
            console.log(`[Preset Track Select] Setting subtitle ${stream.index} (${langLower}) to 'keep' based on preset.`);
        } else {
            subtitleDefaults[stream.index] = 'discard';
            console.log(`[Preset Track Select] Setting subtitle ${stream.index} (${langLower}) to 'discard' as it's not in preset order.`);
        }
    });

    return subtitleDefaults;
};

/**
 * Get subtitle type based on stream info
 */
export const getSubtitleType = (stream: StreamInfo): string => {
    // Default to 'normal'
    let type = 'normal';
    
    // Check for 'forced' in disposition
    if (stream.disposition?.forced) {
        return 'forced';
    }
    
    // Check for SDH/CC indicators in title
    const title = stream.tags?.title?.toLowerCase() || '';
    
    if (title.includes('sdh') || title.includes('hearing')) {
        return 'sdh';
    }
    
    if (title.includes('cc') || title.includes('caption')) {
        return 'cc';
    }
    
    // Check for signs/songs
    if (title.includes('sign') || title.includes('text')) {
        return 'signs';
    }
    
    if (title.includes('song') || title.includes('lyric') || title.includes('karaoke')) {
        return 'song';
    }
    
    return type;
};

/**
 * Order subtitle streams according to preset priorities
 * @param subtitleStreams The subtitle streams with metadata
 * @param preset The active preset with language and type ordering
 * @returns Ordered list of subtitle streams
 */
export const orderSubtitlesByPreset = <T extends { language: string; type: string }>(
    subtitleStreams: T[],
    preset: EncodingPreset | undefined
): T[] => {
    if (!preset || !preset.subtitleLanguageOrder || !preset.subtitleTypeOrder) {
        return subtitleStreams;
    }

    // Create a copy of the streams array for sorting
    const streamsToSort = [...subtitleStreams];
    
    // Order streams by preset language order first, then by type order
    return streamsToSort.sort((a, b) => {
        const langA = a.language.toLowerCase();
        const langB = b.language.toLowerCase();
        
        // Get index in the language order (or a high number if not found)
        const langIndexA = preset.subtitleLanguageOrder?.findIndex((l: string) => l.toLowerCase() === langA) ?? 999;
        const langIndexB = preset.subtitleLanguageOrder?.findIndex((l: string) => l.toLowerCase() === langB) ?? 999;
        
        // Compare language priority first
        if (langIndexA !== langIndexB) {
            return langIndexA - langIndexB;
        }
        
        // If same language, sort by type priority
        const typeA = a.type;
        const typeB = b.type;
        
        const typeIndexA = preset.subtitleTypeOrder?.findIndex((t: string) => t === typeA) ?? 999;
        const typeIndexB = preset.subtitleTypeOrder?.findIndex((t: string) => t === typeB) ?? 999;
        
        return typeIndexA - typeIndexB;
    });
};

/**
 * Create a display description for a preset
 */
export const getPresetSummary = (preset: EncodingPreset): string => {
    const parts: string[] = [];
    
    // Video info
    if (preset.videoCodec) {
        const { hardwarePlatform, targetVideoFormat } = deriveHardwareAndFormat(preset.videoCodec);
        let formatDesc: string = targetVideoFormat;
        if (targetVideoFormat === 'H265') formatDesc = 'H.265';
        else if (targetVideoFormat === 'H264') formatDesc = 'H.264';

        let hardwareDesc = '';
        if (hardwarePlatform === 'INTEL_GPU') hardwareDesc = 'Intel GPU';
        else if (hardwarePlatform === 'NVIDIA_GPU') hardwareDesc = 'Nvidia GPU';
        else if (hardwarePlatform === 'CPU_SOFTWARE') hardwareDesc = 'CPU';
        
        if (targetVideoFormat === 'COPY') {
            parts.push(`Vid: Keep Original`);
        } else if (hardwarePlatform === 'NONE'){ // Should not happen if not copy, but as a safeguard
             parts.push(`Vid: ${formatDesc}`);
        }
        else {
            parts.push(`Vid: ${hardwareDesc} ${formatDesc}`);
        }

        if (preset.videoQuality && targetVideoFormat !== 'COPY') {
             parts[parts.length-1] += ` (Q${preset.videoQuality})`;
        }
    }
    
    // Audio codec info
    if (preset.audioCodecConvert) {
        parts.push(`Aud: ${preset.audioCodecConvert}${preset.audioBitrate ? ` (${preset.audioBitrate})` : ''}`);
    }
    
    // Resolution if not original
    if (preset.videoResolution && preset.videoResolution !== 'original') {
        parts.push(`Res: ${preset.videoResolution}`);
    }
    
    // Audio language summary based on order
    if (preset.audioLanguageOrder && preset.audioLanguageOrder.length > 0) {
        const orderSummary = preset.audioLanguageOrder
            .slice(0, 3) // Show first 3
            .join(', ');
        parts.push(`Aud Order: ${orderSummary}${preset.audioLanguageOrder.length > 3 ? '...' : ''}`);
    } else {
         parts.push('Aud Order: Default'); 
    }
    
    // Subtitle language/type summary
    if (preset.removeAllSubtitles) {
        parts.push('Sub: No Subtitles');
    } else if (Array.isArray(preset.subtitleLanguageOrder) && preset.subtitleLanguageOrder.length > 0) {
        const langSummary = preset.subtitleLanguageOrder
            .slice(0, 2) // Show first 2
            .join(', ');
        parts.push(`Sub Lang: ${langSummary}${preset.subtitleLanguageOrder.length > 2 ? '...' : ''}`);
        
        if (Array.isArray(preset.subtitleTypeOrder) && preset.subtitleTypeOrder.length > 0) {
            const typeSummary = preset.subtitleTypeOrder
                .slice(0, 2) // Show first 2 types
                .join(', ');
            parts.push(`Sub Type: ${typeSummary}${preset.subtitleTypeOrder.length > 2 ? '...' : ''}`);
        }
    }
    
    return parts.join(', ') || 'Default Settings';
}; 