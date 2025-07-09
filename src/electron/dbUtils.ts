import path from 'path';
import Database from 'better-sqlite3';
import { IpcMain } from 'electron';
import { initializePresetTable } from './presetDatabase.js';

// Type for app.getPath('userData')
type GetPathFn = (name: 'userData') => string;

let dbInstance: Database.Database;

// --- START: Moved checkAndMigrateWorkflowTables ---
async function checkAndMigrateWorkflowTables(db: Database.Database): Promise<void> {
    try {
        console.log("[DB Migration] Checking if workflow tables need migration...");
        
        // First, check if workflows table exists and what schema it has
        const schemaCheck = db.pragma("table_info(workflows)") as { name: string; type: string }[];
        
        // Check if id column is INTEGER or TEXT
        const idColumn = schemaCheck.find((col) => col.name === 'id');
        const needsMigration = idColumn && idColumn.type.toUpperCase() === 'INTEGER';
        
        if (needsMigration) {
            console.log("[DB Migration] Found workflows table with INTEGER id, migrating to TEXT id...");
            
            interface WorkflowRow {
                id: number;
                name: string;
                description: string | null;
                created_at: string;
                updated_at: string;
                is_active: number;
                last_triggered_at: string | null;
            }
            
            interface NodeRow {
                id: number;
                workflow_id: number;
                node_id: string;
                node_type: string;
                label: string;
                description: string | null;
                position_x: number;
                position_y: number;
                data: string;
                created_at: string;
                original_id?: number; // To map old integer workflow_id to new text id
            }
            
            interface EdgeRow {
                id: number;
                workflow_id: number;
                edge_id: string;
                source_node_id: string;
                target_node_id: string;
                created_at: string;
                original_id?: number; // To map old integer workflow_id to new text id
            }
            
            let existingWorkflows: WorkflowRow[] = [];
            try {
                existingWorkflows = db.prepare('SELECT * FROM workflows').all() as WorkflowRow[];
                console.log(`[DB Migration] Found ${existingWorkflows.length} existing workflows to migrate`);
            } catch (error) {
                console.log("[DB Migration] No existing workflows or could not retrieve them:", error);
            }
            
            // Begin transaction
            db.exec('BEGIN TRANSACTION;');
            
            try {
                // Store nodes and edges with their original integer workflow_id
                let nodes: NodeRow[] = [];
                let edges: EdgeRow[] = [];
                
                for (const workflow of existingWorkflows) {
                    try {
                        const workflowNodes = db.prepare('SELECT * FROM workflow_nodes WHERE workflow_id = ?').all(workflow.id) as NodeRow[];
                        const workflowEdges = db.prepare('SELECT * FROM workflow_edges WHERE workflow_id = ?').all(workflow.id) as EdgeRow[];
                        
                        nodes = [...nodes, ...workflowNodes.map(node => ({...node, original_id: workflow.id}))];
                        edges = [...edges, ...workflowEdges.map(edge => ({...edge, original_id: workflow.id}))];
                    } catch (error) {
                        console.error(`[DB Migration] Error backing up nodes/edges for old workflow ${workflow.id}:`, error);
                    }
                }
                
                // Drop existing tables (order matters due to foreign keys if they existed on old schema)
                db.exec('DROP TABLE IF EXISTS workflow_executions;');
                db.exec('DROP TABLE IF EXISTS workflow_edges;');
                db.exec('DROP TABLE IF EXISTS workflow_nodes;');
                db.exec('DROP TABLE IF EXISTS workflows;');
                
                // Recreate tables with TEXT id for workflows.id and workflow_id in related tables
                db.exec(`
                -- Main workflow table
                CREATE TABLE workflows (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1,
                    last_triggered_at DATETIME,
                    UNIQUE(name)
                );

                -- Workflow nodes table
                CREATE TABLE workflow_nodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workflow_id TEXT NOT NULL, -- Changed to TEXT
                    node_id TEXT NOT NULL,
                    node_type TEXT NOT NULL,
                    label TEXT NOT NULL,
                    description TEXT,
                    position_x REAL NOT NULL,
                    position_y REAL NOT NULL,
                    data JSON,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
                    UNIQUE(workflow_id, node_id)
                );

                -- Workflow edges table
                CREATE TABLE workflow_edges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workflow_id TEXT NOT NULL, -- Changed to TEXT
                    edge_id TEXT NOT NULL,
                    source_node_id TEXT NOT NULL,
                    target_node_id TEXT NOT NULL,
                    source_handle TEXT, -- Added source_handle column
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
                    UNIQUE(workflow_id, edge_id)
                );

                -- Workflow execution history
                CREATE TABLE workflow_executions (
                    id TEXT PRIMARY KEY,
                    workflow_id TEXT NOT NULL,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    status TEXT CHECK( status IN ('running', 'completed', 'failed', 'cancelled') ),
                    error_message TEXT,
                    trigger_node_id TEXT NOT NULL,
                    execution_data JSON,
                    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
                );`);
                
                // Restore data if there were existing workflows
                if (existingWorkflows.length > 0) {
                    const insertWorkflow = db.prepare(`
                        INSERT INTO workflows (id, name, description, created_at, updated_at, is_active, last_triggered_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    for (const workflow of existingWorkflows) {
                        const textId = workflow.id.toString(); // Convert INTEGER id to TEXT
                        insertWorkflow.run(
                            textId,
                            workflow.name,
                            workflow.description,
                            workflow.created_at,
                            workflow.updated_at,
                            workflow.is_active === 1, // Ensure boolean
                            workflow.last_triggered_at
                        );
                    }
                    console.log(`[DB Migration] Restored ${existingWorkflows.length} workflows with TEXT ids`);
                    
                    // Restore nodes and edges, converting workflow_id to TEXT
                    if (nodes.length > 0) {
                        const insertNode = db.prepare(`
                            INSERT INTO workflow_nodes (workflow_id, node_id, node_type, label, description, position_x, position_y, data, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        for (const node of nodes) {
                            insertNode.run(
                                node.original_id?.toString() || '', // Convert original integer workflow_id to TEXT
                                node.node_id, node.node_type, node.label, node.description,
                                node.position_x, node.position_y, node.data, node.created_at
                            );
                        }
                        console.log(`[DB Migration] Restored ${nodes.length} workflow nodes`);
                    }
                    
                    if (edges.length > 0) {
                        const insertEdge = db.prepare(`
                            INSERT INTO workflow_edges (workflow_id, edge_id, source_node_id, target_node_id, created_at)
                            VALUES (?, ?, ?, ?, ?)
                        `);
                        for (const edge of edges) {
                            insertEdge.run(
                                edge.original_id?.toString() || '', // Convert original integer workflow_id to TEXT
                                edge.edge_id, edge.source_node_id, edge.target_node_id, edge.created_at
                            );
                        }
                        console.log(`[DB Migration] Restored ${edges.length} workflow edges`);
                    }
                }
                
                // Commit transaction
                db.exec('COMMIT;');
                console.log("[DB Migration] Workflow tables migration completed successfully");
                
                // Add ALTER TABLE logic here for existing tables that might be missing source_handle
                try {
                    const edgeTableInfo = db.pragma("table_info(workflow_edges)") as { name: string }[];
                    const hasSourceHandle = edgeTableInfo.some(col => col.name === 'source_handle');
                    if (!hasSourceHandle) {
                        console.log("[DB Migration] Adding missing 'source_handle' column to workflow_edges table...");
                        db.exec("ALTER TABLE workflow_edges ADD COLUMN source_handle TEXT;");
                        console.log("[DB Migration] Successfully added 'source_handle' column.");
                    }
                } catch (alterError) {
                    // Ignore errors if the table doesn't exist (e.g., first run)
                    if (alterError instanceof Error && !alterError.message.includes('no such table')) {
                        console.error("[DB Migration] Error adding 'source_handle' column:", alterError);
                    }
                }
            } catch (error) {
                // Rollback on error
                db.exec('ROLLBACK;');
                console.error("[DB Migration] Migration failed, rolled back changes:", error);
                throw error; // Re-throw to be caught by the outer try-catch if necessary
            }
        } else {
            console.log("[DB Migration] Workflow tables already have the correct schema (TEXT id) or table does not exist yet.");
            // Add ALTER TABLE logic here for existing tables that might be missing source_handle
            try {
                const edgeTableInfo = db.pragma("table_info(workflow_edges)") as { name: string }[];
                const hasSourceHandle = edgeTableInfo.some(col => col.name === 'source_handle');
                if (!hasSourceHandle) {
                    console.log("[DB Migration] Adding missing 'source_handle' column to workflow_edges table...");
                    db.exec("ALTER TABLE workflow_edges ADD COLUMN source_handle TEXT;");
                    console.log("[DB Migration] Successfully added 'source_handle' column.");
                }
            } catch (alterError) {
                // Ignore errors if the table doesn't exist (e.g., first run)
                if (alterError instanceof Error && !alterError.message.includes('no such table')) {
                    console.error("[DB Migration] Error adding 'source_handle' column:", alterError);
                }
            }
        }
    } catch (error) {
        console.error("[DB Migration] Error checking or migrating workflow tables:", error);
        // Allow app to continue even if migration fails, but log the error.
    }
}
// --- END: Moved checkAndMigrateWorkflowTables ---

// --- START: Moved updateMediaAfterEncoding ---
export async function updateMediaAfterEncoding(db: Database.Database, probeData: any, jobId: string, targetDbFilePath: string): Promise<void> {
    if (!db) {
        console.error("Database not initialized, cannot update media after encoding.");
        return;
    }
    if (!probeData?.format) {
        console.warn("Skipping DB update after encoding due to missing format info in probe data.");
        return;
    }

    const fileSize = probeData.format.size ? parseInt(probeData.format.size, 10) : null;
    let videoCodec: string | null = null;
    let audioCodec: string | null = null;
    let resolutionWidth: number | null = null;
    let resolutionHeight: number | null = null;
    let audioChannels: number | null = null;

    if (probeData.streams && Array.isArray(probeData.streams)) {
        const videoStream = probeData.streams.find((s: any) => s.codec_type === 'video');
        const audioStream = probeData.streams.find((s: any) => s.codec_type === 'audio');
        videoCodec = videoStream?.codec_name ?? null;
        audioCodec = audioStream?.codec_name ?? null;
        resolutionWidth = videoStream?.width ?? null;
        resolutionHeight = videoStream?.height ?? null;
        audioChannels = audioStream?.channels ?? null;
    }
            
    console.log(`[DB Update] Attempting to update media for file path in DB: ${targetDbFilePath} with Job ID: ${jobId}`);
    console.log(`[DB Update] New Data: Size=${fileSize}, VideoCodec=${videoCodec}, AudioCodec=${audioCodec}, Resolution=${resolutionWidth}x${resolutionHeight}, Channels=${audioChannels}`);

    const updateSql = `
        UPDATE media 
        SET currentSize = ?, 
            videoCodec = ?, 
            audioCodec = ?, 
            resolutionWidth = ?, 
            resolutionHeight = ?, 
            audioChannels = ?, 
            encodingJobId = ?, 
            lastSizeCheckAt = CURRENT_TIMESTAMP 
        WHERE filePath = ?
    `;
    try {
        const updateStmt = db.prepare(updateSql);
        const info = updateStmt.run(fileSize, videoCodec, audioCodec, resolutionWidth, resolutionHeight, audioChannels, jobId, targetDbFilePath);

        if (info.changes > 0) {
            console.log(`[DB Update] Successfully updated media record for ${targetDbFilePath} (Job ID: ${jobId}). Changes: ${info.changes}`);
        } else {
            console.warn(`[DB Update] No media record found or updated for filePath: ${targetDbFilePath}. Original file might not be in library.`);
        }
    } catch (error) {
        console.error(`[DB Update] Error updating media record for ${targetDbFilePath} (Job ID: ${jobId}):`, error);
        throw error; // Re-throw to be caught by the caller
    }
}
// --- END: Moved updateMediaAfterEncoding ---

// --- START: Performance History Functions (NEW ADDITIONS) ---
function initializePerformanceHistoryTable(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS performance_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            cpu_load REAL,
            gpu_load REAL,
            memory_load REAL
        );
    `);
    // Create an index on timestamp for faster queries and pruning
    db.exec(`CREATE INDEX IF NOT EXISTS idx_performance_history_timestamp ON performance_history (timestamp);`);
    console.log("[DB Init] Performance history table initialized.");
}

export function insertPerformanceRecord(db: Database.Database, cpuLoad: number | null, gpuLoad: number | null, memoryLoad: number | null): void {
    try {
        const stmt = db.prepare(`
            INSERT INTO performance_history (cpu_load, gpu_load, memory_load)
            VALUES (?, ?, ?)
        `);
        stmt.run(cpuLoad, gpuLoad, memoryLoad);
    } catch (error) {
        console.error("[DB] Error inserting performance record:", error);
    }
}

export function getPerformanceHistory(db: Database.Database, startDate: string, endDate: string): any[] {
    try {
        const stmt = db.prepare(`
            SELECT timestamp, cpu_load, gpu_load, memory_load
            FROM performance_history
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp ASC
        `);
        return stmt.all(startDate, endDate);
    } catch (error) {
        console.error("[DB] Error retrieving performance history:", error);
        return [];
    }
}

export function pruneOldPerformanceRecords(db: Database.Database, daysToKeep: number = 7): void {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffIsoString = cutoffDate.toISOString();

        const stmt = db.prepare(`
            DELETE FROM performance_history
            WHERE timestamp < ?
        `);
        const result = stmt.run(cutoffIsoString);
        console.log(`[DB] Pruned ${result.changes} old performance records older than ${cutoffIsoString}.`);
    } catch (error) {
        console.error("[DB] Error pruning old performance records:", error);
    }
}
// --- END: Performance History Functions ---

export async function initializeDatabase(appGetPath: GetPathFn): Promise<Database.Database> {
    let dbPath: string | undefined;
    try {
        dbPath = path.join(appGetPath('userData'), 'media_database.db');
        console.log(`Attempting to initialize database at: ${dbPath}`);
        const newDb = new Database(dbPath, { verbose: console.log });

        // Create media table if it doesn't exist
        newDb.exec(`
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                filePath TEXT UNIQUE NOT NULL,
                addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                originalSize INTEGER NOT NULL,
                currentSize INTEGER NOT NULL,
                lastSizeCheckAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                videoCodec TEXT,
                audioCodec TEXT,
                libraryName TEXT,
                libraryType TEXT CHECK( libraryType IN ('TV','Movies','Anime') ),
                resolutionWidth INTEGER,
                resolutionHeight INTEGER,
                audioChannels INTEGER,
                encodingJobId TEXT,
                encodingNodeId TEXT,
                UNIQUE(filePath)
            );
        `);

        // Create workflow related tables (these will be checked/migrated by checkAndMigrateWorkflowTables)
        console.log("[DB Setup] Ensuring workflow-related tables (migration will handle specifics)...");
        // Initial minimal creation, migration handles the rest
        newDb.exec(`
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                last_triggered_at DATETIME,
                UNIQUE(name)
            );
            CREATE TABLE IF NOT EXISTS workflow_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                node_type TEXT NOT NULL,
                label TEXT NOT NULL,
                description TEXT,
                position_x REAL NOT NULL,
                position_y REAL NOT NULL,
                data JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
                UNIQUE(workflow_id, node_id)
            );
            CREATE TABLE IF NOT EXISTS workflow_edges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id TEXT NOT NULL,
                edge_id TEXT NOT NULL,
                source_node_id TEXT NOT NULL,
                target_node_id TEXT NOT NULL,
                source_handle TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
                UNIQUE(workflow_id, edge_id)
            );
            CREATE TABLE IF NOT EXISTS workflow_executions (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                status TEXT CHECK( status IN ('running', 'completed', 'failed', 'cancelled') ),
                error_message TEXT,
                trigger_node_id TEXT NOT NULL,
                execution_data JSON,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            );
        `);


        console.log("[DB Setup] Attempting to create trigger for workflows table (if not exists)...");
        try {
            // This trigger assumes workflows.updated_at column exists, which migration ensures
            newDb.exec(`
                CREATE TRIGGER IF NOT EXISTS update_workflow_timestamp 
                AFTER UPDATE ON workflows
                FOR EACH ROW
                WHEN OLD.updated_at IS NOT NEW.updated_at -- Avoid infinite loop if trigger updates the same row
                BEGIN
                    UPDATE workflows 
                    SET updated_at = CURRENT_TIMESTAMP 
                    WHERE id = NEW.id;
                END;
            `);
            console.log("[DB Setup] Successfully executed CREATE TRIGGER for workflows table (if applicable).");
        } catch (error) {
            console.error("[DB Setup] ERROR creating trigger for workflow table (might be due to schema not yet migrated):", error);
        }

        // Create hardware_info table
        newDb.exec(`
            CREATE TABLE IF NOT EXISTS hardware_info (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_type TEXT NOT NULL CHECK(device_type IN ('CPU', 'GPU')),
                vendor TEXT,
                model TEXT NOT NULL,
                device_id TEXT,
                cores_threads INTEGER,
                base_clock_mhz REAL,
                memory_mb INTEGER,
                is_enabled BOOLEAN DEFAULT 1,
                priority INTEGER DEFAULT 0,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(device_type, model, vendor, device_id)
            );
        `);

        await initializePresetTable(newDb); // From presetDatabase.js
        await checkAndMigrateWorkflowTables(newDb); // Call the local/moved function to ensure schema is correct

        // Initialize performance_history table (NEW ADDITION)
        initializePerformanceHistoryTable(newDb);

        dbInstance = newDb;
        console.log("[DB Setup] Database instance configured.");
        return dbInstance;
    } catch (err) {
        console.error(`Failed to initialize database at path: ${dbPath || 'Unknown'}:`, err);
        throw err; // Re-throw to be handled by caller
    }
}

export function getDbInstance(): Database.Database {
    if (!dbInstance) {
        throw new Error("Database has not been initialized. Call initializeDatabase first.");
    }
    return dbInstance;
}

export function registerDbIpcHandlers(ipcMain: IpcMain) {
    ipcMain.handle('db-query', async (_event, sql: string, params: any[] = []) => {
        const currentDb = getDbInstance(); // Use the getter to ensure dbInstance is available
        // No need to check !currentDb here as getDbInstance throws if not initialized
        try {
            const command = sql.trim().split(' ')[0].toUpperCase();
            const stmt = currentDb.prepare(sql);

            if (command === 'SELECT') {
                return params.length > 0 ? stmt.all(params) : stmt.all();
            } else if (['INSERT', 'UPDATE', 'DELETE'].includes(command)) {
                const info = params.length > 0 ? stmt.run(params) : stmt.run();
                return info; // Contains changes, lastInsertRowid etc.
            } else {
                console.warn(`Unsupported SQL command attempted: ${command}`);
                throw new Error(`Unsupported SQL command: ${command}`);
            }
        } catch (error) {
            console.error(`Error executing SQL: ${sql}`, params, error);
            throw error; // Re-throw the error to be caught by the renderer
        }
    });
    console.log("[DB IPC] 'db-query' handler registered.");

    // IPC handler for getting performance history (NEW ADDITION)
    ipcMain.handle('get-performance-history', async (_event, startDate: string, endDate: string) => {
        if (!dbInstance) {
            console.error("[IPC Get Performance History] Database not initialized.");
            throw new Error("Database not initialized.");
        }
        return getPerformanceHistory(dbInstance, startDate, endDate);
    });
    // Potentially add a new console.log here if desired, or modify the existing one
    // For example: console.log("[DB IPC] 'db-query' and 'get-performance-history' handlers registered.");
}
