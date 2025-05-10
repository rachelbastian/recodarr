import React, { useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../types';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';

// Trigger nodes only have output handles (no input as they start the flow)
const TriggerNode: React.FC<NodeProps<NodeData>> = ({ id, data, selected }) => {
  const handleAddNode = useCallback(() => {
    // Using a custom event to communicate with parent component
    const event = new CustomEvent('openNodeDialog', {
      detail: { nodeId: id, handleId: `${id}-out` }
    });
    window.dispatchEvent(event);
  }, [id]);

  return (
    <div className={`w-[280px] h-[80px] rounded-lg border p-2.5 shadow-sm ${selected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-border'} bg-background flex flex-col justify-between relative`}>
      <div className="flex items-start gap-3">
        {/* CSS icon instead of emoji */}
        <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-indigo-100 dark:bg-indigo-950/50">
          <div className="w-4 h-4">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
              <circle cx="12" cy="12" r="6" className="fill-indigo-500"/>
              <circle cx="12" cy="12" r="10" className="stroke-indigo-500" strokeWidth="2" strokeDasharray="4 2" fill="none"/>
            </svg>
          </div>
        </div>
        
        {/* Divider */}
        <div className="w-px self-stretch bg-border"></div>
        
        {/* Title only - description removed */}
        <div className="flex-1 overflow-hidden flex items-center">
          <div className="font-medium text-sm truncate">{data.label}</div>
        </div>
      </div>
      
      {/* Node type indicator (bottom right) */}
      <div className="absolute bottom-2 right-2.5 rounded bg-indigo-100 dark:bg-indigo-950/50 px-1.5 py-0.5 text-xs text-indigo-600 dark:text-indigo-300">
        Trigger
      </div>
      
      {/* Hidden handle that ReactFlow uses for connections */}
      <Handle
        id={`${id}-out`}
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0 }}
      />
      
      {/* Output connection point with add button - positioned outside the node */}
      <div className="absolute -bottom-8 left-0 right-0 flex justify-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleAddNode}
                className="p-0 h-6 w-6 rounded-full bg-background border border-indigo-200 shadow-sm"
              >
                <PlusCircle className="h-5 w-5 text-indigo-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Add node</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

export default TriggerNode;
