import Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import { getDbInstance } from './dbUtils.js'; // Assuming dbUtils exports this
import { Node, Edge } from 'reactflow';

// Define interfaces for workflow elements (could be shared)
interface WorkflowNodeData {
    id: string;         // Template ID (e.g., 'manual-trigger', 'encode-h265')
    label: string;
    description?: string;
    icon?: any; // Or specific type
    type: 'trigger' | 'action' | 'condition';
    properties: Record<string, any>;
}

interface WorkflowNode {
    id: string;         // Instance ID (unique within the workflow)
    type: 'trigger' | 'action' | 'condition';
    position: { x: number; y: number };
    data: WorkflowNodeData;
}

interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}

interface WorkflowExecutionResult {
    success: boolean;
    message: string;
    error?: string;
    failedNodeId?: string;
    executionId?: number; // ID from the workflow_executions table
}

interface ExecutionContext {
    // Data passed between nodes can be stored here
    // For example: filePath, encodingOptions, etc.
    [key: string]: any;
}

// Define a more specific type for workflow data if possible
interface WorkflowData {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
    // other properties like description, created_at, etc.
}

interface ExecutionResult {
    success: boolean;
    message: string;
    executionId: string; // Added executionId here
}

// Placeholder for actual node action execution
async function executeNodeAction(node: WorkflowNode, context: ExecutionContext, db: Database.Database, mainWindow: BrowserWindow | null): Promise<ExecutionContext> {
    console.log(`[Workflow Executor] Executing action for node ${node.id} (Type: ${node.data.id}, Label: "${node.data.label}")`);
    // --- Actual Action Logic Would Go Here ---
    // Based on node.data.id, perform the specific action (e.g., start encoding, check condition)
    // Update the context object with results if necessary

    // Example: Simulate an action based on node ID
    switch (node.data.id) {
        case 'manual-trigger':
            console.log(`   Action: Manual trigger initiated.`);
            // Add initial context if needed, e.g., context.triggerTime = new Date();
            break;
        case 'encode-h265': // Example action ID
            console.log(`   Action: Simulate H.265 encoding.`);
            // context.outputFilePath = "simulated/output/path.mkv";
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
            break;
        case 'log-message': // Example action ID
            console.log(`   Action: Log message - ${node.data.properties?.message || 'No message configured'}`);
            break;
        // Add cases for other node types (conditions, other actions)
        default:
            console.warn(`   Action: No specific action implemented for node type "${node.data.id}". Skipping.`);
    }

    // Simulate potential failure for testing
    if (node.data.properties?.simulateError) {
         throw new Error(`Simulated error in node "${node.data.label}" (${node.id})`);
    }

    return context; // Return updated context
}

// Mock function for getting workflow details - replace with actual DB call
async function getWorkflowDetailsFromDb(workflowId: string, db: Database.Database): Promise<WorkflowData | null> {
    const workflowRow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as any;
    if (!workflowRow) return null;

    const nodesRaw = db.prepare('SELECT node_id, node_type, position_x, position_y, data FROM workflow_nodes WHERE workflow_id = ?').all(workflowId) as any[];
    const edgesRaw = db.prepare('SELECT edge_id, source_node_id, target_node_id FROM workflow_edges WHERE workflow_id = ?').all(workflowId) as any[];

    const nodes: Node[] = nodesRaw.map(n => ({
        id: n.node_id,
        type: n.node_type,
        position: { x: n.position_x, y: n.position_y },
        data: JSON.parse(n.data || '{}')
    }));
    const edges: Edge[] = edgesRaw.map(e => ({
        id: e.edge_id,
        source: e.source_node_id,
        target: e.target_node_id,
    }));

    return {
        id: workflowRow.id,
        name: workflowRow.name,
        nodes,
        edges,
    };
}

