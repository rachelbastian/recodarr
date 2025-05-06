import { BrowserWindow } from 'electron';
import Database from 'better-sqlite3';
import { scheduleJob, Job, RecurrenceRule, RecurrenceSpecDateRange, RecurrenceSpecObjLit, cancelJob } from 'node-schedule';
import * as path from 'path';
import * as fs from 'fs/promises';
import fsSync from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Task type definitions
export type TaskFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ScheduledTask {
    id: string;
    name: string;
    description?: string;
    type: 'scan' | 'cleanup' | 'custom';
    frequency: TaskFrequency;
    enabled: boolean;
    lastRun?: Date;
    nextRun?: Date;
    cronExpression?: string; // For custom schedules
    targetPaths?: string[]; // For scan tasks
    parameters?: Record<string, any>; // Additional parameters
    createdAt: Date;
    updatedAt: Date;
}

// Helper function to convert frequencies to cron expressions
function getCronExpression(frequency: TaskFrequency, parameters?: Record<string, any>): string {
    switch (frequency) {
        case 'hourly':
            // At specified minute of every hour
            const hourlyMinute = parameters?.minute || 0;
            return `${hourlyMinute} * * * *`;
        case 'daily':
            const hour = parameters?.hour || 0;
            const minute = parameters?.minute || 0;
            return `${minute} ${hour} * * *`; // At specified hour and minute every day
        case 'weekly':
            // Support both single dayOfWeek and multiple daysOfWeek
            let daysOfWeek: number[] = [];
            if (parameters?.daysOfWeek && Array.isArray(parameters.daysOfWeek)) {
                daysOfWeek = parameters.daysOfWeek;
            } else if (parameters?.dayOfWeek !== undefined) {
                daysOfWeek = [parameters.dayOfWeek];
            } else {
                daysOfWeek = [0]; // Sunday by default
            }
            
            const weeklyHour = parameters?.hour || 0;
            const weeklyMinute = parameters?.minute || 0;
            // Join days with commas for multiple days
            const dayExpression = daysOfWeek.sort().join(',');
            return `${weeklyMinute} ${weeklyHour} * * ${dayExpression}`; // At specified time on specified day(s)
        case 'monthly':
            const dayOfMonth = parameters?.dayOfMonth || 1;
            const monthlyHour = parameters?.hour || 0;
            const monthlyMinute = parameters?.minute || 0;
            return `${monthlyMinute} ${monthlyHour} ${dayOfMonth} * *`; // At specified time on specified day of month
        case 'custom':
            return parameters?.cronExpression || '0 0 * * *'; // Default to midnight daily if no cron provided
        default:
            return '0 0 * * *'; // Default to midnight daily
    }
}

// Calculate the next run time for a task
function calculateNextRunTime(cronExpression: string, timezone?: string): Date | undefined {
    try {
        // Create a job with the timezone if provided
        let job;
        if (timezone) {
            job = scheduleJob({ rule: cronExpression, tz: timezone }, () => {});
        } else {
            job = scheduleJob(cronExpression, () => {});
        }
        
        const nextDate = job.nextInvocation();
        job.cancel();
        return nextDate;
    } catch (error) {
        console.error(`[Scheduler] Error calculating next run time: ${error}`);
        return undefined;
    }
}

// Class to manage scheduled tasks
export class TaskScheduler {
    private db: Database.Database;
    private mainWindow: BrowserWindow | null = null;
    private jobs: Map<string, Job> = new Map();
    private isInitialized = false;

    constructor(db: Database.Database, mainWindow: BrowserWindow | null) {
        this.db = db;
        this.mainWindow = mainWindow;
    }

