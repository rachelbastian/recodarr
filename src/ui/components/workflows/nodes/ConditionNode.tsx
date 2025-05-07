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
    <div className={`w-[280px] h-[80px] rounded-lg border p-2.5 shadow-sm ${selected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-border'} bg-background flex flex-col justify-between`}>
      <div> {/* Content wrapper for top part */}
        <div className="flex items-start justify-between"> {/* items-start to give more space for description */}
          <div className="flex items-center gap-2 font-medium text-sm">
          {data.icon && <span className="text-amber-500">{data.icon}</span>}
          <span>{data.label}</span>
        </div>
        <div className="rounded bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-300 shrink-0"> {/* shrink-0 */}
          Condition
        </div>
      </div>
      
        {data.description && (
          <div className="mt-0.5 text-xs text-muted-foreground truncate"> {/* Adjusted margin, still truncate */}
            {data.description}
          </div>
        )}
      </div>
      
      {/* True/False branching UI - adjusted for new aspect ratio */}
      <div className="flex justify-around items-center text-xs pt-1"> {/* Use flex around for branches */}
        <div className="flex flex-col items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleAddTrueBranch}
                  className="p-0 h-5 w-5 rounded-full" // Slightly larger button
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
                  className="p-0 h-5 w-5 rounded-full" // Slightly larger button
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
      
      {/* Input handle (top) */}
      <Handle
        id={`${id}-in`}
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 border-2 border-amber-500 bg-background" // Added ! to ensure override
      />
      
      {/* Output handle for TRUE branch (bottom-left) */}
      <Handle
        id={`${id}-true`}
        type="source"
        position={Position.Bottom}
        style={{ left: '25%', opacity: 0 }} // Hidden, React Flow uses it
        className="!w-3 !h-3" // Added ! to ensure override
      />
      
      {/* Output handle for FALSE branch (bottom-right) */}
      <Handle
        id={`${id}-false`}
        type="source"
        position={Position.Bottom}
        style={{ left: '75%', opacity: 0 }} // Hidden, React Flow uses it
        className="!w-3 !h-3" // Added ! to ensure override
      />
    </div>
  );
};

export default ConditionNode;
