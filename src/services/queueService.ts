import { ProbeData, EncodingPreset, EncodingResult } from '../types.js';
import { createEncodingJob, subscribeToEncodingProgress, EncodingProgressUpdate, ProgressCallbacks } from './encodingService.js';
import { TrackAction } from '../utils/encodingUtil.js';

// Access the Electron API
const electronAPI = window.electron;

// Job status types
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

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
        const restoredJobs = savedData.jobs.map((job: any) => ({
          ...job,
          addedAt: new Date(job.addedAt)
        }));
        
        // Restore only non-completed jobs with status 'queued' 
        // (we don't want to restore 'processing' jobs that weren't properly completed)
        const queuedJobs = restoredJobs.filter((job: EncodingJob) => 
          job.status === 'queued'
        );
        
        this.queue = queuedJobs;
        console.log(`QueueService: Restored ${queuedJobs.length} queued jobs`);
        
        // Restore queue config if available
        if (savedData.config) {
          this.config = {
            ...this.config,
            ...savedData.config
          };
          console.log('QueueService: Restored queue configuration');
        }
      }
      
      this.isInitialized = true;
      
      // If autoStart is enabled and there are queued jobs, start processing
      if (this.config.autoStart && this.queue.some(job => job.status === 'queued')) {
        this.startProcessing();
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
      
      // Only persist queued jobs, not completed/failed/processing
      const jobsToSave = this.queue.filter(job => job.status === 'queued');
      
      const dataToSave = {
        jobs: jobsToSave,
        config: this.config,
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
    priority: number = 0
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
      addedAt: new Date()
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
    
    // Start processing if autoStart is enabled
    if (this.config.autoStart && !this.isProcessing) {
      this.startProcessing();
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
      return;
    }
    
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
    if (!this.isProcessing || this.processing.size >= this.config.maxParallelJobs) {
      console.log('QueueService: Skipping processQueue - not processing or max jobs reached');
      return;
    }
    
    // Find the next queued job
    const nextJob = this.queue.find(job => job.status === 'queued');
    
    if (!nextJob) {
      // No more jobs to process
      console.log('QueueService: No more queued jobs found');
      
      if (this.processing.size === 0) {
        // All jobs are done
        console.log('QueueService: Queue is empty, no processing jobs');
        if (this.eventCallbacks.onQueueEmpty) {
          this.eventCallbacks.onQueueEmpty();
        }
      }
      return;
    }
    
    console.log(`QueueService: Found next job to process - ${nextJob.id}`);
    
    // Mark job as processing
    nextJob.status = 'processing';
    nextJob.progress = 0;
    this.processing.add(nextJob.id);
    
    // Save updated queue
    this.saveQueueState();
    
    // Notify listeners
    if (this.eventCallbacks.onJobStarted) {
      this.eventCallbacks.onJobStarted(nextJob);
    }
    
    // Start encoding process
    this.startEncodingJob(nextJob);
    
    // Check if we can process more jobs
    if (this.processing.size < this.config.maxParallelJobs) {
      console.log('QueueService: Can process more jobs, calling processQueue again');
      this.processQueue();
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
  private handleJobCompletion(jobId: string, result: EncodingResult): void {
    console.log(`QueueService: Job ${jobId} completed with result:`, result.success);
    
    const job = this.queue.find(j => j.id === jobId);
    
    if (!job) {
      console.warn(`QueueService: Job ${jobId} not found for completion`);
      return;
    }
    
    // Update job status
    job.status = result.success ? 'completed' : 'failed';
    job.progress = result.success ? 100 : job.progress;
    job.error = result.error;
    job.result = result;
    
    // Remove from processing set
    this.processing.delete(jobId);
    console.log(`QueueService: Removed job ${jobId} from processing set, remaining:`, this.processing.size);
    
    // Save updated queue
    this.saveQueueState();
    
    // Notify listeners
    if (result.success && this.eventCallbacks.onJobCompleted) {
      this.eventCallbacks.onJobCompleted(job, result);
    } else if (!result.success && this.eventCallbacks.onJobFailed) {
      this.eventCallbacks.onJobFailed(job, result.error || 'Unknown error');
    }
    
    // Process next job
    console.log('QueueService: Calling processQueue after job completion');
    setTimeout(() => this.processQueue(), 100); // Small delay to ensure state is updated
  }

  /**
   * Handle job error
   */
  private handleJobError(jobId: string, error: string): void {
    const job = this.queue.find(j => j.id === jobId);
    
    if (!job) {
      return;
    }
    
    // Update job status
    job.status = 'failed';
    job.error = error;
    
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
      console.log(`QueueService: Starting encoding for job ${job.id}`);
      
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
      this.handleJobCompletion(job.id, result);
      
      // Clean up
      unsubscribe();
      this.unsubscribeFunctions.delete(job.id);
      
    } catch (error) {
      // Handle error
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleJobError(job.id, errorMessage);
      
      // Clean up
      const unsubscribe = this.unsubscribeFunctions.get(job.id);
      if (unsubscribe) {
        unsubscribe();
        this.unsubscribeFunctions.delete(job.id);
      }
    }
  }
}

// Create a singleton instance
const queueService = new EncodingQueueService();

export default queueService; 