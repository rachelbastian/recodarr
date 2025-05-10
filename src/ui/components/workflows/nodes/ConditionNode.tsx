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

// Condition nodes have one input and two outputs (true/false)
const ConditionNode: React.FC<NodeProps<NodeData>> = ({ id, data, selected }) => {
  const handleAddTrueBranch = useCallback(() => {
    // Using a custom event to communicate with parent component for TRUE branch
    const event = new CustomEvent('openNodeDialog', {
      detail: { nodeId: id, handleId: `${id}-true` }
    });
    window.dispatchEvent(event);
  }, [id]);

  const handleAddFalseBranch = useCallback(() => {
    // Using a custom event to communicate with parent component for FALSE branch
    const event = new CustomEvent('openNodeDialog', {
      detail: { nodeId: id, handleId: `${id}-false` }
    });
    window.dispatchEvent(event);
  }, [id]);

  return (
    <div className={`w-[280px] h-[56px] rounded-lg border p-2.5 shadow-sm ${selected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-border'} bg-background flex flex-col justify-center relative`}>
      <div className="flex items-center gap-3">
        {/* CSS icon */}
        <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-indigo-100 dark:bg-indigo-950/50">
          <div className="w-4 h-4 border-2 border-indigo-500 rotate-45"></div>
        </div>
        
        {/* Divider */}
        <div className="w-px h-full bg-border"></div>
        
        {/* Title and Node Type */}
        <div className="flex-1 overflow-hidden flex items-center justify-between">
          <div className="font-medium text-sm truncate">{data.label}</div>
          <div className="ml-2 rounded bg-indigo-100 dark:bg-indigo-950/50 px-1.5 py-0.5 text-xs text-indigo-600 dark:text-indigo-300">
            Condition
          </div>
        </div>
      </div>
      
      {/* Input handle (top) */}
      <Handle
        id={`${id}-in`}
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 border-2 border-amber-500 bg-background"
      />
      
      {/* Output handle for TRUE branch (bottom-left) */}
      <Handle
        id={`${id}-true`}
        type="source"
        position={Position.Bottom}
        style={{ left: '25%', opacity: 0 }}
        className="!w-3 !h-3"
      />
      
      {/* Output handle for FALSE branch (bottom-right) */}
      <Handle
        id={`${id}-false`}
        type="source"
        position={Position.Bottom}
        style={{ left: '75%', opacity: 0 }}
        className="!w-3 !h-3"
      />
      
      {/* True/False branching UI - positioned outside the node */}
      <div className="absolute bottom-0 translate-y-1/2 left-0 right-0 flex justify-around items-center text-xs">
        <div className="flex flex-col items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <PlusCircle 
                  className="h-5 w-5 text-green-500 cursor-pointer p-0.5 rounded-full bg-background hover:bg-green-100 dark:hover:bg-green-900/50 flex items-center justify-center"
                  onClick={handleAddTrueBranch}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">Add true branch</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        <div className="flex flex-col items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <PlusCircle 
                  className="h-5 w-5 text-red-500 cursor-pointer p-0.5 rounded-full bg-background hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center"
                  onClick={handleAddFalseBranch}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">Add false branch</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

export default ConditionNode;
