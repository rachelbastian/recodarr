import { EncodingJob } from '../services/queueService';

// Access Electron API
const electronAPI = window.electron;

/**
 * JobLogUtil provides functions to save and retrieve encoding job logs
 * This allows tracking detailed information about encoding jobs for debugging and history
 */

export interface JobLogEntry {
  timestamp: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: any;
}

export interface JobLog {
  jobId: string;
  entries: JobLogEntry[];
  createdAt: string;
  updatedAt: string;
  mediaId?: number; // Optional link to media item in DB
  summary?: string; // Brief summary of log (e.g., success/failure message)
}

/**
 * Get the log for a specific encoding job
 * 
 * @param jobId The ID of the job to get logs for
 * @returns Promise with log content or null
 */
export async function getJobLog(jobId: string): Promise<string | null> {
  try {
    // Try with the current job ID first
    let log = await electronAPI.getEncodingLog(jobId);
    
    // If no log found, check if there's a mapping in the database
    if (!log) {
      console.log(`JobLogUtil: Log not found with ID ${jobId}, checking for mappings`);
      
      try {
        // Check the job_log_mappings table for a mapping
        const mappings = await electronAPI.dbQuery(
          'SELECT logFileId FROM job_log_mappings WHERE jobId = ?',
          [jobId]
        );
        
        if (mappings && mappings.length > 0 && mappings[0].logFileId) {
          const logFileId = mappings[0].logFileId;
          console.log(`JobLogUtil: Found mapping for job ${jobId} -> log ${logFileId}`);
          
          // Try to get the log with the mapped ID
          log = await electronAPI.getEncodingLog(logFileId);
          
          if (log) {
            console.log(`JobLogUtil: Successfully retrieved log using mapped ID ${logFileId}`);
            return log;
          } else {
            console.log(`JobLogUtil: Mapping found but log file still not accessible for ${logFileId}`);
          }
        }
        
        // If no mapping found or mapped log not accessible, try some heuristics
        if (!log) {
          console.log(`JobLogUtil: No mapping found for job ${jobId}, checking UUID format`);
          
          // If this is our job_xxx format but logs might be stored with UUIDs
          if (jobId.startsWith('job_')) {
            // Check if this job is referenced in the media table
            const mediaItems = await electronAPI.dbQuery(
              'SELECT encodingJobId FROM media WHERE encodingJobId = ?',
              [jobId]
            );
            
            if (mediaItems && mediaItems.length > 0) {
              console.log(`JobLogUtil: Found media item with job ID ${jobId}, but log file wasn't found`);
              // Here we could potentially try to find the log file by examining the media file path
            }
          } 
          // If the provided ID is already a UUID, the log truly doesn't exist or has a different name
          else if (isUUID(jobId)) {
            console.log(`JobLogUtil: UUID format job ID ${jobId} provided, but log not found`);
          }
        }
      } catch (dbError) {
        console.error('JobLogUtil: Error querying DB for job log mappings:', dbError);
      }
    }
    
    return log;
  } catch (error) {
    console.error('JobLogUtil: Error fetching job log:', error);
    return null;
  }
}

/**
 * Check if a string is in UUID format
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Open the log file for a job in the user's default text editor
 * 
 * @param jobId The ID of the job to open logs for
 * @returns Promise with success status
 */
