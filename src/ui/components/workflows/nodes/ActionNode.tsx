import React, { useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../types';
import { PlusCircle } from 'lucide-react';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';

// Action nodes have both input and output handles
const ActionNode: React.FC<NodeProps<NodeData>> = ({ id, data, selected }) => {
  const handleAddNode = useCallback(() => {
    // Using a custom event to communicate with parent component
    const event = new CustomEvent('openNodeDialog', {
      detail: { nodeId: id, handleId: `${id}-out` }
    });
    window.dispatchEvent(event);
  }, [id]);

  return (
    <div className={`w-[280px] h-[56px] rounded-lg border p-2.5 shadow-sm ${selected ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-border'} bg-background flex flex-col justify-center relative`}>
      <div className="flex items-center gap-3">
        {/* CSS icon instead of emoji */}
        <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-indigo-100 dark:bg-indigo-950/50">
          <div className="w-4 h-4 flex items-center justify-center">
            <div className="w-3 h-3 border-t-2 border-r-2 border-indigo-500 transform rotate-45"></div>
          </div>
        </div>
        
        {/* Divider */}
        <div className="w-px h-full bg-border"></div>
        
        {/* Title and Node Type */}
        <div className="flex-1 overflow-hidden flex items-center justify-between">
          <div className="font-medium text-sm truncate">{data.label}</div>
          <div className="ml-2 rounded bg-indigo-100 dark:bg-indigo-950/50 px-1.5 py-0.5 text-xs text-indigo-600 dark:text-indigo-300">
            Action
          </div>
        </div>
      </div>
      
      {/* Input handle (top) */}
      <Handle
        id={`${id}-in`}
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 border-2 border-indigo-500 bg-background"
      />
      
      {/* Output handle (bottom) - hidden but used for connections */}
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
                className="h-6 w-6 text-emerald-500 cursor-pointer p-0.5 rounded-full bg-background hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
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

export default ActionNode;
