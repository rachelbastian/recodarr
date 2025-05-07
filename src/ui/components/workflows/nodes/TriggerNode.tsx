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
    <div className={`w-[280px] h-[80px] rounded-lg border p-2.5 shadow-sm ${selected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-border'} bg-background flex flex-col justify-between`}>
      <div> {/* Content wrapper for top part */}
        <div className="flex items-start justify-between"> {/* items-start to give more space for description */}
          <div className="flex items-center gap-2 font-medium text-sm">
          {data.icon && <span className="text-indigo-500">{data.icon}</span>}
          <span>{data.label}</span>
        </div>
        <div className="rounded bg-indigo-100 dark:bg-indigo-950/50 px-1.5 py-0.5 text-xs text-indigo-600 dark:text-indigo-300 shrink-0"> {/* shrink-0 */}
          Trigger
        </div>
      </div>
      
        {data.description && (
          <div className="mt-0.5 text-xs text-muted-foreground truncate"> {/* Adjusted margin, still truncate */}
            {data.description}
          </div>
        )}
      </div>
      
      {/* Output connection point with add button - pushed to bottom */}
      <div className="flex justify-center pt-1"> {/* Added padding-top */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleAddNode}
                className="p-0 h-6 w-6 rounded-full"
              >
                <PlusCircle className="h-5 w-5 text-indigo-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Add node</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Hidden handle that ReactFlow uses for connections */}
      <Handle
        id={`${id}-out`}
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0 }}
      />
    </div>
  );
};

export default TriggerNode;
