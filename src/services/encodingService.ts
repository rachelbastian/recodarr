import { ProbeData, EncodingPreset, EncodingResult } from '../types.js';
import { buildEncodingOptions, TrackAction } from '../utils/encodingUtil.js';

/**
 * EncodingService provides a standard interface for encoding operations
 * across the application. It abstracts away the details of how encoding
 * is performed and how presets are applied.
 */

// Access the Electron API
const electronAPI = window.electron;

/**
 * Create and start an encoding job with the given parameters
 * 
 * @param inputPath Path to the input file
 * @param outputPath Path to save the output file (can be the same as input for overwrite)
 * @param overwriteInput Whether to overwrite the input file
 * @param preset Optional encoding preset to use
 * @param probeData Probe data for the input file
 * @param trackSelections Selected tracks to include
 * @param jobId Optional job ID for tracking progress updates
 * @returns Promise with encoding result
 */
export async function createEncodingJob(
  inputPath: string,
  outputPath: string,
  overwriteInput: boolean,
  preset: EncodingPreset | undefined,
  probeData: ProbeData,
  trackSelections: {
    audio: { [index: number]: TrackAction },
    subtitle: { [index: number]: TrackAction }
  },
  jobId?: string
): Promise<EncodingResult> {
  try {
    // Build encoding options using the utility function
    const options = buildEncodingOptions(
      inputPath,
      outputPath,
      overwriteInput,
      probeData,
      preset,
      trackSelections.audio,
      trackSelections.subtitle
    );
    
    // IMPORTANT: Always add job ID for tracking progress
    if (jobId) {
      options.jobId = jobId;
      console.log(`EncodingService: Starting job ${jobId} for ${inputPath}`);
    } else {
      console.warn(`EncodingService: No job ID provided for encoding ${inputPath} -> ${outputPath}`);
      // Create a fallback ID - though this might cause tracking issues
      options.jobId = `fallback_${Date.now()}`;
    }
    
    console.log('EncodingService: Starting encoding job with options:', {
      ...options,
      inputPath: options.inputPath, // Log important properties directly
      outputPath: options.outputPath,
      jobId: options.jobId,
      overwriteInput: options.overwriteInput
    });
    
    // Start the encoding process
    const result = await electronAPI.startEncodingProcess(options);
    
    // Ensure result contains job ID for consistent tracking
    if (options.jobId && !result.jobId) {
      result.jobId = options.jobId;
    }
    
    return result;
  } catch (error) {
    console.error('EncodingService: Error creating encoding job:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to create encoding job: ${errorMessage}`,
      jobId // Return the original job ID even on failure
    };
  }
}

/**
 * Get the log for a specific encoding job
 * 
 * @param jobId The ID of the job to get logs for
 * @returns Promise with log content or null
 */
export async function getEncodingJobLog(jobId: string): Promise<string | null> {
  try {
    return await electronAPI.getEncodingLog(jobId);
  } catch (error) {
    console.error('EncodingService: Error fetching job log:', error);
    return null;
  }
}

// Interface for encoding progress update data
export interface EncodingProgressUpdate {
  jobId?: string;
  percent?: number;
  status?: string;
  fps?: number;
  frame?: number;
  totalFrames?: number;
}

// Interface for progress callbacks
export interface ProgressCallbacks {
  onStatus?: (status: string) => void;
  onPercent?: (percent: number) => void;
  onFrame?: (frame: number) => void;
  onTotalFrames?: (totalFrames: number) => void;
  onFps?: (fps: number) => void;
  onComplete?: () => void;
}

/**
 * Create a reusable progress handler that processes encoding progress updates
 * 
 * @param callbacks Object containing callback functions for different progress events
 * @param jobId Optional job ID to associate with progress updates
 * @param logPrefix Optional prefix for console logs (for debugging)
 * @returns Handler function to process progress updates
 */
export function createProgressHandler(
  callbacks: ProgressCallbacks, 
  jobId?: string,
  logPrefix = 'Progress'
) {
  return (data: EncodingProgressUpdate) => {
    // Ensure all progress updates include the job ID
    const updatedData = { ...data };
    if (jobId && !updatedData.jobId) {
      updatedData.jobId = jobId;
    }
    
    console.log(`[${logPrefix}] Received progress update for job ${updatedData.jobId || 'unknown'}:`, updatedData);
    
    // Update status always
    if (updatedData.status && callbacks.onStatus) {
      console.log(`[${logPrefix}] Status update: ${updatedData.status}`);
      callbacks.onStatus(updatedData.status);
      
      // Handle completion
      if (updatedData.status.toLowerCase().includes('complete')) {
        console.log(`[${logPrefix}] Encoding complete, setting progress to 100%`);
        if (callbacks.onPercent) callbacks.onPercent(100);
        if (callbacks.onComplete) callbacks.onComplete();
        return;
      }
    }

    // Update frame and totalFrames
    if (updatedData.frame !== undefined && callbacks.onFrame) {
      console.log(`[${logPrefix}] Frame update: ${updatedData.frame}`);
      callbacks.onFrame(updatedData.frame);
    }
    
    if (updatedData.totalFrames !== undefined && callbacks.onTotalFrames) {
      console.log(`[${logPrefix}] Total frames update: ${updatedData.totalFrames}`);
      callbacks.onTotalFrames(updatedData.totalFrames);
    }

    // Calculate percentage if possible and not complete
    if (updatedData.frame !== undefined && updatedData.totalFrames !== undefined && updatedData.totalFrames > 0 && callbacks.onPercent) {
      const calculatedPercent = Math.min(100, Math.max(0, (updatedData.frame / updatedData.totalFrames) * 100));
      console.log(`[${logPrefix}] Calculated percent: ${calculatedPercent.toFixed(1)}% (from ${updatedData.frame}/${updatedData.totalFrames})`);
      callbacks.onPercent(calculatedPercent);
    } else if (updatedData.percent !== undefined && callbacks.onPercent) { 
      // Use backend percent as fallback
      console.log(`[${logPrefix}] Using backend percent fallback: ${updatedData.percent.toFixed(1)}%`);
      callbacks.onPercent(updatedData.percent);
    }
    
    if (updatedData.fps !== undefined && callbacks.onFps) {
      console.log(`[${logPrefix}] FPS update: ${updatedData.fps}`);
      callbacks.onFps(updatedData.fps);
    }
  };
}

/**
 * Subscribe to progress events for encoding jobs
 * 
 * @param callback Function to call with progress updates
 * @returns Unsubscribe function
 */
export function subscribeToEncodingProgress(
  callback: (data: EncodingProgressUpdate) => void
): () => void {
  return electronAPI.subscribeEncodingProgress(callback);
} 