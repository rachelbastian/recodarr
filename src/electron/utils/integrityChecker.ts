import fs from 'fs/promises';
import path from 'path';
import { BrowserWindow } from 'electron';
import Database from 'better-sqlite3';

/**
 * Performs a database integrity check, removing entries for files that no longer exist
 * @param db The database connection
 * @param window The main window for sending status updates
 * @returns A promise that resolves with the check results
 */
export async function performFileIntegrityCheck(db: Database.Database | null, window: BrowserWindow | null): Promise<{
  success: boolean;
  removedCount: number;
  errorCount: number;
  error?: string;
  message: string;
}> {
  console.log("[IntegrityChecker] Starting file integrity check...");
  
  // Validation checks
  if (!db) {
    const errorMsg = "Database not initialized, cannot perform file integrity check";
    console.error(`[IntegrityChecker] ${errorMsg}`);
    sendStatusUpdate(window, 'error', errorMsg);
    return { success: false, removedCount: 0, errorCount: 0, error: errorMsg, message: errorMsg };
  }
  
  // Send initial status
  sendStatusUpdate(window, 'running', 'Checking for missing files...');
  
  try {
    // Get all media files from the database
    console.log("[IntegrityChecker] Querying database for media files...");
    const mediaFiles = db.prepare('SELECT id, filePath, title FROM media').all() as { id: number; filePath: string; title: string }[];
    
    console.log(`[IntegrityChecker] Found ${mediaFiles.length} files in database to check`);
    let removedCount = 0;
    let removeErrorCount = 0;
    let processedCount = 0;
    const totalCount = mediaFiles.length;
    
    // Prepare statement for deletion
    const deleteStmt = db.prepare('DELETE FROM media WHERE id = ?');
    
    // Check each file
    const startTime = Date.now();
    for (const file of mediaFiles) {
      processedCount++;
      
      // Log progress every 100 files
      if (processedCount % 100 === 0) {
        const percentDone = Math.round((processedCount / totalCount) * 100);
        const elapsedSec = (Date.now() - startTime) / 1000;
        console.log(`[IntegrityChecker] Progress: ${percentDone}% (${processedCount}/${totalCount}) - Elapsed: ${elapsedSec.toFixed(1)}s`);
        sendStatusUpdate(window, 'running', `Checking files: ${percentDone}% (${processedCount}/${totalCount})`);
      }
      
      try {
        // Check if file exists
        await fs.access(file.filePath, fs.constants.F_OK);
        // File exists, continue to next file
      } catch (error) {
        // File doesn't exist, remove from database
        console.log(`[IntegrityChecker] File not found, removing from database: ${file.filePath}`);
        
        try {
          deleteStmt.run(file.id);
          removedCount++;
        } catch (dbError) {
          const errorMsg = `Error removing file from database (ID: ${file.id}): ${dbError instanceof Error ? dbError.message : String(dbError)}`;
          console.error(`[IntegrityChecker] ${errorMsg}`);
          removeErrorCount++;
        }
      }
    }
    
    // Log final results
    const elapsedSec = (Date.now() - startTime) / 1000;
    const resultMsg = `File integrity check completed in ${elapsedSec.toFixed(1)}s. Removed ${removedCount} missing files. Errors: ${removeErrorCount}`;
    console.log(`[IntegrityChecker] ${resultMsg}`);
    
    sendStatusUpdate(window, 'finished', `Missing file check complete. Removed ${removedCount} entries for missing files.`);
    
    return {
      success: true,
      removedCount,
      errorCount: removeErrorCount,
      message: resultMsg
    };
  } catch (error) {
    const errorMsg = `Error during file integrity check: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[IntegrityChecker] ${errorMsg}`);
    
    sendStatusUpdate(window, 'error', `Error checking for missing files: ${error instanceof Error ? error.message : String(error)}`);
    
    return {
      success: false,
      removedCount: 0,
      errorCount: 1,
      error: errorMsg,
      message: errorMsg
    };
  }
}

/**
 * Helper function to send status updates to the renderer
 */
function sendStatusUpdate(window: BrowserWindow | null, status: 'running' | 'finished' | 'error', message: string): void {
  if (window && !window.isDestroyed()) {
    console.log(`[IntegrityChecker] Sending status update: ${status} - ${message}`);
    window.webContents.send("scan-status-update", { status, message });
  } else {
    console.log(`[IntegrityChecker] Window unavailable, couldn't send status: ${status} - ${message}`);
  }
} 