export async function executeWorkflow(
    workflowId: string,
    triggerNodeId: string,
    db: Database.Database, // Assuming DB is passed
    mainWindow: BrowserWindow | null,
    executionId: string // New parameter
): Promise<ExecutionResult> {
    console.log(`[WorkflowExecutor] Starting execution for workflow: ${workflowId}, trigger: ${triggerNodeId}, execution ID: ${executionId}`);
    mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: 'starting', message: 'Workflow starting...' });

    // Log start of execution
    try {
        db.prepare(
            `INSERT INTO workflow_executions (id, workflow_id, trigger_node_id, started_at, status)
             VALUES (?, ?, ?, datetime('now'), 'running')`
        ).run(executionId, workflowId, triggerNodeId);
    } catch (dbError) {
        console.error(`[WorkflowExecutor] DB Error logging start for ${executionId}:`, dbError);
        // If we can't even log the start, it's a critical issue with DB or setup
        return { success: false, message: `Database error on execution start: ${(dbError as Error).message}`, executionId };
    }

    let finalStatus: 'running' | 'completed' | 'failed' | 'error' = 'error'; // Default to error, adjusted type
    let finalMessage: string = 'Workflow execution failed due to an unexpected error.';

    try {
        const workflow = await getWorkflowDetailsFromDb(workflowId, db);
        if (!workflow) {
            finalMessage = `Workflow with ID ${workflowId} not found.`;
            console.error(`[WorkflowExecutor] ${finalMessage} (Execution ID: ${executionId})`);
            throw new Error(finalMessage);
        }

        const triggerNode = workflow.nodes.find(node => node.id === triggerNodeId);
        if (!triggerNode) {
            finalMessage = `Trigger node ${triggerNodeId} not found in workflow ${workflowId}.`;
            console.error(`[WorkflowExecutor] ${finalMessage} (Execution ID: ${executionId})`);
            throw new Error(finalMessage);
        }

        if (triggerNode.data?.id !== 'manual-trigger' || triggerNode.type !== 'trigger') {
            finalMessage = `Node ${triggerNodeId} is not a valid manual trigger for workflow ${workflowId}.`;
            console.error(`[WorkflowExecutor] ${finalMessage} (Execution ID: ${executionId})`);
            throw new Error(finalMessage);
        }

        console.log(`[WorkflowExecutor] Successfully validated manual trigger ${triggerNodeId} for workflow ${workflow.name} (Execution ID: ${executionId}).`);
        mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: 'running', message: `Executing workflow: ${workflow.name}...` });

        // --- Placeholder for actual workflow execution logic ---
        // This is where you would iterate through nodes, execute actions, etc.
        // For now, we'll simulate a successful execution.
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
        
        // Example: If an action node fails:
        // throw new Error("Simulated action node failure during execution.");

        console.log(`[WorkflowExecutor] Placeholder execution logic completed for ${workflow.name}. (Execution ID: ${executionId})`);
        // --- End of placeholder ---

        finalStatus = 'completed'; // Use 'completed' to match schema constraint
        finalMessage = `Workflow "${workflow.name}" executed successfully (simulated).`;
        mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: 'completed', message: finalMessage }); // Send 'completed' status
        console.log(`[WorkflowExecutor] ${finalMessage} (Execution ID: ${executionId})`);
        return { success: true, message: finalMessage, executionId };

    } catch (error) {
        finalStatus = 'error';
        finalMessage = error instanceof Error ? error.message : String(error);
        console.error(`[WorkflowExecutor] Error during workflow ${workflowId} (Execution ID: ${executionId}):`, error);
        mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: 'error', message: finalMessage });
        return { success: false, message: finalMessage, executionId };
    } finally {
        // Log completion/failure of execution
        try {
            db.prepare(
                `UPDATE workflow_executions
                 SET completed_at = datetime('now'), status = ?, error_message = ?
                 WHERE id = ?`
            ).run(finalStatus, finalStatus === 'error' ? finalMessage : null, executionId);
            console.log(`[WorkflowExecutor] Logged final status '${finalStatus}' for execution ID ${executionId}.`);
        } catch (dbError) {
            console.error(`[WorkflowExecutor] DB Error logging completion for ${executionId}:`, dbError);
            // This is problematic as the execution might have finished but logging failed.
            // The primary return to IPC handler will still reflect workflow outcome.
        }
    }
}