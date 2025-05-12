import Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import { getDbInstance } from './dbUtils.js'; // Assuming dbUtils exports this

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

export async function executeWorkflow(
    workflowId: string,
    triggerNodeId: string,
    db: Database.Database,
    mainWindow: BrowserWindow | null
): Promise<WorkflowExecutionResult> {
    console.log(`[Workflow Executor] Starting execution for workflow: ${workflowId}, triggered by: ${triggerNodeId}`);
    let executionId: number | undefined;
    const startTime = Date.now();

    try {
        // 1. Record Workflow Execution Start
        const insertExecStmt = db.prepare(`
            INSERT INTO workflow_executions (workflow_id, trigger_node_id, status)
            VALUES (?, ?, 'running')
        `);
        const execInfo = insertExecStmt.run(workflowId, triggerNodeId);
        executionId = Number(execInfo.lastInsertRowid);
        console.log(`[Workflow Executor] Recorded execution start in DB (ID: ${executionId})`);

        // 2. Fetch Workflow Structure
        const workflowInfo = db.prepare('SELECT name FROM workflows WHERE id = ?').get(workflowId) as { name: string } | undefined;
        if (!workflowInfo) throw new Error(`Workflow ${workflowId} not found.`);

        const nodesRaw = db.prepare('SELECT node_id, node_type, position_x, position_y, data FROM workflow_nodes WHERE workflow_id = ?').all(workflowId) as any[];
        const edgesRaw = db.prepare('SELECT edge_id, source_node_id, target_node_id, source_handle FROM workflow_edges WHERE workflow_id = ?').all(workflowId) as any[];

        if (nodesRaw.length === 0) {
             throw new Error(`Workflow ${workflowId} has no nodes.`);
        }

        const nodes: WorkflowNode[] = nodesRaw.map(n => ({
            id: n.node_id,
            type: n.node_type,
            position: { x: n.position_x, y: n.position_y },
            data: JSON.parse(n.data || '{}') as WorkflowNodeData
        }));
        const edges: WorkflowEdge[] = edgesRaw.map(e => ({
            id: e.edge_id,
            source: e.source_node_id,
            target: e.target_node_id,
            sourceHandle: e.source_handle
        }));

        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        // 3. Find Starting Point (Node after trigger)
        const triggerNode = nodeMap.get(triggerNodeId);
        if (!triggerNode || triggerNode.type !== 'trigger') {
            throw new Error(`Trigger node ${triggerNodeId} not found or is not a trigger type.`);
        }

        // 4. Execution Loop (Simplified: Follows first path from trigger)
        let currentNode: WorkflowNode | undefined = triggerNode;
        let context: ExecutionContext = { // Initial context
             workflowId: workflowId,
             triggerNodeId: triggerNodeId,
        };
        let visitedNodeIds = new Set<string>(); // Prevent infinite loops in simple cycles

        while (currentNode) {
            if (visitedNodeIds.has(currentNode.id)) {
                console.warn(`[Workflow Executor] Detected loop involving node ${currentNode.id}. Stopping execution branch.`);
                break; // Stop this branch
            }
            visitedNodeIds.add(currentNode.id);

             // Execute the current node's action
            context = await executeNodeAction(currentNode, context, db, mainWindow);

            // Find the next node(s) based on edges
            // TODO: Handle conditions and multiple outgoing paths properly
            const outgoingEdges = edges.filter(e => e.source === currentNode?.id);
            let nextNodeId: string | undefined = undefined;

            if (outgoingEdges.length > 0) {
                 // Simple case: Take the first outgoing edge
                 // More complex logic needed for conditions ('true'/'false' handles)
                 // and parallel paths.
                 const nextEdge = outgoingEdges[0]; // Simplification
                 nextNodeId = nextEdge.target;
            } else {
                 console.log(`[Workflow Executor] Node ${currentNode.id} is an end node for this path.`);
            }

            currentNode = nextNodeId ? nodeMap.get(nextNodeId) : undefined;
             if (nextNodeId && !currentNode) {
                 console.warn(`[Workflow Executor] Next node ID ${nextNodeId} found in edge, but node data is missing.`);
             }
        }

        // 5. Record Workflow Execution End (Success)
        const endTime = Date.now();
        console.log(`[Workflow Executor] Workflow execution completed successfully in ${(endTime - startTime) / 1000}s.`);
        const updateExecStmt = db.prepare(`
            UPDATE workflow_executions
            SET completed_at = CURRENT_TIMESTAMP, status = 'completed'
            WHERE id = ?
        `);
        updateExecStmt.run(executionId);

        mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: 'completed', message: `Workflow "${workflowInfo.name}" finished.` });
        return { success: true, message: `Workflow "${workflowInfo.name}" executed successfully.`, executionId };

    } catch (error) {
        const endTime = Date.now();
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Identify failing node if possible (requires tracking current node in catch)
        // For now, we don't have the exact failing node easily accessible in this catch block
        // TODO: Refactor loop to catch errors within the node execution step to get failedNodeId
        const failedNodeId = undefined; // Placeholder

        console.error(`[Workflow Executor] Workflow execution failed after ${(endTime - startTime) / 1000}s:`, error);

        if (executionId) {
            // Update execution record with failure details
            try {
                const updateExecStmt = db.prepare(`
                    UPDATE workflow_executions
                    SET completed_at = CURRENT_TIMESTAMP, status = 'failed', error_message = ?
                    WHERE id = ?
                `);
                updateExecStmt.run(errorMsg.substring(0, 1000), executionId); // Limit error message size
                 mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: 'failed', message: `Workflow failed: ${errorMsg}` });
            } catch (dbError) {
                 console.error(`[Workflow Executor] CRITICAL: Failed to update execution status in DB after error:`, dbError);
            }
        }

        return {
            success: false,
            message: `Workflow execution failed: ${errorMsg}`,
            error: errorMsg,
            failedNodeId: failedNodeId, // Will be undefined for now
            executionId: executionId
        };
    }
} 