export async function openJobLog(jobId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // First check if we can access the log with the provided job ID
    const hasLog = await getJobLog(jobId);
    
    if (hasLog) {
      // If we found a log, use the existing openEncodingLog method
      return await electronAPI.openEncodingLog(jobId);
    } else {
      // If not found, try to determine the correct log path based on app data location
      // Display an information message to the user
      const appDataPath = "C:\\Users\\Administrator\\AppData\\Roaming\\re-codarr\\encoding_logs";
      return { 
        success: false, 
        error: `Log file for job ${jobId} not found. You can manually check the logs directory at: ${appDataPath}` 
      };
    }
  } catch (error) {
    console.error('JobLogUtil: Error opening job log:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Save media reference to job logs in the database
 * This creates a link between a media item and its encoding job
 * 
 * @param jobId The encoding job ID
 * @param mediaId The media item ID
 * @returns Promise with success status
 */
export async function saveJobMediaReference(jobId: string, mediaId: number): Promise<boolean> {
  try {
    // Update the media record with the encoding job ID
    const result = await electronAPI.dbQuery(
      'UPDATE media SET encodingJobId = ? WHERE id = ?',
      [jobId, mediaId]
    );
    
    console.log(`JobLogUtil: Saved job-media reference for job ${jobId} and media ${mediaId}`);
    return true;
  } catch (error) {
    console.error('JobLogUtil: Error saving job-media reference:', error);
    return false;
  }
}

/**
 * Parse raw log text into structured log entries
 * 
 * @param rawLog The raw log text from ffmpeg
 * @returns Array of structured log entries
 */
export function parseLogEntries(rawLog: string): JobLogEntry[] {
  if (!rawLog) return [];
  
  const lines = rawLog.split('\n');
  const entries: JobLogEntry[] = [];
  
  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;
    
    // Default entry
    let entry: JobLogEntry = {
      timestamp: new Date().toISOString(),
      message: line,
      level: 'info'
    };
    
    // Try to extract timestamp if available
    const timestampMatch = line.match(/\[(.*?)\]/);
    if (timestampMatch && timestampMatch[1]) {
      // Try to convert timestamp to ISO string, fallback to original
      try {
        const dateObj = new Date(timestampMatch[1]);
        if (!isNaN(dateObj.getTime())) {
          entry.timestamp = dateObj.toISOString();
        }
      } catch (e) {
        // Keep original timestamp as string if parsing fails
      }
    }
    
    // Determine log level based on content
    if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fatal')) {
      entry.level = 'error';
    } else if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn')) {
      entry.level = 'warning';
    }
    
    entries.push(entry);
  }
  
  return entries;
}

/**
 * Format a job log for display in the UI
 * 
 * @param job The encoding job
 * @param rawLog The raw log text (optional)
 * @returns A formatted log or status message
 */
export function formatJobLogForDisplay(job: EncodingJob, rawLog?: string | null): string {
  // If we have a raw log, return it
  if (rawLog) {
    return rawLog;
  }
  
  // Otherwise, build a status message based on job state
  let statusMessage = '';
  
  switch (job.status) {
    case 'queued':
      statusMessage = `Job ${job.id} is queued for processing.\n\n`;
      statusMessage += `Input: ${job.inputPath}\n`;
      statusMessage += `Output: ${job.outputPath}\n`;
      statusMessage += `Added: ${job.addedAt.toLocaleString()}\n`;
      statusMessage += `Preset: ${job.preset?.name || 'Custom'}\n`;
      break;
      
    case 'processing':
      statusMessage = `Job ${job.id} is currently processing.\n\n`;
      statusMessage += `Progress: ${job.progress.toFixed(1)}%\n`;
      
      if (job.fps) {
        statusMessage += `FPS: ${job.fps.toFixed(2)}\n`;
      }
      
      if (job.frame && job.totalFrames) {
        statusMessage += `Frame: ${job.frame}/${job.totalFrames}\n`;
      }
      
      statusMessage += `\nFull logs will be available when processing completes.`;
      break;
      
    case 'completed':
      statusMessage = `Job ${job.id} completed successfully.\n\n`;
      
      if (job.result) {
        // Use a type assertion to avoid the TypeScript error
        const resultWithTime = job.result as { elapsedTime?: string };
        statusMessage += `Time: ${resultWithTime.elapsedTime || 'unknown'}\n`;
      }
      
      statusMessage += `\nLogs are not currently loaded. Use "View Log" to see full encoding details.`;
      break;
      
    case 'failed':
      statusMessage = `Job ${job.id} failed.\n\n`;
      statusMessage += `Error: ${job.error || 'Unknown error'}\n`;
      statusMessage += `\nUse "View Log" to see full encoding details and error information.`;
      break;
      
    default:
      statusMessage = `Job ${job.id} status: ${job.status}\n`;
      statusMessage += `\nNo log information available.`;
  }
  
  return statusMessage;
}

