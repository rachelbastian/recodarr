import { ProbeData, StreamInfo, EncodingPreset, EncodingOptions } from '../types.js';
import { orderSubtitlesByPreset } from './presetUtil.js';

// Define types needed for the encoding utility
export type TrackAction = 'keep' | 'convert' | 'discard';

/**
 * Build encoding options from a preset and stream selections
 * 
 * This utility function encapsulates the logic for converting a preset and
 * stream selections into ffmpeg encoding options, making it reusable across
 * different parts of the application.
 */
export function buildEncodingOptions(
  inputPath: string,
  outputPath: string,
  overwriteInput: boolean,
  probeData: ProbeData,
  preset: EncodingPreset | undefined,
  selectedAudioTracks: { [index: number]: TrackAction },
  selectedSubtitleTracks: { [index: number]: TrackAction },
  videoResolution?: string
): EncodingOptions {
  // Initialize options structure
  const options: EncodingOptions = {
    inputPath,
    outputPath,
    overwriteInput,
    // Hardware acceleration from preset - derive from video codec if not properly set
    hwAccel: (() => {
        const originalHwAccel = preset?.hwAccel;
        console.log(`[EncodingUtil] Original preset hwAccel: ${originalHwAccel}, videoCodec: ${preset?.videoCodec}`);
        
        // Always use the preset's hwAccel setting as-is
        // This ensures we respect the user's hardware selection
        const hwAccelValue = preset?.hwAccel || 'auto';
        console.log(`[EncodingUtil] Using preset hwAccel: ${hwAccelValue}`);
        return hwAccelValue;
    })(),
    // Add our custom metadata tag
    metadataOutput: ['RECODARR_ENCODED_BY_APP=true'],
  };

  // --- Handle Video Options ---
  const firstVideoStream = probeData.streams.find((s: StreamInfo) => s.codec_type === 'video');
  if (firstVideoStream) {
    // Calculate video-specific index (position among video streams only)
    const videoStreamIndex = probeData.streams
      .filter(s => s.codec_type === 'video')
      .findIndex(s => s.index === firstVideoStream.index);
    
    options.mapVideo = `0:v:${videoStreamIndex}`;
    
    // Only set codec if video is mapped
    if (options.mapVideo) {
      options.videoCodec = preset?.videoCodec;
      options.videoPreset = preset?.videoCodec !== 'copy' ? preset?.videoPreset : undefined;
      options.videoQuality = preset?.videoCodec !== 'copy' ? preset?.videoQuality : undefined;
      
      // Add resolution filter if not original
      if (preset?.videoResolution !== 'original' && preset?.videoCodec !== 'copy') {
        // Define explicit resolutions (width x height)
        const exactResolutions: Record<string, string> = {
          '480p': '854x480',    // 16:9 aspect for 480p
          '720p': '1280x720',   // 720p HD
          '1080p': '1920x1080', // 1080p Full HD
          '1440p': '2560x1440', // 1440p QHD
          '2160p': '3840x2160'  // 4K UHD
        };
        
        // Resolution mapping with explicit values for scale filter
        const resolutionMap: Record<string, string> = {
          '480p': 'scale=w=-2:h=480',
          '720p': 'scale=w=-2:h=720',
          '1080p': 'scale=w=-2:h=1080',
          '1440p': 'scale=w=-2:h=1440',
          '2160p': 'scale=w=-2:h=2160'
        };
        
        const resolution = preset?.videoResolution;
        if (resolution && exactResolutions[resolution]) {
          // Use only videoFilter for scaling (better compatibility with Intel GPU)
          options.videoFilter = resolutionMap[resolution];
        }
      }
    }
  }

  // --- Handle Audio Options ---
  const audioStreamsToMap = probeData.streams
    .filter((s: StreamInfo) => 
      s.codec_type === 'audio' && 
      (selectedAudioTracks[s.index] === 'keep' || selectedAudioTracks[s.index] === 'convert')
    );
  
  if (audioStreamsToMap.length > 0) {
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
    if (preset && Array.isArray(preset.audioLanguageOrder) && preset.audioLanguageOrder.length > 0) {
      // Create list of sorted streams
      const sortedStreams: typeof audioStreamDTOs = [];
      
      // Process each language priority in order
      for (const lang of preset.audioLanguageOrder) {
        if (lang.toLowerCase() === 'original') {
          // Find the original audio track (0:a:0)
          const originalTrack = audioStreamDTOs.find(dto => dto.isOriginalTrack);
          if (originalTrack && !sortedStreams.includes(originalTrack)) {
            sortedStreams.push(originalTrack);
          }
        } else {
          // Find tracks matching this language
          const langTracks = audioStreamDTOs.filter(
            dto => dto.language === lang.toLowerCase() && !sortedStreams.includes(dto)
          );
          
          // Add all matching tracks in their original order
          for (const track of langTracks) {
            sortedStreams.push(track);
          }
        }
      }
      
      // Add any remaining tracks that weren't in the preset
      for (const track of audioStreamDTOs) {
        if (!sortedStreams.includes(track)) {
          sortedStreams.push(track);
        }
      }
      
      // Replace the original array with the sorted one
      audioStreamDTOs.length = 0;
      audioStreamDTOs.push(...sortedStreams);
    }
    
    // Get the final mapping indices in the sorted order
    const mappedAudioIndices = audioStreamDTOs.map(dto => dto.ffmpegIndex);
    
    // Determine if we need to convert any audio streams
    const needsAudioConversion = audioStreamsToMap.some(
      (s: StreamInfo) => selectedAudioTracks[s.index] === 'convert'
    );
    
    // Set audio codec based on selection - if any need conversion, use the selected codec
    if (needsAudioConversion) {
      options.audioCodec = preset?.audioCodecConvert;
      options.audioBitrate = preset?.audioBitrate;
      
      // Apply audio filter based on layout
      if (preset?.audioCodecConvert === 'eac3') {
        // For EAC3, we don't want to remap channels, just preserve the original layout
        options.audioFilter = ''; // No audio filter for EAC3
        if (preset.audioBitrate && !preset.audioBitrate.endsWith('k')) {
          options.audioBitrate = `${preset.audioBitrate}k`; // Ensure bitrate has 'k' suffix
        }
      } else {
        // For other codecs like opus and aac, apply the audio layout filter
        if (preset?.selectedAudioLayout === 'stereo') {
          options.audioFilter = 'pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE';
        } else if (preset?.selectedAudioLayout === 'mono') {
          options.audioFilter = 'pan=mono|c0=0.5*FC+0.5*FL+0.5*FR+0.5*BL+0.5*BR+0.3*LFE';
        } else if (preset?.selectedAudioLayout === 'surround5_1') {
          options.audioFilter = 'channelmap=FL-FL|FR-FR|FC-FC|LFE-LFE|SL-BL|SR-BR:5.1';
        }
      }

      // Add libopus mapping_family parameter for multichannel support
      if (preset?.audioCodecConvert === 'libopus' && preset?.selectedAudioLayout === 'surround5_1') {
        // Pass mapping_family for proper multichannel handling in libopus
        options.audioOptions = ['-mapping_family:a', '255', '-application:a', 'audio'];
      }
    } else if (audioStreamsToMap.length > 0) {
      // If all selected tracks are 'keep', set codec to copy
      options.audioCodec = 'copy';
    }
    
    // Set map strings for all audio streams
    options.mapAudio = mappedAudioIndices.map(idx => `0:a:${idx}`).join(';');
  }

  // --- Handle Subtitle Options ---
  const subtitlesToMap = probeData.streams
    .filter((s: StreamInfo) => 
      s.codec_type === 'subtitle' && 
      (selectedSubtitleTracks[s.index] === 'keep' || selectedSubtitleTracks[s.index] === 'convert')
    );
  
  // Check if all subtitle tracks are marked as 'discard' (i.e., removeAllSubtitles is true)
  const allSubtitleTracks = probeData.streams.filter(s => s.codec_type === 'subtitle');
  const allSubtitlesDiscarded = allSubtitleTracks.length > 0 && 
    allSubtitleTracks.every(s => selectedSubtitleTracks[s.index] === 'discard');
  
  if (allSubtitlesDiscarded) {
    // Explicitly set mapSubtitle to empty array to indicate no subtitles should be included
    options.mapSubtitle = [];
    console.log('BuildEncodingOptions: All subtitles marked for removal - setting mapSubtitle to empty array');
  } else if (subtitlesToMap.length > 0) {
    // Convert subtitle streams to DTOs with metadata
    let subtitleStreamDTOs = subtitlesToMap.map(s => {
      // Identify subtitle type
      const subtitleType = getSubtitleType(s);
      
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
    if (preset) {
      subtitleStreamDTOs = orderSubtitlesByPreset(subtitleStreamDTOs, preset);
    }
    
    // Generate mapping strings for the sorted subtitles
    options.mapSubtitle = subtitleStreamDTOs.map(dto => `0:s:${dto.ffmpegIndex}`);
    
    // Determine codec based on the actions
    const needsConversion = subtitleStreamDTOs.some(dto => dto.action === 'convert');
    options.subtitleCodec = needsConversion ? preset?.subtitleCodecConvert : 'copy';
  }

  return options;
}

/**
 * Get subtitle type based on stream info
 */
export function getSubtitleType(stream: StreamInfo): string {
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
} 