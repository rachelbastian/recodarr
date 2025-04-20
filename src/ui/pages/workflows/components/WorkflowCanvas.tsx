import React, { useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Panel,
  Connection,
  addEdge,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from "@/components/ui/button";
import { Zap } from 'lucide-react';
import { useWorkflows } from '../context/WorkflowsContext';
import { TriggerNode } from './nodes/TriggerNode';
import { ActionNode } from './nodes/ActionNode';
import { triggerTypes } from '../config/triggerTypes';

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
};

export const WorkflowCanvas: React.FC = () => {
  const { 
    nodes, 
    edges, 
    setEdges,
    isEditing,
    reactFlowInstance,
    addNewTrigger,
  } = useWorkflows();

  // Handle connection between nodes
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
        nodesDraggable={isEditing}
        nodesConnectable={isEditing}
        elementsSelectable={isEditing}
        edgesFocusable={isEditing}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        
        {isEditing && (
          <Panel position="top-right" className="bg-card border rounded-lg p-4 shadow-lg mr-4 mt-4 z-50">
            <div className="space-y-4 w-[200px]">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Triggers
              </h3>
              <div className="space-y-2">
                {triggerTypes.map((trigger) => (
                  <Button
                    key={trigger.id}
                    variant="outline"
                    className="w-full justify-start pointer-events-auto"
                    onClick={() => addNewTrigger(trigger)}
                  >
                    {trigger.icon}
                    <span className="ml-2">{trigger.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}; 