/**
 * Get a summary of a job log
 * This extracts key information for display in UI components
 * 
 * @param rawLog The raw log text
 * @param job Optional job data for additional context
 * @returns A short summary of the log
 */
export function getJobLogSummary(rawLog: string | null, job?: EncodingJob): string {
  if (!rawLog) {
    return job ? `${job.status.charAt(0).toUpperCase() + job.status.slice(1)}` : 'No log available';
  }
  
  // Look for common summary patterns in the log
  if (rawLog.includes('error') || rawLog.includes('failed')) {
    return 'Encoding failed - see log for details';
  }
  
  if (rawLog.includes('successfully')) {
    return 'Encoding completed successfully';
  }
  
  // Extract time if available
  const timeMatches = rawLog.match(/time=([0-9:.]+)/);
  if (timeMatches && timeMatches[1]) {
    return `Processed to ${timeMatches[1]}`;
  }
  
  // Default summary
  return 'See log for details';
}

/**
 * Find the job ID associated with a media item
 * 
 * @param mediaId The ID of the media item
 * @returns Promise with the job ID if found
 */
export async function findJobIdByMediaId(mediaId: number): Promise<string | null> {
  try {
    const result = await electronAPI.dbQuery(
      'SELECT encodingJobId FROM media WHERE id = ? AND encodingJobId IS NOT NULL',
      [mediaId]
    );
    
    if (result && result.length > 0 && result[0].encodingJobId) {
      return result[0].encodingJobId;
    }
    
    return null;
  } catch (error) {
    console.error('JobLogUtil: Error finding job ID for media:', error);
    return null;
  }
}

/**
 * Find all media items that have an encoding job
 * This can be used to show encoding history in the Media page
 * 
 * @returns Promise with array of media items with job IDs
 */
export async function findMediaWithJobs(): Promise<{ id: number, title: string, encodingJobId: string }[]> {
  try {
    const result = await electronAPI.dbQuery(
      'SELECT id, title, encodingJobId FROM media WHERE encodingJobId IS NOT NULL'
    );
    
    return result;
  } catch (error) {
    console.error('JobLogUtil: Error finding media with jobs:', error);
    return [];
  }
}

/**
 * Manually associate a log file ID with a job ID
 * This is useful for troubleshooting or fixing mismatched IDs
 * 
 * @param jobId The job ID in our system
 * @param logFileId The actual log file ID on disk
 * @returns Promise with success status
 */
export async function associateLogWithJob(jobId: string, logFileId: string): Promise<boolean> {
  try {
    console.log(`JobLogUtil: Manually associating job ${jobId} with log file ${logFileId}`);
    
    // Create the table if it doesn't exist
    await electronAPI.dbQuery(`
      CREATE TABLE IF NOT EXISTS job_log_mappings (
        jobId TEXT PRIMARY KEY,
        logFileId TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert or update the mapping
    await electronAPI.dbQuery(
      'INSERT OR REPLACE INTO job_log_mappings (jobId, logFileId) VALUES (?, ?)',
      [jobId, logFileId]
    );
    
    console.log(`JobLogUtil: Successfully associated job ${jobId} with log file ${logFileId}`);
    return true;
  } catch (error) {
    console.error('JobLogUtil: Error associating log with job:', error);
    return false;
  }
}

/**
 * Get all log-job mappings for debugging purposes
 * 
 * @returns Promise with array of mappings
 */
export async function getAllLogMappings(): Promise<Array<{jobId: string, logFileId: string, createdAt: string}>> {
  try {
    // Check if the table exists first
    const tableExists = await electronAPI.dbQuery(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='job_log_mappings'
    `);
    
    if (!tableExists || tableExists.length === 0) {
      console.log('JobLogUtil: job_log_mappings table does not exist yet');
      return [];
    }
    
    // Get all mappings
    const mappings = await electronAPI.dbQuery(
      'SELECT jobId, logFileId, createdAt FROM job_log_mappings ORDER BY createdAt DESC'
    );
    
    return mappings || [];
  } catch (error) {
    console.error('JobLogUtil: Error getting log mappings:', error);
    return [];
  }
} 