    /**
     * Initialize the scheduler by creating necessary tables and loading saved tasks
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Create table if it doesn't exist
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS scheduled_tasks (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    type TEXT NOT NULL,
                    frequency TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    last_run TEXT,
                    cron_expression TEXT,
                    target_paths TEXT,
                    parameters TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            `);

            // Load and schedule all enabled tasks
            await this.loadTasks();
            this.isInitialized = true;
            console.log('[Scheduler] Initialized successfully');
        } catch (error) {
            console.error('[Scheduler] Initialization error:', error);
            throw error;
        }
    }

    /**
     * Load all tasks from the database and schedule the enabled ones
     */
    private async loadTasks(): Promise<void> {
        try {
            // Cancel all existing jobs
            this.cancelAllJobs();

            // Get all tasks from the database
            const stmt = this.db.prepare(`
                SELECT * FROM scheduled_tasks
            `);
            const tasks = stmt.all() as any[];

            // Process tasks
            for (const taskData of tasks) {
                const task: ScheduledTask = {
                    id: taskData.id,
                    name: taskData.name,
                    description: taskData.description,
                    type: taskData.type,
                    frequency: taskData.frequency as TaskFrequency,
                    enabled: Boolean(taskData.enabled),
                    lastRun: taskData.last_run ? new Date(taskData.last_run) : undefined,
                    cronExpression: taskData.cron_expression,
                    targetPaths: taskData.target_paths ? JSON.parse(taskData.target_paths) : undefined,
                    parameters: taskData.parameters ? JSON.parse(taskData.parameters) : undefined,
                    createdAt: new Date(taskData.created_at),
                    updatedAt: new Date(taskData.updated_at)
                };

                // For enabled tasks, create and schedule the job
                if (task.enabled) {
                    this.scheduleTask(task);
                }
            }

            console.log(`[Scheduler] Loaded ${tasks.length} tasks, ${this.jobs.size} active`);
        } catch (error) {
            console.error('[Scheduler] Error loading tasks:', error);
            throw error;
        }
    }

