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
    <div className={`w-[280px] h-[80px] rounded-lg border p-2.5 shadow-sm ${selected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-border'} bg-background flex flex-col justify-between relative`}>
      <div className="flex items-start gap-3">
        {/* CSS icon instead of emoji */}
        <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-amber-100 dark:bg-amber-950/50">
          <div className="w-4 h-4 border-2 border-amber-500 rotate-45"></div>
        </div>
        
        {/* Divider */}
        <div className="w-px self-stretch bg-border"></div>
        
        {/* Title only - description removed */}
        <div className="flex-1 overflow-hidden flex items-center">
          <div className="font-medium text-sm truncate">{data.label}</div>
        </div>
      </div>
      
      {/* Node type indicator (bottom right) */}
      <div className="absolute bottom-2 right-2.5 rounded bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-300">
        Condition
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
      <div className="absolute -bottom-8 left-0 right-0 flex justify-around items-center text-xs">
        <div className="flex flex-col items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleAddTrueBranch}
                  className="p-0 h-5 w-5 rounded-full bg-background border border-green-200 shadow-sm"
                >
                  <PlusCircle className="h-4 w-4 text-green-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add true branch</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center mt-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1"></div>
            <span className="font-medium">True</span>
          </div>
        </div>
        
        <div className="flex flex-col items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleAddFalseBranch}
                  className="p-0 h-5 w-5 rounded-full bg-background border border-red-200 shadow-sm"
                >
                  <PlusCircle className="h-4 w-4 text-red-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add false branch</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center mt-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 mr-1"></div>
            <span className="font-medium">False</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConditionNode;
