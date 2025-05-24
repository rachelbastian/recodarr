import Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';

// Define interfaces for workflow elements
interface WorkflowNodeData {
    id: string;         // Template ID (e.g., 'manual-trigger', 'send-notification')
    label: string;
    description?: string;
    icon?: any; 
    type: 'trigger' | 'action' | 'condition'; // This is the template node type, not ReactFlow's
    properties: Record<string, any>;
}

interface WorkflowNode {
    id: string;         // Instance ID (unique within the workflow, used by ReactFlow)
    type?: string;       // Node type for ReactFlow (e.g., 'customTrigger', 'customAction') - can be different from data.type
    position: { x: number; y: number }; // Use inline type definition
    data: WorkflowNodeData; // Our custom data payload
    // ReactFlow specific optional properties (add if used, e.g. from reactflow's Node type)
    sourcePosition?: string; // e.g., 'bottom' | 'top' | 'left' | 'right'
    targetPosition?: string; 
    draggable?: boolean;
    selectable?: boolean;
    connectable?: boolean;
    // ... other ReactFlow Node properties as needed
}

interface WorkflowEdge {
    id: string;
    source: string;         // Source node instance ID
    target: string;         // Target node instance ID
    sourceHandle?: string | null;
    targetHandle?: string | null;
    type?: string;           // Edge type for ReactFlow (e.g., 'customEdge')
    animated?: boolean;
    // ... other ReactFlow Edge properties as needed
}

interface WorkflowExecutionResult {
    success: boolean;
    message: string;
    error?: string;
    failedNodeId?: string;
    executionId?: number; // ID from the workflow_executions table
}

interface ExecutionContext {
    [key: string]: any;
    errors: string[]; 
}

interface WorkflowData {
    id: string;
    name: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

interface ExecutionResult {
    success: boolean;
    message: string;
    executionId: string;
}

// Refined executeNodeAction
async function executeNodeAction(
    node: WorkflowNode, // Use the revised WorkflowNode type
    context: ExecutionContext,
    _db: Database.Database, 
    mainWindow: BrowserWindow | null
): Promise<ExecutionContext> {
    console.log(`[WorkflowExecutor] Executing action for node ${node.id} (Template ID: ${node.data.id}, Label: "${node.data.label}")`);
    const newContext = { ...context };

    try {
        // Access properties from node.data.properties
        // Access template ID from node.data.id
        switch (node.data.id) { // Switch on the template ID
            case 'manual-trigger':
                console.log(`   Action: Manual trigger processed for workflow.`);
                break;

            case 'scheduled':
                console.log(`   Action: Scheduled trigger processed for workflow.`);
                break;

            case 'send-notification':
                const { 
                    message = 'Default notification message',
                    type = 'info', 
                    title = 'Workflow Notification'
                } = node.data.properties || {};
                
                console.log(`   Action: Sending notification - Title: "${title}", Type: ${type}, Message: "${message}"`);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('show-toast-notification', { title, type, message });
                }
                break;
            
            default:
                console.warn(`   Action: No specific action implemented for template ID "${node.data.id}". Skipping.`);
                newContext.errors.push(`No action for template ID ${node.data.id} (Node Label: ${node.data.label})`);
        }
    } catch (actionError) {
        console.error(`   Error executing action for node ${node.id} (${node.data.label}):`, actionError);
        newContext.errors.push(`Action failed for ${node.data.label}: ${(actionError as Error).message}`);
    }
    
    return newContext;
}

