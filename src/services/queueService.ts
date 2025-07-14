import { ProbeData, EncodingPreset, EncodingResult } from '../types.js';
import { createEncodingJob, subscribeToEncodingProgress, EncodingProgressUpdate, ProgressCallbacks } from './encodingService.js';
import { TrackAction } from '../utils/encodingUtil.js';

// Access the Electron API
const electronAPI = window.electron;

// Job status types
export type JobStatus = 'queued' | 'processing' | 'verifying' | 'completed' | 'failed' | 'cancelled';

// Job interface
export interface EncodingJob {
  id: string;
  inputPath: string;
  outputPath: string;
  overwriteInput: boolean;
  preset: EncodingPreset | undefined;
  probeData: ProbeData;
  trackSelections: {
    audio: { [index: number]: TrackAction },
    subtitle: { [index: number]: TrackAction }
  };
  status: JobStatus;
  progress: number;
  fps?: number;
  frame?: number;
  totalFrames?: number;
  error?: string;
  result?: EncodingResult;
  priority: number; // Higher numbers = higher priority
  addedAt: Date;
  processingEndTime?: string;
  mediaId?: number; // Optional media database ID for updating on completion
}

// Queue configuration
export interface QueueConfig {
  maxParallelJobs: number;
  autoStart: boolean;
}

// Events for the queue
export interface QueueEventCallbacks {
  onJobAdded?: (job: EncodingJob) => void;
  onJobStarted?: (job: EncodingJob) => void;
  onJobProgress?: (job: EncodingJob) => void;
  onJobCompleted?: (job: EncodingJob, result: EncodingResult) => void;
  onJobFailed?: (job: EncodingJob, error: string) => void;
  onJobRemoved?: (jobId: string) => void;
  onQueueEmpty?: () => void;
  onQueueStarted?: () => void;
  onQueuePaused?: () => void;
  onHistoryCleared?: () => void;
}

class EncodingQueueService {
  private queue: EncodingJob[] = [];
  private processing: Set<string> = new Set(); // Set of job IDs currently processing
  private config: QueueConfig = {
    maxParallelJobs: 2, // Default to 2 parallel jobs
    autoStart: true
  };
  private isProcessing: boolean = false;
  private eventCallbacks: QueueEventCallbacks = {};
  private unsubscribeFunctions: Map<string, () => void> = new Map();
  private isInitialized: boolean = false;
  private lastProgressUpdate: Map<string, number> = new Map();
  
  // Constructor with optional config
  constructor(config?: Partial<QueueConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    // Load saved queue data
    this.initialize();
  }
  
  /**
   * Initialize the queue service by loading saved state
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      console.log('QueueService: Loading saved queue data');
      const savedData = await electronAPI.loadQueueData();
      
      if (savedData && Array.isArray(savedData.jobs)) {
        // Convert dates from strings back to Date objects
        const restoredJobs = savedData.jobs.map((job: any) => {
          let status = job.status;
          let error = job.error;
          // If a job was processing or verifying, mark it as failed due to interruption
          if (status === 'processing' || status === 'verifying') {
            status = 'failed';
            error = job.error ? `${job.error}; Job was interrupted due to application restart.` : 'Job was interrupted due to application restart.';
            console.warn(`QueueService: Job ${job.id} (was ${job.status}) marked as failed due to restart.`);
          }
          return {
            ...job,
            status,
            error,
            addedAt: new Date(job.addedAt),
            // Ensure progress is reset for interrupted jobs if they are requeued or similar logic is added later
            // For now, just ensure status reflects interruption.
            progress: (job.status === 'processing' || job.status === 'verifying') ? job.progress : job.progress,
          };
        });
        
        this.queue = restoredJobs; // Restore ALL jobs for history
        console.log(`QueueService: Restored ${restoredJobs.length} jobs (including historical)`);
        
        // Restore queue config if available
        if (savedData.config) {
          this.config = {
            ...this.config,
            ...savedData.config
          };
          console.log('QueueService: Restored queue configuration', this.config);
        }
      }
      
      this.isInitialized = true;
      
      // Sort the queue to ensure proper processing order
      this.sortQueue();
      
      // If autoStart is enabled and there are queued jobs, always start processing
      const hasQueuedJobs = this.queue.some(job => job.status === 'queued');
      if (this.config.autoStart && hasQueuedJobs) {
        console.log('QueueService: Auto-starting queue with restored jobs');
        // Short delay to ensure everything else is initialized
        setTimeout(() => {
          this.startProcessing();
          // Force queue processing to ensure jobs start
          this.forceProcessQueue();
        }, 500);
      }
    } catch (error) {
      console.error('QueueService: Error loading saved queue data:', error);
      this.isInitialized = true; // Mark as initialized anyway to avoid repeatedly trying
    }
  }
  
  /**
   * Save the current queue state to disk
   */
  private async saveQueueState(): Promise<void> {
    try {
      console.log('QueueService: Saving queue state');
      
      // Validate queue before saving
      if (!this.queue) {
        console.error('QueueService: Queue is undefined, initializing empty queue');
        this.queue = [];
      }
      
      // Only persist queued jobs, not completed/failed/processing
      const jobsToSave = this.queue.filter(job => !!job); // Save ALL jobs for history
      
      // Prepare valid data structure
      const dataToSave = {
        jobs: jobsToSave,
        config: this.config || { maxParallelJobs: 2, autoStart: true },
        savedAt: new Date().toISOString()
      };
      
      await electronAPI.saveQueueData(dataToSave);
      console.log(`QueueService: Saved ${jobsToSave.length} queued jobs`);
    } catch (error) {
      console.error('QueueService: Error saving queue state:', error);
    }
  }

