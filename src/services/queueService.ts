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
    // If not processing or reached max parallel jobs, return
    if (!this.isProcessing || this.processing.size >= this.config.maxParallelJobs) {
      return;
    }
    
    // Find the next queued job
    const nextJob = this.queue.find(job => job.status === 'queued');
    
    if (!nextJob) {
      // No more jobs to process
      if (this.processing.size === 0) {
        // All jobs are done
        if (this.eventCallbacks.onQueueEmpty) {
          this.eventCallbacks.onQueueEmpty();
        }
      }
      return;
    }
    
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
      this.processQueue();
    }
  }

  /**
   * Start an encoding job with progress tracking
   */
  private async startEncodingJob(job: EncodingJob): Promise<void> {
    try {
      // Subscribe to progress updates
      const unsubscribe = subscribeToEncodingProgress((data: EncodingProgressUpdate) => {
        this.handleProgressUpdate(job.id, data);
      });
      
      // Save unsubscribe function
      this.unsubscribeFunctions.set(job.id, unsubscribe);
      
      // Start encoding
      const result = await createEncodingJob(
        job.inputPath,
        job.outputPath,
        job.overwriteInput,
        job.preset,
        job.probeData,
        job.trackSelections
      );
      
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

  /**
   * Handle progress updates for a job
   */
  private handleProgressUpdate(jobId: string, data: EncodingProgressUpdate): void {
    const job = this.queue.find(j => j.id === jobId);
    
    if (!job || job.status !== 'processing') {
      return;
    }
    
    // Update job progress
    if (data.percent !== undefined) {
      job.progress = data.percent;
    }
    
    if (data.fps !== undefined) {
      job.fps = data.fps;
    }
    
    if (data.frame !== undefined) {
      job.frame = data.frame;
    }
    
    if (data.totalFrames !== undefined) {
      job.totalFrames = data.totalFrames;
    }
    
    // Notify listeners
    if (this.eventCallbacks.onJobProgress) {
      this.eventCallbacks.onJobProgress(job);
    }
  }

  /**
   * Handle job completion
   */
  private handleJobCompletion(jobId: string, result: EncodingResult): void {
    const job = this.queue.find(j => j.id === jobId);
    
    if (!job) {
      return;
    }
    
    // Update job status
    job.status = result.success ? 'completed' : 'failed';
    job.progress = result.success ? 100 : job.progress;
    job.error = result.error;
    job.result = result;
    
    // Remove from processing set
    this.processing.delete(jobId);
    
    // Save updated queue
    this.saveQueueState();
    
    // Notify listeners
    if (result.success && this.eventCallbacks.onJobCompleted) {
      this.eventCallbacks.onJobCompleted(job, result);
    } else if (!result.success && this.eventCallbacks.onJobFailed) {
      this.eventCallbacks.onJobFailed(job, result.error || 'Unknown error');
    }
    
    // Process next job
    this.processQueue();
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
}

// Create a singleton instance
const queueService = new EncodingQueueService();

export default queueService; 