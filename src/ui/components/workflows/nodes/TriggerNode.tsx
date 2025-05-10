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
    <div className={`w-[280px] h-[56px] rounded-lg border p-2.5 shadow-sm ${selected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-border'} bg-background flex flex-col justify-center relative`}>
      <div className="flex items-center gap-3">
        {/* CSS icon instead of emoji */}
        <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-indigo-100 dark:bg-indigo-950/50">
          <div className="w-4 h-4 flex items-center justify-center">
            {data.id === 'manual-trigger' ? (
              <div className="w-full h-full relative flex items-center justify-center">
                {/* Vertical bar */}
                <div className="absolute w-0.5 h-3/4 bg-indigo-500 rounded-full"></div>
                {/* Horizontal bar */}
                <div className="absolute w-3/4 h-0.5 bg-indigo-500 rounded-full"></div>
              </div>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
                <circle cx="12" cy="12" r="6" className="fill-indigo-500"/>
                <circle cx="12" cy="12" r="10" className="stroke-indigo-500" strokeWidth="2" strokeDasharray="4 2" fill="none"/>
              </svg>
            )}
          </div>
        </div>
        
        {/* Divider */}
        <div className="w-px h-full bg-border"></div>
        
        {/* Title and Node Type */}
        <div className="flex-1 overflow-hidden flex items-center justify-between">
          <div className="font-medium text-sm truncate">{data.label}</div>
          <div className="ml-2 rounded bg-indigo-100 dark:bg-indigo-950/50 px-1.5 py-0.5 text-xs text-indigo-600 dark:text-indigo-300">
            Trigger
          </div>
        </div>
      </div>
      
      {/* Hidden handle that ReactFlow uses for connections */}
      <Handle
        id={`${id}-out`}
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0 }}
      />
      
      {/* Output connection point with add icon - positioned outside the node */}
      <div className="absolute bottom-0 translate-y-1/2 left-0 right-0 flex justify-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PlusCircle 
                className="h-6 w-6 text-indigo-500 cursor-pointer p-0.5 rounded-full bg-background hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                onClick={handleAddNode} 
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">Add node</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

export default TriggerNode;
