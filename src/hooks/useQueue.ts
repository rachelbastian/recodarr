import { useState, useEffect } from 'react';
import { EncodingPreset, ProbeData } from '../types.js';
import { TrackAction } from '../utils/encodingUtil.js';
import queueService, { EncodingJob, JobStatus, QueueEventCallbacks } from '../services/queueService.js';

/**
 * Hook for interacting with the encoding queue in components
 * 
 * @param callbacks Optional event callbacks for queue events
 * @returns Functions and data for queue interaction
 */
export const useQueue = (callbacks?: Partial<QueueEventCallbacks>) => {
  const [jobs, setJobs] = useState<EncodingJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [queueConfig, setQueueConfig] = useState(() => queueService.getConfig());
  
  // Set up event handling
  useEffect(() => {
    const eventCallbacks: QueueEventCallbacks = {
      onJobAdded: (job) => {
        setJobs(current => [...current, job]);
        callbacks?.onJobAdded?.(job);
      },
      onJobStarted: (job) => {
        setJobs(current => current.map(j => j.id === job.id ? job : j));
        callbacks?.onJobStarted?.(job);
      },
      onJobProgress: (job) => {
        setJobs(current => current.map(j => j.id === job.id ? job : j));
        callbacks?.onJobProgress?.(job);
      },
      onJobCompleted: (job, result) => {
        setJobs(current => current.map(j => j.id === job.id ? job : j));
        callbacks?.onJobCompleted?.(job, result);
      },
      onJobFailed: (job, error) => {
        setJobs(current => current.map(j => j.id === job.id ? job : j));
        callbacks?.onJobFailed?.(job, error);
      },
      onJobRemoved: (jobId) => {
        setJobs(current => current.filter(j => j.id !== jobId));
        callbacks?.onJobRemoved?.(jobId);
      },
      onQueueEmpty: () => {
        callbacks?.onQueueEmpty?.();
      },
      onQueueStarted: () => {
        setIsProcessing(true);
        callbacks?.onQueueStarted?.();
      },
      onQueuePaused: () => {
        setIsProcessing(false);
        callbacks?.onQueuePaused?.();
      },
      onHistoryCleared: () => {
        setJobs(queueService.getAllJobs());
        callbacks?.onHistoryCleared?.();
      }
    };
    
    // Register event callbacks
    queueService.setEventCallbacks(eventCallbacks);
    
    // Initial load
    setJobs(queueService.getAllJobs());
    
    // Cleanup on unmount
    return () => {
      queueService.setEventCallbacks({});
    };
  }, [callbacks]);
  
  /**
   * Add a file to the encoding queue
   */
  const addToQueue = (
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
  ): EncodingJob => {
    return queueService.addJob(
      inputPath,
      outputPath,
      overwriteInput,
      preset,
      probeData,
      trackSelections,
      priority
    );
  };
  
  /**
   * Remove a job from the queue
   */
  const removeFromQueue = (jobId: string): boolean => {
    return queueService.removeJob(jobId);
  };
  
  /**
   * Start processing the queue
   */
  const startQueue = (): void => {
    queueService.startProcessing();
  };
  
  /**
   * Pause processing the queue
   */
  const pauseQueue = (): void => {
    queueService.pauseProcessing();
  };
  
  /**
   * Clears all completed and failed jobs from the history.
   */
  const clearJobHistory = (): void => {
    queueService.clearCompletedAndFailedJobs();
  };
  
  /**
   * Update queue configuration
   */
  const updateQueueConfig = (config: { maxParallelJobs?: number; autoStart?: boolean }) => {
    queueService.updateConfig(config);
    setQueueConfig(queueService.getConfig());
  };
  
  /**
   * Get job counts by status
   */
  const getJobCounts = () => {
    return {
      total: jobs.length,
      queued: jobs.filter(job => job.status === 'queued').length,
      processing: jobs.filter(job => job.status === 'processing').length,
      completed: jobs.filter(job => job.status === 'completed').length,
      failed: jobs.filter(job => job.status === 'failed' || job.status === 'cancelled').length
    };
  };
  
  return {
    jobs,
    isProcessing,
    queueConfig,
    addToQueue,
    removeFromQueue,
    startQueue,
    pauseQueue,
    updateQueueConfig,
    getJobCounts,
    getJob: queueService.getJob,
    clearJobHistory
  };
};

export default useQueue; 