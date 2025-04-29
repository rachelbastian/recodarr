import { IElectronAPI, EncodingPreset, StreamInfo } from '../types';

// Constants from ManualEncode/Presets
const VIDEO_CODECS = ['hevc_qsv', 'h264_qsv', 'av1_qsv', 'libx265', 'libx264', 'copy'] as const;
type VideoCodec = typeof VIDEO_CODECS[number];

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
};

/**
 * Load presets from the electron API
 */
export const loadPresets = async (electronAPI: IElectronAPI): Promise<EncodingPreset[]> => {
    try {
        const presets = await electronAPI.getPresets();
        // Ensure audioLanguageOrder is always an array, even if null from DB
        return presets.map(p => ({ 
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

    if (!preset || !Array.isArray(preset.audioLanguageOrder) || preset.audioLanguageOrder.length === 0) {
        // Default selection for custom mode (or invalid preset): convert first audio track, discard others
        let firstAudioFound = false;
        audioStreams.forEach(stream => {
            audioDefaults[stream.index] = !firstAudioFound ? 'convert' : 'discard';
            firstAudioFound = true;
        });
        return audioDefaults;
    }

    // Apply preset-based audio track selection
    const presetLangsLower = preset.audioLanguageOrder.map(lang => lang.toLowerCase());
    const selectedIndices: number[] = [];
    
    // Track which preset languages have been matched
    const matchedPresetLangs = new Set<string>();

    // Process each language in the preset's order
    for (const langCode of presetLangsLower) {
        if (langCode === 'original') {
            const firstAudioStream = audioStreams[0];
            if (firstAudioStream && !selectedIndices.includes(firstAudioStream.index)) {
                console.log(`[Preset Track Select] Found match for "original": Index ${firstAudioStream.index}`);
                selectedIndices.push(firstAudioStream.index);
                matchedPresetLangs.add(langCode);
            }
            continue;
        }

        // Find streams for the current language code that haven't already been selected
        const foundStreams = audioStreams.filter(stream => 
            !selectedIndices.includes(stream.index) && 
            stream.tags?.language?.toLowerCase() === langCode
        );

        if (foundStreams.length > 0) {
            console.log(`[Preset Track Select] Found ${foundStreams.length} match(es) for "${langCode}".`);
            foundStreams.forEach(streamToSelect => {
                if (!selectedIndices.includes(streamToSelect.index)) {
                    selectedIndices.push(streamToSelect.index);
                    console.log(`  - Adding Index ${streamToSelect.index}`);
                }
            });
            matchedPresetLangs.add(langCode);
        }
    }

    // Set track actions based on the found indices
    audioStreams.forEach(stream => {
        // Mark tracks in selectedIndices for conversion, others for discard
        audioDefaults[stream.index] = selectedIndices.includes(stream.index) ? 'convert' : 'discard';
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

    if (!preset || !Array.isArray(preset.subtitleLanguageOrder) || preset.subtitleLanguageOrder.length === 0) {
        // Default selection for custom mode (or invalid preset): keep English subtitles
        subtitleStreams.forEach(stream => {
            subtitleDefaults[stream.index] = (stream.tags?.language?.toLowerCase() === 'eng') ? 'keep' : 'discard';
        });
        return subtitleDefaults;
    }

    // Apply preset-based subtitle track selection
    const presetSubLangsLower = preset.subtitleLanguageOrder.map(lang => lang.toLowerCase());
    
    subtitleStreams.forEach(stream => {
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
        const langIndexA = preset.subtitleLanguageOrder?.findIndex(l => l.toLowerCase() === langA) ?? 999;
        const langIndexB = preset.subtitleLanguageOrder?.findIndex(l => l.toLowerCase() === langB) ?? 999;
        
        // Compare language priority first
        if (langIndexA !== langIndexB) {
            return langIndexA - langIndexB;
        }
        
        // If same language, sort by type priority
        const typeA = a.type;
        const typeB = b.type;
        
        const typeIndexA = preset.subtitleTypeOrder?.findIndex(t => t === typeA) ?? 999;
        const typeIndexB = preset.subtitleTypeOrder?.findIndex(t => t === typeB) ?? 999;
        
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
        parts.push(`Vid: ${preset.videoCodec}${preset.videoQuality ? ` (Q${preset.videoQuality})` : ''}`);
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
    if (Array.isArray(preset.subtitleLanguageOrder) && preset.subtitleLanguageOrder.length > 0) {
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