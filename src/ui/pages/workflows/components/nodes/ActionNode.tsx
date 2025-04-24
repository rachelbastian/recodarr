import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Settings } from 'lucide-react';
import { Button } from "src/components/ui/button";
import { cn } from "@/lib/utils";

interface NodeData {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  iconName?: string;
  actionConfig?: {
    type: string;
    [key: string]: any;
  };
}

export const ActionNode: React.FC<NodeProps<NodeData>> = ({ data, id, selected }) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const configRef = useRef<HTMLDivElement>(null);
  
  // Close if clicked outside (except when clicking on the settings button)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        configRef.current && 
        !configRef.current.contains(event.target as HTMLElement) &&
        !(event.target as HTMLElement).closest('[data-action-settings-button]')
      ) {
        setIsConfigOpen(false);
      }
    };

    if (isConfigOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isConfigOpen]);

  return (
    <div className={cn(
      "px-4 py-2 shadow-lg rounded-lg border bg-card min-w-[240px] relative",
      selected && "ring-2 ring-primary",
      data?.actionConfig ? "border-blue-500/30" : "border-zinc-700"
    )}>
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-md bg-primary/10 relative">
          {data.icon}
          {data?.actionConfig && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-background"></div>
          )}
        </div>
        <div className="flex-grow">
          <div className="font-semibold text-primary flex items-center justify-between">
            <span>{data.label}</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 ml-2 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setIsConfigOpen(!isConfigOpen);
              }}
              data-action-settings-button
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">{data.description}</div>
        </div>
      </div>

      {/* Configuration menu - to be implemented */}
      {isConfigOpen && (
        <div 
          ref={configRef}
          className="absolute z-[9999] mt-2 w-[320px] rounded-lg border bg-card shadow-lg animate-in fade-in-20 slide-in-from-top-5 pointer-events-auto"
          style={{ 
            top: '100%', 
            left: 0,
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'absolute'
          }}
        >
          <div className="p-4">
            <h3 className="font-semibold text-sm">Action Configuration</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Configuration panel for this action will be implemented soon.
            </p>
          </div>
          <div className="flex justify-end p-2 border-t">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => setIsConfigOpen(false)}
              className="text-xs"
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-blue-500"
        style={{ left: -6 }}
      />

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-blue-500"
        style={{ right: -6 }}
      />
    </div>
  );
}; 