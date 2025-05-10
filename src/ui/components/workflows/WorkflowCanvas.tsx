import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Connection,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  NodeTypes,
  Panel,
  MarkerType,
  useReactFlow,
  ConnectionLineType,
  Node,
  EdgeProps,
  BaseEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { LayoutGrid, Plus, Save, Trash2, Undo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowNode, NodeData, ALL_NODES } from './types';
import TriggerNode from '@/ui/components/workflows/nodes/TriggerNode';
import ActionNode from '@/ui/components/workflows/nodes/ActionNode';
import ConditionNode from '@/ui/components/workflows/nodes/ConditionNode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

// Import custom node types
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
};

interface WorkflowCanvasProps {
  onNodeSelect: (node: WorkflowNode | null) => void;
  selectedNode: WorkflowNode | null;
  workflowId?: string; // Make this optional for backward compatibility
}

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ onNodeSelect, selectedNode, workflowId }) => {
  // Workflow state
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState<string>('New Workflow');
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, getNodes, getEdges } = useReactFlow();
  
  const [undoStack, setUndoStack] = useState<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Node creation dialogs
  const [showTriggerDialog, setShowTriggerDialog] = useState(false);
  const [showNodeDialog, setShowNodeDialog] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [selectedNodeType, setSelectedNodeType] = useState<'action' | 'condition' | null>(null);
  const [selectedNodeTemplate, setSelectedNodeTemplate] = useState<any>(null);
  const [parentNodeId, setParentNodeId] = useState<string | null>(null);
  const [connectionHandle, setConnectionHandle] = useState<string | null>(null);
  
  // Auto-layout configuration
  const nodeWidth = 280; // Increased width
  const nodeHeight = 56;  // Decreased height from 80 to 56
  const horizontalGap = 120; // Adjusted gap
  const verticalGap = 120;  // Adjusted gap
  
  // Track if a trigger node exists (workflows must start with a trigger)
  const hasTriggerNode = nodes.some(node => node.type === 'trigger');
  
  // Load existing workflow if workflowId is provided
  useEffect(() => {
    const loadWorkflow = async () => {
      if (!workflowId) return;
      
      try {
        const workflow = await window.electron.getWorkflow(workflowId);
        
        if (workflow) {
          setWorkflowName(workflow.name);
          setNodes(workflow.nodes || []);
          setEdges(workflow.edges || []);
          setHasChanges(false);
        }
      } catch (error) {
        console.error('Error loading workflow:', error);
      }
    };
    
    loadWorkflow();
  }, [workflowId, setNodes, setEdges]);
  
  // Trigger selection dialog
  const openTriggerDialog = useCallback(() => {
    if (hasTriggerNode) {
      toast.error('Workflow already has a trigger node');
      return;
    }
    setSelectedTrigger(null);
    setShowTriggerDialog(true);
  }, [hasTriggerNode]);
  
  // Add a new node when a connection handle is clicked
  const openNodeDialog = useCallback((parentId: string, handleId: string | null = null) => {
    setParentNodeId(parentId);
    setConnectionHandle(handleId);
    setSelectedNodeType(null);
    setSelectedNodeTemplate(null);
    setShowNodeDialog(true);
  }, []);
  
  // Create a new trigger node
  const addTriggerNode = useCallback(() => {
    if (!selectedTrigger) {
      toast.error('Please select a trigger type');
      return;
    }
    
    // Get trigger template
    const triggerTemplate = ALL_NODES.find(n => n.id === selectedTrigger && n.type === 'trigger');
    if (!triggerTemplate) {
      toast.error('Invalid trigger selected');
      return;
    }
    
    // Create new trigger node
    const newNodeId = `trigger-${uuidv4()}`;
    const newNode: WorkflowNode = {
      id: newNodeId,
      type: 'trigger',
      // Position at the top center of the canvas
      position: { x: 400, y: 100 },
      data: {
        ...triggerTemplate,
        label: triggerTemplate.label,
        description: triggerTemplate.description,
        icon: triggerTemplate.icon,
        type: 'trigger',
        properties: { ...triggerTemplate.properties },
      },
    };
    
    // Save current state to undo stack
    setUndoStack(prev => [...prev, { nodes, edges }]);
    
    // Add the new node
    setNodes(nds => [...nds, newNode]);
    setHasChanges(true);
    setShowTriggerDialog(false);
    
    // Auto-select the new node
    onNodeSelect(newNode);
  }, [selectedTrigger, nodes, edges, setNodes, onNodeSelect]);
  
  // Listen for custom events to open dialogs from node buttons or Workflows page
  useEffect(() => {
    const handleOpenTriggerDialog = () => {
      openTriggerDialog();
    };
    
    const handleOpenNodeDialogFromWorkflow = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { nodeId, handleId } = customEvent.detail;
      openNodeDialog(nodeId, handleId);
    };
    
    // Register event listeners
    window.addEventListener('openTriggerDialog', handleOpenTriggerDialog);
    window.addEventListener('openNodeDialogFromWorkflow', handleOpenNodeDialogFromWorkflow);
    
    // Cleanup on unmount
    return () => {
      window.removeEventListener('openTriggerDialog', handleOpenTriggerDialog);
      window.removeEventListener('openNodeDialogFromWorkflow', handleOpenNodeDialogFromWorkflow);
    };
  }, [openTriggerDialog, openNodeDialog]);
  
  // Create a new action or condition node
  const addNewNode = useCallback(() => {
    if (!selectedNodeType || !parentNodeId) {
      toast.error('Please select a node type');
      return;
    }
    
    if (!selectedNodeTemplate) {
      toast.error('Please select a node template');
      return;
    }
    
    // Get parent node
    const parentNode = nodes.find(n => n.id === parentNodeId);
    if (!parentNode) {
      toast.error('Parent node not found');
      return;
    }
    
    // Calculate position for the new node
    let position = { x: 0, y: 0 };
    let parentHandleId = connectionHandle;

    // Default positioning - directly below parent
    position = {
      x: parentNode.position.x,
      y: parentNode.position.y + nodeHeight + verticalGap
    };
    parentHandleId = `${parentNodeId}-out`; // Default output handle

    // For condition nodes, we adjust position based on the handle
    if (parentNode.type === 'condition' && connectionHandle) {
      if (connectionHandle === `${parentNodeId}-true`) {
        // Position to the left for true path
        position = {
          x: parentNode.position.x - (nodeWidth / 2) - (horizontalGap / 2), // Adjusted for better spacing
          y: parentNode.position.y + nodeHeight + verticalGap
        };
        parentHandleId = `${parentNodeId}-true`;
      } else if (connectionHandle === `${parentNodeId}-false`) {
        // Position to the right for false path
        position = {
          x: parentNode.position.x + (nodeWidth / 2) + (horizontalGap / 2), // Adjusted for better spacing
          y: parentNode.position.y + nodeHeight + verticalGap
        };
        parentHandleId = `${parentNodeId}-false`;
      }
      // If it's a condition node but not a true/false handle, it will use the default straight down.
    }
    
    // Create new node
    const newNodeId = `${selectedNodeType}-${uuidv4()}`;
    const newNode: WorkflowNode = {
      id: newNodeId,
      type: selectedNodeType,
      position,
      data: {
        ...selectedNodeTemplate,
        label: selectedNodeTemplate.label,
        description: selectedNodeTemplate.description,
        icon: selectedNodeTemplate.icon,
        type: selectedNodeType,
        properties: { ...selectedNodeTemplate.properties },
      },
    };
    
    // Create edge to connect parent to new node
    const newEdge: Edge = {
      id: `e-${parentNodeId}-${newNodeId}`,
      source: parentNodeId,
      target: newNodeId,
      sourceHandle: parentHandleId || undefined,
      targetHandle: `${newNodeId}-in`,
      animated: false, // Changed for solid lines
      style: { 
        stroke: '#00CED1', // Turquoise Blue
        strokeWidth: 2,
        filter: 'drop-shadow(0 0 3px #AFEEEE) drop-shadow(0 0 8px #40E0D0)', // Turquoise gradient glow
      },
      pathOptions: { borderRadius: 0 }, // Sharp corners for StepEdge
      markerEnd: { type: MarkerType.ArrowClosed, color: '#00CED1' }, // Turquoise Blue
      type: ConnectionLineType.Step, // Changed for 90-degree lines
    };
    
    // Save current state to undo stack
    setUndoStack(prev => [...prev, { nodes, edges }]);
    
    // Add the new node and edge
    setNodes(nds => [...nds, newNode]);
    setEdges(eds => [...eds, newEdge]);
    setHasChanges(true);
    setShowNodeDialog(false);
    
    // Auto-select the new node
    onNodeSelect(newNode);
    
    // Auto-layout the workflow after adding the node - Disabled for manual positioning
    setTimeout(() => autoLayoutWorkflow(), 50);
  }, [
    selectedNodeType, 
    selectedNodeTemplate, 
    parentNodeId, 
    connectionHandle, 
    nodes, 
    edges, 
    setNodes, 
    setEdges, 
    onNodeSelect
  ]);
  
  // Connect nodes when edges are created manually (this is less common in this approach)
  const onConnect = useCallback(
    (connection: Connection) => {
      // Save current state to undo stack
      setUndoStack(prev => [...prev, { nodes, edges }]);
      
      setEdges(eds => 
        addEdge({
          ...connection,
          animated: false, // Changed for solid lines
          style: { 
            stroke: '#00CED1', // Turquoise Blue
            strokeWidth: 2,
            filter: 'drop-shadow(0 0 3px #AFEEEE) drop-shadow(0 0 8px #40E0D0)', // Turquoise gradient glow
          },
          pathOptions: { borderRadius: 0 }, // Sharp corners for StepEdge
          markerEnd: { type: MarkerType.ArrowClosed, color: '#00CED1' }, // Turquoise Blue
          type: ConnectionLineType.Step, // Changed for 90-degree lines
        }, eds)
      );
      setHasChanges(true);
    },
    [nodes, edges, setEdges]
  );

  // Select a node when clicked
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect(node as WorkflowNode);
    },
    [onNodeSelect]
  );

  // Clear selection when clicking on the canvas
  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // Auto-layout the workflow for a clean organized flow
  const autoLayoutWorkflow = useCallback(() => {
    const currentNodes = getNodes(); // Get fresh nodes at execution time
    const currentEdges = getEdges(); // Get fresh edges at execution time

    if (currentNodes.length === 0) return;

    // Save current state to undo stack (using currentNodes, currentEdges)
    setUndoStack(prev => [...prev, { nodes: currentNodes, edges: currentEdges }]);

    // Create a map of nodes for quick lookup
    const nodeMap = new Map(currentNodes.map(node => [node.id, node]));
    
    // Create an adjacency list to track connections
    const adjacencyList: Record<string, string[]> = {};
    currentNodes.forEach(node => {
      adjacencyList[node.id] = [];
    });
    
    // Build the graph using currentEdges
    currentEdges.forEach(edge => {
      const source = edge.source;
      const target = edge.target;
      
      if (adjacencyList[source]) {
        adjacencyList[source].push(target);
      }
    });
    
    // Find root nodes (nodes without incoming edges) from currentNodes and currentEdges
    const incomingEdgesSet = new Set<string>();
    currentEdges.forEach(edge => {
      incomingEdgesSet.add(edge.target);
    });
    
    // Prioritize trigger nodes as roots
    const rootNodes = currentNodes
      .filter(node => !incomingEdgesSet.has(node.id))
      .sort((a, b) => {
        if (a.type === 'trigger' && b.type !== 'trigger') return -1;
        if (a.type !== 'trigger' && b.type === 'trigger') return 1;
        return 0;
      });
    
    if (rootNodes.length === 0) return;
    
    // Position map to store the calculated positions
    const nodePositions = new Map<string, { x: number, y: number }>();
    
    // Helper function to check if a node is a condition node
    const isConditionNode = (nodeId: string) => nodeMap.get(nodeId)?.type === 'condition';
    
    // Handle positioning of a branch (recursive)
    const positionBranch = (nodeId: string, x: number, y: number, depth = 0, pathType: 'main' | 'true' | 'false' = 'main') => {
      // Don't reposition nodes that already have a position (to handle converging paths)
      if (nodePositions.has(nodeId)) return;
      
      // Set this node's position
      nodePositions.set(nodeId, { x, y });
      
      const children = adjacencyList[nodeId] || [];
      const numChildren = children.length;
      
      if (isConditionNode(nodeId)) {
        // For condition nodes, create branches
        const truePathNodes: string[] = [];
        const falsePathNodes: string[] = [];
        
        // Determine which children are on the true path and which are on the false path
        children.forEach(childId => {
          const edge = currentEdges.find(e => e.source === nodeId && e.target === childId); // Use currentEdges
          if (edge?.sourceHandle === `${nodeId}-true`) {
            truePathNodes.push(childId);
          } else if (edge?.sourceHandle === `${nodeId}-false`) {
            falsePathNodes.push(childId);
          } else {
            // If no specific handle, default to true path (or handle as error/main path)
            truePathNodes.push(childId);
          }
        });
        
        // Position true path nodes (left)
        truePathNodes.forEach((childId, index) => {
          positionBranch(
            childId,
            x - (nodeWidth / 2) - (horizontalGap / 2), // Adjusted for condition branch centering
            y + nodeHeight + verticalGap + (index * (nodeHeight + verticalGap / 2)),
            depth + 1,
            'true'
          );
        });
        
        // Position false path nodes (right)
        falsePathNodes.forEach((childId, index) => {
          positionBranch(
            childId,
            x + (nodeWidth / 2) + (horizontalGap / 2), // Adjusted for condition branch centering
            y + nodeHeight + verticalGap + (index * (nodeHeight + verticalGap / 2)),
            depth + 1,
            'false'
          );
        });
      } else {
        // For regular (non-condition) nodes
        if (numChildren === 1) {
          // Single child: position directly below the current node
          const childId = children[0];
          positionBranch(childId, x, y + nodeHeight + verticalGap, depth + 1, pathType);
        } else if (numChildren > 1) {
          // Multiple children: arrange horizontally, centered under the current node
          const totalWidthOfChildren = (numChildren * nodeWidth) + ((numChildren - 1) * horizontalGap);
          let currentChildX = (x + nodeWidth / 2) - (totalWidthOfChildren / 2);
          const childrenY = y + nodeHeight + verticalGap;

          children.forEach(childId => {
            positionBranch(childId, currentChildX, childrenY, depth + 1, pathType);
            currentChildX += nodeWidth + horizontalGap;
          });
        }
        // If numChildren is 0, do nothing for children
      }
    };
    
    // Position each root node and its descendants
    rootNodes.forEach((rootNode, rootIndex) => {
      const rootX = 400 + (rootIndex * (nodeWidth * 2)); // Base X for root, can be adjusted
      positionBranch(rootNode.id, rootX, 100); // Start Y at 100
    });
    
    // Apply the calculated positions to nodes
    const updatedNodesLayout = currentNodes.map(node => {
      const newPos = nodePositions.get(node.id);
      if (newPos) {
        return { ...node, position: newPos };
      }
      return node;
    });
    
    setNodes(updatedNodesLayout);
    setHasChanges(true);
  }, [getNodes, getEdges, setNodes, setHasChanges, setUndoStack, nodeWidth, nodeHeight, horizontalGap, verticalGap]); // Added layout constants to dependencies

  // Undo the last action
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    const prevState = undoStack[undoStack.length - 1];
    setNodes(prevState.nodes);
    setEdges(prevState.edges);
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack, setNodes, setEdges]);

  // Delete the selected node
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    
    // Save current state to undo stack
    setUndoStack(prev => [...prev, { nodes, edges }]); // uses state `nodes` and `edges` here before deletion
    
    // Get incoming and outgoing edges for the selected node
    const incomingEdges = edges.filter(edge => edge.target === selectedNode.id);
    const outgoingEdges = edges.filter(edge => edge.source === selectedNode.id);
    
    // Reconnect the workflow intelligently when removing a node
    let newEdgesToAdd: Edge[] = [];
    
    // Simple case: node in the middle of a linear chain
    if (incomingEdges.length === 1 && outgoingEdges.length === 1 && selectedNode.type !== 'condition') {
      // Connect the source of incoming edge to the target of outgoing edge
      const incomingEdge = incomingEdges[0];
      const outgoingEdge = outgoingEdges[0];
      
      newEdgesToAdd.push({
        id: `e-${incomingEdge.source}-${outgoingEdge.target}`,
        source: incomingEdge.source,
        target: outgoingEdge.target,
        sourceHandle: incomingEdge.sourceHandle || `${incomingEdge.source}-out`,
        targetHandle: outgoingEdge.targetHandle || `${outgoingEdge.target}-in`,
        animated: false,
        style: { 
          stroke: '#00CED1', // Turquoise Blue
          strokeWidth: 2,
          filter: 'drop-shadow(0 0 3px #AFEEEE) drop-shadow(0 0 8px #40E0D0)', // Turquoise gradient glow
        },
        pathOptions: { borderRadius: 0 }, // Sharp corners for StepEdge
        markerEnd: { type: MarkerType.ArrowClosed, color: '#00CED1' }, // Turquoise Blue
        type: ConnectionLineType.Step,
      });
    }
    
    // Update edges: remove edges connected to the deleted node and add any new edges
    setEdges(eds => [
      ...eds.filter(edge => edge.source !== selectedNode.id && edge.target !== selectedNode.id),
      ...newEdgesToAdd
    ]);
    
    // Remove the node
    setNodes(nds => nds.filter(node => node.id !== selectedNode.id));
    
    onNodeSelect(null);
    setHasChanges(true);
    
    // Auto-layout the workflow after deletion to clean up
    setTimeout(() => autoLayoutWorkflow(), 50);
  }, [selectedNode, nodes, edges, setNodes, setEdges, onNodeSelect, setUndoStack, setHasChanges]); // Removed autoLayoutWorkflow from deps, added setUndoStack, setHasChanges

  // Save the workflow
  const saveWorkflow = useCallback(() => {
    const workflow = {
      id: workflowId || uuidv4(),
      name: workflowName,
      nodes,
      edges
    };

    // Save workflow to the database using IPC
    window.electron.saveWorkflow(workflow)
      .then(() => {
        toast.success('Workflow saved successfully');
        setHasChanges(false);
      })
      .catch((error: Error) => {
        console.error('Error saving workflow:', error);
        toast.error('Failed to save workflow: ' + error.message);
      });
  }, [workflowName, nodes, edges, workflowId]);

  // Get appropriate node templates for a given node type
  const getNodeTemplates = useCallback((type: 'trigger' | 'action' | 'condition') => {
    return ALL_NODES.filter(node => node.type === type);
  }, []);

  return (
    <div className="flex-1 h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        connectionLineType={ConnectionLineType.Step} // Changed for 90-degree lines
        snapGrid={[20, 20]}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={1.5}
        className="bg-muted/30"
      >
        <Background color="#94a3b8" size={1.5} gap={24} />
        <Controls 
          showInteractive={false}
          className="bg-background border shadow-md"
        />
        
        {/* Toolbar */}
        <Panel position="top-left" className="bg-background border rounded-md shadow-md p-2 m-2">
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    className="h-8 w-8"
                  >
                    <Undo className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Undo</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={deleteSelectedNode}
                    disabled={!selectedNode}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Delete Selected Node</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <div className="h-4 w-px bg-border mx-1" />
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={saveWorkflow}
                    className={`h-8 w-8 ${hasChanges ? 'border-indigo-500 text-indigo-500' : ''}`}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Save Workflow</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </Panel>
        
        {/* Helper message for empty canvas */}
        {nodes.length === 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="bg-background/90 border rounded-md shadow-md p-6 text-center max-w-md">
              <h3 className="font-medium text-xl mb-4">Start Building Your Workflow</h3>
              <p className="text-muted-foreground mb-6">
                Your workflow must begin with a trigger. Add a trigger node to get started.
              </p>
              <Button 
                variant="default" 
                size="lg" 
                onClick={openTriggerDialog}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Trigger Node
              </Button>
            </div>
          </div>
        )}
      </ReactFlow>
      
      {/* Trigger Selection Dialog */}
      <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select a Trigger</DialogTitle>
            <DialogDescription>Choose a trigger to start your workflow</DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Select value={selectedTrigger || ''} onValueChange={setSelectedTrigger}>
              <SelectTrigger>
                <SelectValue placeholder="Select a trigger type" />
              </SelectTrigger>
              <SelectContent>
                {getNodeTemplates('trigger').map((trigger) => (
                  <SelectItem key={trigger.id} value={trigger.id}>
                    {trigger.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedTrigger && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <h4 className="font-medium mb-1">
                  {getNodeTemplates('trigger').find(t => t.id === selectedTrigger)?.label}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {getNodeTemplates('trigger').find(t => t.id === selectedTrigger)?.description}
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTriggerDialog(false)}>
              Cancel
            </Button>
            <Button 
              disabled={!selectedTrigger} 
              onClick={addTriggerNode}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Add Trigger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Node Addition Dialog */}
      <Dialog open={showNodeDialog} onOpenChange={setShowNodeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a Node</DialogTitle>
            <DialogDescription>Choose a node type to add to your workflow</DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Node Type</h4>
              <div className="flex gap-2">
                <Button
                  variant={selectedNodeType === 'action' ? 'default' : 'outline'}
                  className={selectedNodeType === 'action' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                  onClick={() => setSelectedNodeType('action')}
                >
                  Action
                </Button>
                <Button
                  variant={selectedNodeType === 'condition' ? 'default' : 'outline'}
                  className={selectedNodeType === 'condition' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                  onClick={() => setSelectedNodeType('condition')}
                >
                  Condition
                </Button>
              </div>
            </div>
            
            {selectedNodeType && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Select a {selectedNodeType}</h4>
                <Select 
                  value={selectedNodeTemplate?.id || ''} 
                  onValueChange={(value) => {
                    const template = getNodeTemplates(selectedNodeType).find(n => n.id === value);
                    setSelectedNodeTemplate(template);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select a ${selectedNodeType}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {getNodeTemplates(selectedNodeType).map((node) => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedNodeTemplate && (
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <h4 className="font-medium mb-1">{selectedNodeTemplate.label}</h4>
                    <p className="text-sm text-muted-foreground">{selectedNodeTemplate.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNodeDialog(false)}>
              Cancel
            </Button>
            <Button 
              disabled={!selectedNodeType || !selectedNodeTemplate} 
              onClick={addNewNode}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Add Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkflowCanvas;