  /**
   * Get current queue configuration
   */
  public getConfig(): QueueConfig {
    return { ...this.config };
  }

  /**
   * Set event callbacks for queue events
   */
  public setEventCallbacks(callbacks: QueueEventCallbacks): void {
    this.eventCallbacks = { ...this.eventCallbacks, ...callbacks };
  }

  /**
   * Update queue configuration
   */
  public updateConfig(config: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Save updated config
    this.saveQueueState();
    
    // If max parallel jobs changed, try to process more jobs
    if (config.maxParallelJobs && this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Add a job to the encoding queue
   */
  public addJob(
    inputPath: string,
    outputPath: string,
    overwriteInput: boolean,
    preset: EncodingPreset | undefined,
    probeData: ProbeData,
    trackSelections: {
      audio: { [index: number]: TrackAction },
      subtitle: { [index: number]: TrackAction }
    },
    priority: number = 0,
    mediaId?: number
  ): EncodingJob {
    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const job: EncodingJob = {
      id,
      inputPath,
      outputPath,
      overwriteInput,
      preset,
      probeData,
      trackSelections,
      status: 'queued',
      progress: 0,
      priority,
      addedAt: new Date(),
      mediaId
    };
    
    // Add job to queue
    this.queue.push(job);
    
    // Sort queue by priority (higher first) and then by add time (older first)
    this.sortQueue();
    
    // Save updated queue
    this.saveQueueState();
    
    // Notify listeners
    if (this.eventCallbacks.onJobAdded) {
      this.eventCallbacks.onJobAdded(job);
    }
    
    // Always start processing when a job is added, unless autoStart is disabled
    if (this.config.autoStart) {
      console.log(`QueueService: Auto-starting queue after adding job ${id}`);
      this.startProcessing();
      
      // Ensure the queue processes this job immediately 
      setTimeout(() => {
        // Check if the job is still queued and try to process it
        if (this.queue.some(j => j.id === id && j.status === 'queued')) {
          console.log(`QueueService: Force processing queue to pick up job ${id}`);
          this.forceProcessQueue();
        }
      }, 100); // Small delay to ensure job is properly added
    }
    
    return job;
  }

  /**
   * Get all jobs (both queued and processing)
   */
  public getAllJobs(): EncodingJob[] {
    return [...this.queue];
  }

  /**
   * Get a specific job by ID
   */
  public getJob(jobId: string): EncodingJob | undefined {
    return this.queue.find(job => job.id === jobId);
  }

  /**
   * Remove a job from the queue
   * If the job is currently processing, it will be cancelled
   */
  public removeJob(jobId: string): boolean {
    const jobIndex = this.queue.findIndex(job => job.id === jobId);
    
    if (jobIndex === -1) {
      return false;
    }
    
    const job = this.queue[jobIndex];
    
    // If job is processing, try to cancel it
    if (job.status === 'processing') {
      // TODO: Implement actual process cancellation when available
      // For now, just remove it from the processing set
      this.processing.delete(jobId);
      
      // Unsubscribe from progress events
      const unsubscribe = this.unsubscribeFunctions.get(jobId);
      if (unsubscribe) {
        unsubscribe();
        this.unsubscribeFunctions.delete(jobId);
      }
    }
    
    // Remove from queue
    this.queue.splice(jobIndex, 1);
    
    // Save updated queue
    this.saveQueueState();
    
    // Notify listeners
    if (this.eventCallbacks.onJobRemoved) {
      this.eventCallbacks.onJobRemoved(jobId);
    }
    
    // Process next job if available
    if (this.isProcessing) {
      this.processQueue();
    }
    
    return true;
  }

  /**
   * Start processing the queue
   */
  public startProcessing(): void {
    if (this.isProcessing) {
      // Even if already processing, try to process more jobs
      this.processQueue();
      return;
    }
    
    console.log('QueueService: Starting queue processing');
    this.isProcessing = true;
    
    // Notify listeners
    if (this.eventCallbacks.onQueueStarted) {
      this.eventCallbacks.onQueueStarted();
    }
    
    // Start processing jobs
    this.processQueue();
  }

  /**
   * Pause processing the queue
   * This doesn't stop currently processing jobs, but prevents new ones from starting
   */
  public pauseProcessing(): void {
    this.isProcessing = false;
    
    // Notify listeners
    if (this.eventCallbacks.onQueuePaused) {
      this.eventCallbacks.onQueuePaused();
    }
  }

  /**
   * Clear all queued jobs that aren't currently processing
   */
  public clearQueue(): void {
    // Keep only currently processing jobs
    this.queue = this.queue.filter(job => job.status === 'processing');
    
    // Save updated queue
    this.saveQueueState();
    
    // Notify that jobs were removed
    if (this.eventCallbacks.onQueueEmpty && this.queue.length === 0) {
      this.eventCallbacks.onQueueEmpty();
    }
  }

  /**
   * Sort the queue by priority and then by add time
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First sort by status (keep processing jobs at the front)
      if (a.status === 'processing' && b.status !== 'processing') return -1;
      if (a.status !== 'processing' && b.status === 'processing') return 1;
      
      // Then sort by priority (higher priority first)
      if (a.priority !== b.priority) return b.priority - a.priority;
      
      // Then sort by add time (older first)
      return a.addedAt.getTime() - b.addedAt.getTime();
    });
  }

  /**
   * Process jobs in the queue
   */
  private processQueue(): void {
    console.log('QueueService: processQueue called', {
      isProcessing: this.isProcessing,
      processingSize: this.processing.size,
      maxJobs: this.config.maxParallelJobs,
      queuedJobCount: this.queue.filter(job => job.status === 'queued').length
    });
    
    // If not processing or reached max parallel jobs, return
    if (!this.isProcessing) {
      console.log('QueueService: Queue is paused - not processing any jobs');
      return;
    }
    
    // Check if we've reached max parallel jobs
    if (this.processing.size >= this.config.maxParallelJobs) {
      console.log(`QueueService: Already processing maximum parallel jobs (${this.processing.size}/${this.config.maxParallelJobs})`);
      return;
    }
    
    // Get all queued jobs sorted by priority
    const queuedJobs = this.queue
      .filter(job => job.status === 'queued')
      .sort((a, b) => {
        // Sort by priority (higher first)
        if (a.priority !== b.priority) return b.priority - a.priority;
        // Then by added time (older first)
        return a.addedAt.getTime() - b.addedAt.getTime();
      });
    
    if (queuedJobs.length === 0) {
      console.log('QueueService: No queued jobs to process');
      
      if (this.processing.size === 0) {
        // All jobs are done
        console.log('QueueService: Queue is empty, no processing jobs');
        if (this.eventCallbacks.onQueueEmpty) {
          this.eventCallbacks.onQueueEmpty();
        }
      }
      return;
    }
    
    // Process as many jobs as we can up to the max parallel limit
    const availableSlots = this.config.maxParallelJobs - this.processing.size;
    const jobsToProcess = queuedJobs.slice(0, availableSlots);
    
    console.log(`QueueService: Starting ${jobsToProcess.length} new job(s) with ${this.processing.size} already processing`);
    
    // Start each job
    for (const job of jobsToProcess) {
      console.log(`QueueService: Starting job ${job.id}`);
      
      // Mark job as processing
      job.status = 'processing';
      job.progress = 0;
      this.processing.add(job.id);
      
      // Save updated queue
      this.saveQueueState();
      
      // Notify listeners
      if (this.eventCallbacks.onJobStarted) {
        this.eventCallbacks.onJobStarted(job);
      }
      
      // Start encoding process
      this.startEncodingJob(job);
    }
  }

  /**
   * Force process queue - will always check for new jobs regardless of current state
   * This helps ensure the queue continues processing even if state gets corrupted
   */
  public forceProcessQueue(): void {
    console.log('QueueService: Force processing queue');
    
    // Make sure we're in processing state
    if (!this.isProcessing) {
      this.isProcessing = true;
      
      // Notify listeners
      if (this.eventCallbacks.onQueueStarted) {
        this.eventCallbacks.onQueueStarted();
      }
    }
    
    // Clean up any stuck processing jobs
    const processingJobs = this.queue.filter(job => job.status === 'processing');
    const processingJobIds = new Set(processingJobs.map(job => job.id));
    
    // Find any processing jobs not in the processing set
    processingJobs.forEach(job => {
      if (!this.processing.has(job.id)) {
        console.log(`QueueService: Adding missing job ${job.id} to processing set`);
        this.processing.add(job.id);
      }
    });
    
    // Find any processing set entries not matching a processing job
    this.processing.forEach(jobId => {
      if (!processingJobIds.has(jobId)) {
        console.log(`QueueService: Removing stale job ${jobId} from processing set`);
        this.processing.delete(jobId);
      }
    });
    
    // Try to process next job
    this.processQueue();
  }

  /**
   * Handle progress updates for a job
   */
  private handleProgressUpdate(jobId: string, data: EncodingProgressUpdate): void {
    console.log(`QueueService: Received progress update for job ${jobId}:`, data);
    
    // Track the last update time for this job
    this.lastProgressUpdate.set(jobId, Date.now());
    
    const job = this.queue.find(j => j.id === jobId);
    
    if (!job) {
      console.warn(`QueueService: Cannot update job ${jobId} - not found in queue`);
      return;
    }
    
    if (job.status !== 'processing') {
      console.warn(`QueueService: Cannot update job ${jobId} - status is ${job.status}, not processing`);
      return;
    }
    
    // Flag to track if any job properties changed
    let hasChanges = false;
    let logChanges = [];
    
    // Update job progress
    if (data.percent !== undefined) {
      const oldProgress = job.progress;
      job.progress = data.percent;
      hasChanges = true;
      logChanges.push(`progress: ${oldProgress.toFixed(1)} -> ${data.percent.toFixed(1)}%`);
    }
    
    // Update other job properties
    if (data.fps !== undefined) {
      job.fps = data.fps;
      hasChanges = true;
      logChanges.push(`fps: ${data.fps}`);
    }
    
    if (data.frame !== undefined) {
      job.frame = data.frame;
      hasChanges = true;
      logChanges.push(`frame: ${data.frame}`);
    }
    
    if (data.totalFrames !== undefined) {
      job.totalFrames = data.totalFrames;
      hasChanges = true;
      logChanges.push(`totalFrames: ${data.totalFrames}`);
    }
    
    // Notify listeners if anything changed
    if (hasChanges) {
      console.log(`QueueService: Updated job ${jobId} - ${logChanges.join(', ')}`);
      
      // Force a deep clone to ensure React detects changes
      const updatedJob = JSON.parse(JSON.stringify(job));
      
      if (this.eventCallbacks.onJobProgress) {
        console.log(`QueueService: Triggering onJobProgress for job ${jobId} with progress ${updatedJob.progress}%`);
        this.eventCallbacks.onJobProgress(updatedJob);
      } else {
        console.warn(`QueueService: No onJobProgress callback registered despite receiving progress updates`);
      }
      
      // Schedule a state save after a batch of updates (debounced)
      this.debouncedSaveState();
    }
  }

  // Create a debounced version of saveQueueState to avoid excessive saves
  private debouncedSaveState = (() => {
    let timeout: NodeJS.Timeout | null = null;
    
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      
      timeout = setTimeout(() => {
        this.saveQueueState();
        timeout = null;
      }, 2000); // Save state after 2 seconds of no updates
    };
  })();

  /**
   * Handle job completion
   */
  private async handleJobCompletion(jobId: string, result: EncodingResult): Promise<void> {
    console.log(`QueueService: Job ${jobId} completed with result:`, result.success);

    // Find the job in the queue
    const job = this.queue.find(j => j.id === jobId);
    if (!job) {
      console.error(`QueueService: Cannot find job ${jobId} in queue.`);
      return;
    }

    // Update job with result details
    job.result = result;
    job.progress = 100; // Set to 100% for completed
    job.processingEndTime = new Date().toISOString();
    
    if (!result.success) {
      // If job failed, set error and status
      job.status = 'failed';
      job.error = result.error || 'Unknown error occurred during encoding';
      console.error(`QueueService: Job ${jobId} failed:`, job.error);
      
      // Clear encodingJobId from database for failed jobs if mediaId is available
      if (job.mediaId) {
        try {
          await electronAPI.dbQuery(
            'UPDATE media SET encodingJobId = NULL WHERE id = ?',
            [job.mediaId]
          );
          console.log(`QueueService: Cleared encodingJobId for failed encoding job ${jobId}, media ID ${job.mediaId}`);
        } catch (dbError) {
          console.error(`QueueService: Failed to clear encodingJobId for failed encoding job ${jobId}:`, dbError);
        }
      }
      
      // Save updated queue
      this.saveQueueState();
      
      // Notify listeners
      if (this.eventCallbacks.onJobFailed) {
        this.eventCallbacks.onJobFailed(job, job.error);
      }
      
      // Process next job
      console.log('QueueService: Calling processQueue after job failure');
      setTimeout(() => this.processQueue(), 100); // Small delay to ensure state is updated
      return;
    }
    
    // If we get here, job completed successfully
    // Update file sizes and reduction percentage
    job.status = 'verifying';
    job.result.initialSizeMB = result.initialSizeMB;
    job.result.finalSizeMB = result.finalSizeMB;
    job.result.reductionPercent = result.reductionPercent;
    
    // If job was successful and overwriteInput was set, replace the input file with the output file
    if (result.success && job.overwriteInput && job.inputPath !== job.outputPath) {
      console.log(`QueueService: Job ${jobId} needs to replace input file ${job.inputPath} with output file ${job.outputPath}`);
      
      // Use our new finalizeEncodedFile function directly here for a cleaner process
      this.finalizeEncodedFileForJob(job);
    } else {
      job.status = 'completed';
      
      // Update database to mark as processed if mediaId is available
      if (job.mediaId) {
        try {
          await electronAPI.dbQuery(
            'UPDATE media SET encodingJobId = ? WHERE id = ?',
            [job.id, job.mediaId]
          );
          console.log(`QueueService: Updated media record ${job.mediaId} with job ID ${job.id}`);
        } catch (dbError) {
          console.error(`QueueService: Failed to update media record for job ${jobId}:`, dbError);
        }
      }
      
      // Save updated queue
      this.saveQueueState();
      
      // Notify listeners
      if (result.success && this.eventCallbacks.onJobCompleted) {
        this.eventCallbacks.onJobCompleted(job, result);
      }
      
      // Process next job
      console.log('QueueService: Calling processQueue after job completion');
      setTimeout(() => this.processQueue(), 100); // Small delay to ensure state is updated
    }
  }
  
  /**
   * Finalizes an encoded file by using the main process handler
   */
  private async finalizeEncodedFileForJob(job: EncodingJob): Promise<void> {
    if (!job) {
      console.error(`QueueService: Cannot finalize file - job is undefined`);
      return;
    }

    const { id: jobId, inputPath, outputPath } = job;
    
    // Validate required paths
    if (!inputPath || !outputPath) {
      console.error(`QueueService: Missing required paths for job ${jobId}. inputPath: ${inputPath}, outputPath: ${outputPath}`);
      job.error = "Missing required file paths for finalization";
      job.status = 'failed';
      
      // Clear encodingJobId from database for failed jobs if mediaId is available
      if (job.mediaId) {
        try {
          await electronAPI.dbQuery(
            'UPDATE media SET encodingJobId = NULL WHERE id = ?',
            [job.mediaId]
          );
          console.log(`QueueService: Cleared encodingJobId for missing paths job ${jobId}, media ID ${job.mediaId}`);
        } catch (dbError) {
          console.error(`QueueService: Failed to clear encodingJobId for missing paths job ${jobId}:`, dbError);
        }
      }
      
      this.saveQueueState();
      
      if (this.eventCallbacks.onJobFailed) {
        this.eventCallbacks.onJobFailed(job, job.error);
      }
      
      setTimeout(() => this.processQueue(), 100);
      return;
    }
    
    try {
      console.log(`QueueService: Finalizing encoded file for job ${jobId}`);
      
      // Use the result's outputPath if available, which should be the temporary file
      let tempFilePath = job.result?.outputPath || '';
      console.log(`QueueService: Result output path: ${tempFilePath}`);
      
      // If there's no outputPath in the result or if it's empty, try to construct temp file path
      if (!tempFilePath) {
        // Check if outputPath already has _tmp suffix
        if (outputPath.toLowerCase().endsWith('_tmp.mkv') || 
            outputPath.toLowerCase().endsWith('_tmp.mp4')) {
          tempFilePath = outputPath;
          console.log(`QueueService: Using output path directly as it appears to be a temp file: ${tempFilePath}`);
        } else {
          // Try to construct potential temp path
          const fileExtension = outputPath.substring(outputPath.lastIndexOf('.'));
          const baseNameWithoutExt = outputPath.substring(0, outputPath.lastIndexOf('.'));
          tempFilePath = `${baseNameWithoutExt}_tmp${fileExtension}`;
          console.log(`QueueService: Constructed potential temp path: ${tempFilePath}`);
        }
      }
      
      // Log the paths we'll be working with
      console.log(`QueueService: Temporary file path to check: ${tempFilePath}`);
      console.log(`QueueService: Final destination path: ${inputPath}`);
      
      // Verify the temp file exists and has content
      const tempSize = await electronAPI.getFileSize(tempFilePath);
      if (!tempSize || tempSize === 0) {
        // If the temp file doesn't exist or is empty, try the original output path
        console.log(`QueueService: Temp file not found or empty, checking original output path: ${outputPath}`);
        const outputSize = await electronAPI.getFileSize(outputPath);
        if (!outputSize || outputSize === 0) {
          throw new Error(`Neither temporary file (${tempFilePath}) nor output file (${outputPath}) exists or they have zero size`);
        }
        
        // Use the output path if it exists and has content
        tempFilePath = outputPath;
        console.log(`QueueService: Using output file for finalization: ${outputPath}, size: ${outputSize} bytes`);
      } else {
        console.log(`QueueService: Using temporary file for finalization: ${tempFilePath}, size: ${tempSize} bytes`);
      }
      
      // Now finalize the file with the confirmed source path
      const result = await electronAPI.finalizeEncodedFile({
        tempFilePath: tempFilePath,
        finalFilePath: inputPath, // In overwrite mode, we replace the input file
        jobId: jobId || "", // Ensure jobId is always a string
        isOverwrite: true,
        originalFilePath: inputPath
      });
      
      if (result.success) {
        console.log(`QueueService: Successfully finalized file for job ${jobId}`);
        console.log(`QueueService: Final path: ${result.finalPath}`);
        
        // Update job details
        job.outputPath = inputPath; // Since we replaced the input file
        job.status = 'completed';
        
        // Update database to mark as processed if mediaId is available
        if (job.mediaId) {
          try {
            await electronAPI.dbQuery(
              'UPDATE media SET encodingJobId = ? WHERE id = ?',
              [job.id, job.mediaId]
            );
            console.log(`QueueService: Updated media record ${job.mediaId} with job ID ${job.id}`);
          } catch (dbError) {
            console.error(`QueueService: Failed to update media record for job ${jobId}:`, dbError);
          }
        }
        
        this.saveQueueState();
        
        // Notify listeners
        if (this.eventCallbacks.onJobCompleted) {
          this.eventCallbacks.onJobCompleted(job, job.result!);
        }
      } else {
        // Handle finalization failure
        console.error(`QueueService: Failed to finalize file for job ${jobId}: ${result.error}`);
        job.error = result.error || "Failed to finalize encoded file";
        job.status = 'failed';
        
        // Clear encodingJobId from database for failed jobs if mediaId is available
        if (job.mediaId) {
          try {
            await electronAPI.dbQuery(
              'UPDATE media SET encodingJobId = NULL WHERE id = ?',
              [job.mediaId]
            );
            console.log(`QueueService: Cleared encodingJobId for failed finalization job ${jobId}, media ID ${job.mediaId}`);
          } catch (dbError) {
            console.error(`QueueService: Failed to clear encodingJobId for failed finalization job ${jobId}:`, dbError);
          }
        }
        
        this.saveQueueState();
        
        if (this.eventCallbacks.onJobFailed) {
          this.eventCallbacks.onJobFailed(job, job.error);
        }
      }
    } catch (error) {
      // Handle unexpected errors
      console.error(`QueueService: Error finalizing file for job ${jobId}:`, error);
      job.error = `Error finalizing file: ${error instanceof Error ? error.message : String(error)}`;
      job.status = 'failed';
      
      // Clear encodingJobId from database for failed jobs if mediaId is available
      if (job.mediaId) {
        try {
          await electronAPI.dbQuery(
            'UPDATE media SET encodingJobId = NULL WHERE id = ?',
            [job.mediaId]
          );
          console.log(`QueueService: Cleared encodingJobId for unexpected error job ${jobId}, media ID ${job.mediaId}`);
        } catch (dbError) {
          console.error(`QueueService: Failed to clear encodingJobId for unexpected error job ${jobId}:`, dbError);
        }
      }
      
      this.saveQueueState();
      
      if (this.eventCallbacks.onJobFailed) {
        this.eventCallbacks.onJobFailed(job, job.error);
      }
    } finally {
      // Process next job regardless of outcome
      console.log(`QueueService: Processing next job after file finalization for job ${jobId}`);
      setTimeout(() => this.processQueue(), 100);
    }
  }
  
  /**
   * Clean up any temporary files that might be left from the encoding process
   */
  private async cleanupTempFiles(originalPath: string): Promise<void> {
    // Validate the path parameter
    if (!originalPath) {
      console.warn(`QueueService: Cannot clean up temporary files - original path is undefined or empty`);
      return;
    }
    
    try {
      console.log(`QueueService: Starting cleanup for temporary files related to: ${originalPath}`);
      
      // Get parts of the original path
      const lastDot = originalPath.lastIndexOf('.');
      const lastSlash = Math.max(originalPath.lastIndexOf('/'), originalPath.lastIndexOf('\\'));
      
      if (lastDot === -1 || lastSlash === -1) {
        console.log(`QueueService: Cannot parse path for cleanup: ${originalPath}`);
        return;
      }
      
      const basePath = originalPath.substring(0, lastDot);
      const extension = originalPath.substring(lastDot);
      const directory = originalPath.substring(0, lastSlash + 1);
      const fileName = originalPath.substring(lastSlash + 1, lastDot);
      
      // Common temp file patterns
      const tempPatterns = [
        `${basePath}.tmp${extension}`,
        `${basePath}_tmp${extension}`,
        `${basePath}_encoded_tmp${extension}`,
        `${basePath}_encoded${extension}`,
        `${directory}${fileName}_tmp${extension}`,
        `${directory}${fileName}.tmp${extension}`,
        `${basePath}.backup`,
        `${originalPath}.backup`,
        `${originalPath}.backup-*`  // For timestamp-based backups
      ];
      
      console.log(`QueueService: Looking for these temp file patterns:`, tempPatterns);
      
      // Try to delete each possible temp file (ignore errors if files don't exist)
      for (const tempPattern of tempPatterns) {
        try {
          // Skip undefined or empty patterns
          if (!tempPattern) {
            continue;
          }
          
          // For wildcards, we need to check if the pattern contains a wildcard
          if (tempPattern.includes('*')) {
            const wildcardPart = tempPattern.substring(0, tempPattern.indexOf('*'));
            const fileDir = wildcardPart.substring(0, Math.max(wildcardPart.lastIndexOf('/'), wildcardPart.lastIndexOf('\\')));
            
            // This would require a directory listing to find matching files
            // As a simplification for now, we'll just print a message
            console.log(`QueueService: Pattern with wildcard not fully supported: ${tempPattern}`);
            console.log(`QueueService: Consider implementing directory listing in main process for: ${fileDir}`);
            continue;
          }
          
          await electronAPI.deleteFile(tempPattern);
          console.log(`QueueService: Deleted temp file: ${tempPattern}`);
        } catch (e) {
          // Ignore errors for files that don't exist
          // But log other errors
          if (e instanceof Error && !e.message.includes('ENOENT')) {
            console.warn(`QueueService: Error deleting temp file ${tempPattern}: ${e.message}`);
          }
        }
      }
      
      console.log(`QueueService: Completed cleanup for: ${originalPath}`);
    } catch (err) {
      console.warn(`QueueService: Error in cleanupTempFiles: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Handle job error
   */
  private async handleJobError(jobId: string, error: string): Promise<void> {
    const job = this.queue.find(j => j.id === jobId);
    
    if (!job) {
      return;
    }
    
    // Update job status
    job.status = 'failed';
    job.error = error;
    
    // Clear encodingJobId from database for failed jobs if mediaId is available
    if (job.mediaId) {
      try {
        await electronAPI.dbQuery(
          'UPDATE media SET encodingJobId = NULL WHERE id = ?',
          [job.mediaId]
        );
        console.log(`QueueService: Cleared encodingJobId for failed job ${jobId}, media ID ${job.mediaId}`);
      } catch (dbError) {
        console.error(`QueueService: Failed to clear encodingJobId for failed job ${jobId}:`, dbError);
      }
    }
    
    // Remove from processing set
    this.processing.delete(jobId);
    
    // Save updated queue
    this.saveQueueState();
    
    // Notify listeners
    if (this.eventCallbacks.onJobFailed) {
      this.eventCallbacks.onJobFailed(job, error);
    }
    
    // Process next job
    this.processQueue();
  }

  /**
   * Start an encoding job with progress tracking
   */
  private async startEncodingJob(job: EncodingJob): Promise<void> {
    try {
      console.log(`QueueService: Starting encoding job ${job.id}`);
      
      // Update job initial status to ensure UI gets refreshed
      this.handleProgressUpdate(job.id, { status: 'Starting encoding process...', percent: 0 });
      
      // Subscribe to progress updates with a job-specific handler
      const unsubscribe = subscribeToEncodingProgress((data: EncodingProgressUpdate) => {
        console.log(`QueueService: Progress event received: ${JSON.stringify({
          dataJobId: data.jobId,
          currentJobId: job.id,
          percent: data.percent
        })}`);
        
        // Only process this update if it belongs to this job or has no jobId
        if (!data.jobId || data.jobId === job.id) {
          // If no job ID was provided, add it for consistent tracking
          if (!data.jobId) {
            data.jobId = job.id;
            console.log(`QueueService: Added missing jobId ${job.id} to progress update`);
          }
          this.handleProgressUpdate(job.id, data);
        } else if (data.jobId !== job.id) {
          // This is a mismatch - log it but try to use it anyway if no other updates are coming
          console.warn(`QueueService: Job ID mismatch in progress update. Expected: ${job.id}, Received: ${data.jobId}`);
          
          // If no other handlers pick this up, we might still want to show some progress
          // Check if this job has had any progress updates recently
          const lastUpdate = this.lastProgressUpdate.get(job.id) || 0;
          const now = Date.now();
          if (now - lastUpdate > 5000) { // No updates for 5 seconds
            console.log(`QueueService: No recent updates for job ${job.id}, applying mismatched update anyway`);
            this.handleProgressUpdate(job.id, data);
          }
        }
      });
      
      // Save unsubscribe function
      this.unsubscribeFunctions.set(job.id, unsubscribe);
      
      // Start encoding - CRITICAL: Pass the exact same job ID to ensure progress updates match
      const result = await createEncodingJob(
        job.inputPath,
        job.outputPath,
        job.overwriteInput,
        job.preset,
        job.probeData,
        job.trackSelections,
        // Pass the job ID to identify this job's progress updates
        job.id // This must exactly match the job.id we're using here
      );
      
      // Check if we got a different log file ID from the result
      // This happens when the encoding process uses a different ID (like UUID) than our job ID
      const resultWithLogId = result as { logFileId?: string; jobId?: string; success: boolean; error?: string };
      if (resultWithLogId.logFileId && resultWithLogId.logFileId !== job.id) {
        console.log(`QueueService: Detected different log file ID (${resultWithLogId.logFileId}) than job ID (${job.id})`);
        
        try {
          // Import the function to associate log with job
          const { associateLogWithJob } = await import('../utils/jobLogUtil.js');
          
          // Associate the actual log file ID with our job ID
          await associateLogWithJob(job.id, resultWithLogId.logFileId);
          console.log(`QueueService: Associated log file ${resultWithLogId.logFileId} with job ${job.id}`);
        } catch (error) {
          console.error('QueueService: Failed to associate log with job:', error);
        }
      }
      
      // Update job with result
      await this.handleJobCompletion(job.id, result);
      
      // Clean up
      unsubscribe();
      this.unsubscribeFunctions.delete(job.id);
      
    } catch (error) {
      // Handle error
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.handleJobError(job.id, errorMessage);
      
      // Clean up
      const unsubscribe = this.unsubscribeFunctions.get(job.id);
      if (unsubscribe) {
        unsubscribe();
        this.unsubscribeFunctions.delete(job.id);
      }
    }
  }

  /**
   * Ensure queue is processing - convenience method that starts processing and forces queue check
   * This can be called from anywhere in the application to make sure the queue is running
   */
  public ensureProcessing(): void {
    console.log('QueueService: Ensuring queue is processing');
    
    // Don't do anything if the queue is explicitly paused
    if (!this.config.autoStart) {
      console.log('QueueService: Queue autoStart is disabled, not starting');
      return;
    }
    
    // Start processing if not already
    if (!this.isProcessing) {
      this.startProcessing();
    }
    
    // Force check for queued jobs
    this.forceProcessQueue();
  }

  /**
   * Clear all completed, failed, and cancelled jobs from the queue.
   */
  public clearCompletedAndFailedJobs(): void {
    const initialCount = this.queue.length;
    // Keep only jobs that are queued, processing, or verifying
    this.queue = this.queue.filter(job => 
      job.status === 'queued' || 
      job.status === 'processing' || 
      job.status === 'verifying'
    );
    const removedCount = initialCount - this.queue.length;

    if (removedCount > 0) {
      console.log(`QueueService: Cleared ${removedCount} completed, failed, or cancelled jobs from history.`);
      this.saveQueueState(); // Save the modified queue
      if (this.eventCallbacks.onHistoryCleared) {
        this.eventCallbacks.onHistoryCleared();
      }
    } else {
      console.log("QueueService: No completed, failed, or cancelled jobs to clear.");
    }
  }
}

// Create a singleton instance
const queueService = new EncodingQueueService();

export default queueService;