    /**
     * Get all scheduled tasks
     */
    public getAllTasks(): ScheduledTask[] {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM scheduled_tasks
                ORDER BY updated_at DESC
            `);
            const tasks = stmt.all() as any[];

            // Convert DB records to ScheduledTask objects
            return tasks.map(taskData => {
                const task: ScheduledTask = {
                    id: taskData.id,
                    name: taskData.name,
                    description: taskData.description,
                    type: taskData.type,
                    frequency: taskData.frequency as TaskFrequency,
                    enabled: Boolean(taskData.enabled),
                    lastRun: taskData.last_run ? new Date(taskData.last_run) : undefined,
                    cronExpression: taskData.cron_expression,
                    targetPaths: taskData.target_paths ? JSON.parse(taskData.target_paths) : undefined,
                    parameters: taskData.parameters ? JSON.parse(taskData.parameters) : undefined,
                    createdAt: new Date(taskData.created_at),
                    updatedAt: new Date(taskData.updated_at)
                };

                // Calculate next run time
                if (task.enabled) {
                    const cronExp = task.cronExpression || getCronExpression(task.frequency, task.parameters);
                    task.nextRun = calculateNextRunTime(cronExp, task.parameters?.timezone);
                }

                return task;
            });
        } catch (error) {
            console.error('[Scheduler] Error getting tasks:', error);
            return [];
        }
    }

    /**
     * Add a new scheduled task
     */
    public addTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt'>): ScheduledTask {
        try {
            // Generate a unique ID
            const id = `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const now = new Date();

            // Create the complete task object
            const newTask: ScheduledTask = {
                ...task,
                id,
                createdAt: now,
                updatedAt: now
            };

            // Ensure we have a cron expression
            if (!newTask.cronExpression) {
                newTask.cronExpression = getCronExpression(newTask.frequency, newTask.parameters);
            }

            // Insert into database
            const stmt = this.db.prepare(`
                INSERT INTO scheduled_tasks (
                    id, name, description, type, frequency, enabled,
                    cron_expression, target_paths, parameters, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                newTask.id,
                newTask.name,
                newTask.description || null,
                newTask.type,
                newTask.frequency,
                newTask.enabled ? 1 : 0,
                newTask.cronExpression,
                newTask.targetPaths ? JSON.stringify(newTask.targetPaths) : null,
                newTask.parameters ? JSON.stringify(newTask.parameters) : null,
                newTask.createdAt.toISOString(),
                newTask.updatedAt.toISOString()
            );

            // Schedule the task if enabled
            if (newTask.enabled) {
                this.scheduleTask(newTask);
            }

            console.log(`[Scheduler] Added new task: ${newTask.name} (${newTask.id})`);

            // Calculate next run time for the returned object
            if (newTask.enabled && newTask.cronExpression) {
                newTask.nextRun = calculateNextRunTime(newTask.cronExpression, newTask.parameters?.timezone);
            }

            return newTask;
        } catch (error) {
            console.error('[Scheduler] Error adding task:', error);
            throw error;
        }
    }

    /**
     * Update an existing task
     */
    public updateTask(taskId: string, updates: Partial<Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt'>>): ScheduledTask {
        try {
            // Get the existing task
            const stmt = this.db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
            const existingTaskData = stmt.get(taskId) as any;

            if (!existingTaskData) {
                throw new Error(`Task with ID ${taskId} not found`);
            }

            // Parse the existing task
            const existingTask: ScheduledTask = {
                id: existingTaskData.id,
                name: existingTaskData.name,
                description: existingTaskData.description,
                type: existingTaskData.type,
                frequency: existingTaskData.frequency as TaskFrequency,
                enabled: Boolean(existingTaskData.enabled),
                lastRun: existingTaskData.last_run ? new Date(existingTaskData.last_run) : undefined,
                cronExpression: existingTaskData.cron_expression,
                targetPaths: existingTaskData.target_paths ? JSON.parse(existingTaskData.target_paths) : undefined,
                parameters: existingTaskData.parameters ? JSON.parse(existingTaskData.parameters) : undefined,
                createdAt: new Date(existingTaskData.created_at),
                updatedAt: new Date()
            };

            // Apply updates
            const updatedTask: ScheduledTask = {
                ...existingTask,
                ...updates,
                updatedAt: new Date()
            };

            // Update cron expression if frequency or parameters changed
            if (updates.frequency || updates.parameters) {
                updatedTask.cronExpression = getCronExpression(
                    updatedTask.frequency,
                    updatedTask.parameters
                );
            }

            // Update in database
            const updateStmt = this.db.prepare(`
                UPDATE scheduled_tasks
                SET name = ?, description = ?, type = ?, frequency = ?,
                    enabled = ?, cron_expression = ?, target_paths = ?,
                    parameters = ?, updated_at = ?
                WHERE id = ?
            `);

            updateStmt.run(
                updatedTask.name,
                updatedTask.description || null,
                updatedTask.type,
                updatedTask.frequency,
                updatedTask.enabled ? 1 : 0,
                updatedTask.cronExpression,
                updatedTask.targetPaths ? JSON.stringify(updatedTask.targetPaths) : null,
                updatedTask.parameters ? JSON.stringify(updatedTask.parameters) : null,
                updatedTask.updatedAt.toISOString(),
                updatedTask.id
            );

            // Cancel existing job if present
            if (this.jobs.has(taskId)) {
                const job = this.jobs.get(taskId);
                if (job) {
                    job.cancel();
                    this.jobs.delete(taskId);
                }
            }

            // Reschedule if enabled
            if (updatedTask.enabled) {
                this.scheduleTask(updatedTask);
            }

            console.log(`[Scheduler] Updated task: ${updatedTask.name} (${updatedTask.id})`);

            // Calculate next run time for the returned object
            if (updatedTask.enabled && updatedTask.cronExpression) {
                updatedTask.nextRun = calculateNextRunTime(updatedTask.cronExpression, updatedTask.parameters?.timezone);
            }

            return updatedTask;
        } catch (error) {
            console.error('[Scheduler] Error updating task:', error);
            throw error;
        }
    }

    /**
     * Delete a task
     */
    public deleteTask(taskId: string): boolean {
        try {
            // Cancel job if it exists
            if (this.jobs.has(taskId)) {
                const job = this.jobs.get(taskId);
                if (job) {
                    job.cancel();
                    this.jobs.delete(taskId);
                }
            }

            // Delete from database
            const stmt = this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
            const result = stmt.run(taskId);

            console.log(`[Scheduler] Deleted task ID: ${taskId}`);
            return result.changes > 0;
        } catch (error) {
            console.error('[Scheduler] Error deleting task:', error);
            throw error;
        }
    }

    /**
     * Enable or disable a task
     */
    public toggleTaskEnabled(taskId: string, enabled: boolean): ScheduledTask {
        try {
            // Get the existing task
            const stmt = this.db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
            const existingTaskData = stmt.get(taskId) as any;

            if (!existingTaskData) {
                throw new Error(`Task with ID ${taskId} not found`);
            }

            // Parse the existing task
            const existingTask: ScheduledTask = {
                id: existingTaskData.id,
                name: existingTaskData.name,
                description: existingTaskData.description,
                type: existingTaskData.type,
                frequency: existingTaskData.frequency as TaskFrequency,
                enabled: Boolean(existingTaskData.enabled),
                lastRun: existingTaskData.last_run ? new Date(existingTaskData.last_run) : undefined,
                cronExpression: existingTaskData.cron_expression,
                targetPaths: existingTaskData.target_paths ? JSON.parse(existingTaskData.target_paths) : undefined,
                parameters: existingTaskData.parameters ? JSON.parse(existingTaskData.parameters) : undefined,
                createdAt: new Date(existingTaskData.created_at),
                updatedAt: new Date()
            };

            // Update enabled status
            const updatedTask: ScheduledTask = {
                ...existingTask,
                enabled,
                updatedAt: new Date()
            };

            // Update in database
            const updateStmt = this.db.prepare(`
                UPDATE scheduled_tasks
                SET enabled = ?, updated_at = ?
                WHERE id = ?
            `);

            updateStmt.run(
                enabled ? 1 : 0,
                updatedTask.updatedAt.toISOString(),
                updatedTask.id
            );

            // Cancel existing job if present
            if (this.jobs.has(taskId)) {
                const job = this.jobs.get(taskId);
                if (job) {
                    job.cancel();
                    this.jobs.delete(taskId);
                }
            }

            // Reschedule if enabled
            if (enabled) {
                this.scheduleTask(updatedTask);
            }

            console.log(`[Scheduler] ${enabled ? 'Enabled' : 'Disabled'} task: ${updatedTask.name} (${updatedTask.id})`);

            // Calculate next run time for the returned object
            if (updatedTask.enabled && updatedTask.cronExpression) {
                updatedTask.nextRun = calculateNextRunTime(updatedTask.cronExpression, updatedTask.parameters?.timezone);
            }

            return updatedTask;
        } catch (error) {
            console.error(`[Scheduler] Error ${enabled ? 'enabling' : 'disabling'} task:`, error);
            throw error;
        }
    }

    /**
     * Update the last run time for a task
     */
    private updateLastRunTime(taskId: string): void {
        try {
            const now = new Date();
            const stmt = this.db.prepare(`
                UPDATE scheduled_tasks
                SET last_run = ?, updated_at = ?
                WHERE id = ?
            `);
            stmt.run(now.toISOString(), now.toISOString(), taskId);
        } catch (error) {
            console.error('[Scheduler] Error updating last run time:', error);
        }
    }

    /**
     * Schedule a task using node-schedule
     */
    private scheduleTask(task: ScheduledTask): void {
        try {
            // Use the task's cron expression or generate one from its frequency
            const cronExpression = task.cronExpression || getCronExpression(task.frequency, task.parameters);
            
            // Log the scheduling
            console.log(`[Scheduler] Scheduling task: ${task.name} (${task.id}) with cron: ${cronExpression}`);
            
            // Set up job options with timezone if specified
            const timezone = task.parameters?.timezone;
            
            if (timezone) {
                console.log(`[Scheduler] Using timezone: ${timezone} for task: ${task.id}`);
            }
            
            // Create the job with optional timezone
            let job;
            if (timezone) {
                job = scheduleJob({ rule: cronExpression, tz: timezone }, async () => {
                    console.log(`[Scheduler] Running task: ${task.name} (${task.id})`);
                    
                    // Update last run time
                    this.updateLastRunTime(task.id);
                    
                    // Notify UI that task has started
                    this.notifyUI('task-started', {
                        taskId: task.id,
                        taskName: task.name,
                        startTime: new Date().toISOString()
                    });
                    
                    try {
                        // Execute the task based on its type
                        await this.executeTask(task);
                        
                        // Notify UI that task has completed
                        this.notifyUI('task-completed', {
                            taskId: task.id,
                            taskName: task.name,
                            completionTime: new Date().toISOString(),
                            status: 'success'
                        });
                    } catch (error) {
                        console.error(`[Scheduler] Error executing task ${task.id}:`, error);
                        
                        // Notify UI of task failure
                        this.notifyUI('task-error', {
                            taskId: task.id,
                            taskName: task.name,
                            error: error instanceof Error ? error.message : String(error),
                            errorTime: new Date().toISOString()
                        });
                    }
                });
            } else {
                job = scheduleJob(cronExpression, async () => {
                    console.log(`[Scheduler] Running task: ${task.name} (${task.id})`);
                    
                    // Update last run time
                    this.updateLastRunTime(task.id);
                    
                    // Notify UI that task has started
                    this.notifyUI('task-started', {
                        taskId: task.id,
                        taskName: task.name,
                        startTime: new Date().toISOString()
                    });
                    
                    try {
                        // Execute the task based on its type
                        await this.executeTask(task);
                        
                        // Notify UI that task has completed
                        this.notifyUI('task-completed', {
                            taskId: task.id,
                            taskName: task.name,
                            completionTime: new Date().toISOString(),
                            status: 'success'
                        });
                    } catch (error) {
                        console.error(`[Scheduler] Error executing task ${task.id}:`, error);
                        
                        // Notify UI of task failure
                        this.notifyUI('task-error', {
                            taskId: task.id,
                            taskName: task.name,
                            error: error instanceof Error ? error.message : String(error),
                            errorTime: new Date().toISOString()
                        });
                    }
                });
            }
            
            // Store the job
            this.jobs.set(task.id, job);
        } catch (error) {
            console.error(`[Scheduler] Error scheduling task ${task.id}:`, error);
        }
    }

    /**
     * Execute a task based on its type
     */
    private async executeTask(task: ScheduledTask): Promise<void> {
        switch (task.type) {
            case 'scan':
                await this.executeScanTask(task);
                break;
            case 'cleanup':
                await this.executeCleanupTask(task);
                break;
            case 'custom':
                await this.executeCustomTask(task);
                break;
            default:
                throw new Error(`Unknown task type: ${task.type}`);
        }
    }

    /**
     * Execute a scan task to scan folders for media
     */
    private async executeScanTask(task: ScheduledTask): Promise<void> {
        // Example implementation - actual implementation would depend on your existing scan functionality
        if (!task.targetPaths || task.targetPaths.length === 0) {
            throw new Error('No target paths specified for scan task');
        }

        console.log(`[Scheduler] Executing scan task for paths: ${task.targetPaths.join(', ')}`);
        
        // This is a placeholder - you would typically call into your existing scanner functionality
        // For example: await scanner.scanFolders(task.targetPaths);
        
        // For now, we'll just log it
        console.log(`[Scheduler] Scan task ${task.id} completed`);
    }

    /**
     * Execute a cleanup task to remove deleted files from database
     */
    private async executeCleanupTask(task: ScheduledTask): Promise<void> {
        // Example implementation - actual implementation would depend on your existing cleanup functionality
        console.log(`[Scheduler] Executing cleanup task: ${task.name}`);
        
        // This is a placeholder - you would typically call into your existing cleanup functionality
        // For example: await fileWatcher.cleanupDeletedFiles();
        
        // For now, we'll just log it
        console.log(`[Scheduler] Cleanup task ${task.id} completed`);
    }

    /**
     * Execute a custom task (implementation depends on the specific task parameters)
     */
    private async executeCustomTask(task: ScheduledTask): Promise<void> {
        // This would be implemented based on what custom tasks need to do
        console.log(`[Scheduler] Executing custom task: ${task.name}`);
        
        // Custom task logic would go here, based on task.parameters
        
        console.log(`[Scheduler] Custom task ${task.id} completed`);
    }

    /**
     * Manually run a task immediately
     */
    public async runTaskNow(taskId: string): Promise<void> {
        try {
            // Get the task
            const stmt = this.db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
            const taskData = stmt.get(taskId) as any;

            if (!taskData) {
                throw new Error(`Task with ID ${taskId} not found`);
            }

            // Parse the task
            const task: ScheduledTask = {
                id: taskData.id,
                name: taskData.name,
                description: taskData.description,
                type: taskData.type,
                frequency: taskData.frequency as TaskFrequency,
                enabled: Boolean(taskData.enabled),
                lastRun: taskData.last_run ? new Date(taskData.last_run) : undefined,
                cronExpression: taskData.cron_expression,
                targetPaths: taskData.target_paths ? JSON.parse(taskData.target_paths) : undefined,
                parameters: taskData.parameters ? JSON.parse(taskData.parameters) : undefined,
                createdAt: new Date(taskData.created_at),
                updatedAt: new Date(taskData.updated_at)
            };

            console.log(`[Scheduler] Manually running task: ${task.name} (${task.id})`);
            
            // Update last run time
            this.updateLastRunTime(task.id);
            
            // Notify UI that task has started
            this.notifyUI('task-started', {
                taskId: task.id,
                taskName: task.name,
                startTime: new Date().toISOString(),
                manualRun: true
            });
            
            try {
                // Execute the task
                await this.executeTask(task);
                
                // Notify UI of completion
                this.notifyUI('task-completed', {
                    taskId: task.id,
                    taskName: task.name,
                    completionTime: new Date().toISOString(),
                    status: 'success',
                    manualRun: true
                });
                
                console.log(`[Scheduler] Manual task ${task.id} completed successfully`);
            } catch (error) {
                console.error(`[Scheduler] Error executing manual task ${task.id}:`, error);
                
                // Notify UI of failure
                this.notifyUI('task-error', {
                    taskId: task.id,
                    taskName: task.name,
                    error: error instanceof Error ? error.message : String(error),
                    errorTime: new Date().toISOString(),
                    manualRun: true
                });
                
                // Re-throw to propagate error
                throw error;
            }
        } catch (error) {
            console.error('[Scheduler] Error running task manually:', error);
            throw error;
        }
    }

    /**
     * Cancel all jobs
     */
    private cancelAllJobs(): void {
        for (const [id, job] of this.jobs.entries()) {
            job.cancel();
            console.log(`[Scheduler] Cancelled job: ${id}`);
        }
        this.jobs.clear();
    }

    /**
     * Shut down the scheduler
     */
    public shutdown(): void {
        this.cancelAllJobs();
        console.log('[Scheduler] Scheduler shutdown complete');
    }

    /**
     * Send notification to UI via mainWindow
     */
    private notifyUI(event: string, data: any): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(`scheduler-${event}`, data);
        }
    }
}

export default TaskScheduler; 