async function getWorkflowDetailsFromDb(workflowId: string, db: Database.Database): Promise<WorkflowData | null> {
    const workflowRow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as any;
    if (!workflowRow) return null;

    // In db, node_type is the ReactFlow type (e.g. 'trigger', 'action')
    // node.data.type is the template node type ('trigger', 'action', 'condition')
    const nodesRaw = db.prepare('SELECT node_id, node_type, position_x, position_y, data FROM workflow_nodes WHERE workflow_id = ?').all(workflowId) as any[];
    const edgesRaw = db.prepare('SELECT edge_id, source_node_id, target_node_id, source_handle FROM workflow_edges WHERE workflow_id = ?').all(workflowId) as any[];

    const nodes: WorkflowNode[] = nodesRaw.map(n => ({
        id: n.node_id,       // This is the instance ID for ReactFlow
        type: n.node_type,    // This is the ReactFlow node type (e.g., 'triggerNode', 'actionNode')
        position: { x: Number(n.position_x), y: Number(n.position_y) }, // Still cast to number
        data: JSON.parse(n.data || '{}') as WorkflowNodeData, // Contains templateId, label, properties, etc.
    }));

    const edges: WorkflowEdge[] = edgesRaw.map(e => ({
        id: e.edge_id,
        source: e.source_node_id,
        target: e.target_node_id,
        sourceHandle: e.source_handle || undefined,
        // type: e.edge_type, // if you store custom edge types
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
    db: Database.Database,
    mainWindow: BrowserWindow | null,
    executionId: string
): Promise<ExecutionResult> {
    console.log(`[WorkflowExecutor] Starting execution for workflow: ${workflowId}, trigger: ${triggerNodeId}, execution ID: ${executionId}`);
    mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: 'starting', message: 'Workflow starting...' });

    try {
        db.prepare(
            `INSERT INTO workflow_executions (id, workflow_id, trigger_node_id, started_at, status)
             VALUES (?, ?, ?, datetime('now'), 'running')`
        ).run(executionId, workflowId, triggerNodeId);
    } catch (dbError) {
        console.error(`[WorkflowExecutor] DB Error logging start for ${executionId}:`, dbError);
        return { success: false, message: `Database error on execution start: ${(dbError as Error).message}`, executionId };
    }

    let finalStatus: 'running' | 'completed' | 'failed' | 'error' = 'error';
    let finalMessage: string = 'Workflow execution failed due to an unexpected error.';
    let executionContext: ExecutionContext = { errors: [] };

    try {
        const workflow = await getWorkflowDetailsFromDb(workflowId, db);
        if (!workflow) {
            throw new Error(`Workflow with ID ${workflowId} not found.`);
        }

        const triggerNode = workflow.nodes.find(node => node.id === triggerNodeId);
        if (!triggerNode) {
            throw new Error(`Trigger node ${triggerNodeId} not found in workflow ${workflowId}.`);
        }
        // Validate against node.data.id (template ID) and node.type (ReactFlow type from DB)
        const isValidTrigger = triggerNode.type === 'trigger' && 
            (triggerNode.data?.id === 'manual-trigger' || triggerNode.data?.id === 'scheduled');
        
        if (!isValidTrigger) {
            throw new Error(`Node ${triggerNodeId} (Template: ${triggerNode.data?.id}, Type: ${triggerNode.type}) is not a valid trigger for execution.`);
        }

        console.log(`[WorkflowExecutor] Successfully validated trigger ${triggerNodeId} (${triggerNode.data?.id}) for workflow ${workflow.name} (Execution ID: ${executionId}).`);
        mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: 'running', message: `Executing workflow: ${workflow.name}...` });

        let currentNode: WorkflowNode | undefined = triggerNode;
        const visitedNodeIds = new Set<string>();

        while (currentNode) {
            if (visitedNodeIds.has(currentNode.id)) {
                console.warn(`[WorkflowExecutor] Loop detected at node ${currentNode.id}. Stopping branch.`);
                executionContext.errors.push(`Loop detected at node ${currentNode.data.label || currentNode.id}`);
                break;
            }
            visitedNodeIds.add(currentNode.id);

            executionContext = await executeNodeAction(currentNode, executionContext, db, mainWindow);
            
            if (executionContext.errors.length > 0 && nodeIsCritical(currentNode)) {
                console.error(`[WorkflowExecutor] Critical error after node ${currentNode.data.label || currentNode.id}. Workflow may be unstable.`);
            }

            const outgoingEdges = workflow.edges.filter(edge => edge.source === currentNode?.id);
            
            if (outgoingEdges.length > 0) {
                const nextEdge = outgoingEdges[0];
                currentNode = workflow.nodes.find(node => node.id === nextEdge.target);
                if (!currentNode) {
                    console.warn(`[WorkflowExecutor] Next node ID ${nextEdge.target} found in edge, but node data is missing.`);
                    executionContext.errors.push(`Dangling edge: target node ${nextEdge.target} not found.`);
                }
            } else {
                console.log(`[WorkflowExecutor] Node ${currentNode.id} is an end node for this path.`);
                currentNode = undefined;
            }
        }

        if (executionContext.errors.length > 0) {
            finalStatus = 'failed';
            finalMessage = `Workflow "${workflow.name}" completed with errors: ${executionContext.errors.join('; ')}`;
            console.warn(`[WorkflowExecutor] ${finalMessage} (Execution ID: ${executionId})`);
        } else {
            finalStatus = 'completed';
            finalMessage = `Workflow "${workflow.name}" executed successfully.`;
            console.log(`[WorkflowExecutor] ${finalMessage} (Execution ID: ${executionId})`);
        }
        
        mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: finalStatus, message: finalMessage });
        return { success: finalStatus === 'completed', message: finalMessage, executionId };

    } catch (error) {
        finalStatus = 'failed'; 
        finalMessage = error instanceof Error ? error.message : String(error);
        console.error(`[WorkflowExecutor] Error during workflow ${workflowId} (Execution ID: ${executionId}):`, error);
        mainWindow?.webContents.send('workflow-status', { workflowId, executionId, status: finalStatus, message: finalMessage });
        return { success: false, message: finalMessage, executionId };
    } finally {
        try {
            db.prepare(
                `UPDATE workflow_executions
                 SET completed_at = datetime('now'), status = ?, error_message = ?
                 WHERE id = ?`
            ).run(finalStatus, (finalStatus === 'failed' || finalStatus === 'error') ? finalMessage : null, executionId);
            console.log(`[WorkflowExecutor] Logged final status '${finalStatus}' for execution ID ${executionId}.`);
        } catch (dbError) {
            console.error(`[WorkflowExecutor] DB Error logging completion for ${executionId}:`, dbError);
        }
    }
}

function nodeIsCritical(node: WorkflowNode): boolean {
    // Example: A trigger node's successful processing might be considered critical.
    // The `type` here refers to the ReactFlow node type (e.g., 'trigger', 'action')
    // The `node.data.type` refers to the template's type.
    return node.type === 'trigger'; 
}