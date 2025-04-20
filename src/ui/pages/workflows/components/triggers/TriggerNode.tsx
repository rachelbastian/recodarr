import React, { useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Settings, Cpu, Zap, HardDrive, Clock, Play } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NodeData } from '../../types';
import { getTriggerTypeFromLabel } from './TriggerTypes';
import { TriggerConfigPanel } from './TriggerConfigPanel';

export const TriggerNode = ({ data, id, selected }: NodeProps<NodeData>) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  
  // Configuration panel reference
  const configRef = useRef<HTMLDivElement>(null);
  
  // Close if clicked outside (except when clicking on the settings button)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        configRef.current && 
        !configRef.current.contains(event.target as HTMLElement) &&
        !(event.target as HTMLElement).closest('[data-trigger-settings-button]')
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
      data?.triggerConfig ? "border-green-500/30" : "border-zinc-700"
    )}>
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-md bg-primary/10 relative">
          {data.icon}
          {data?.triggerConfig && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-background"></div>
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
              data-trigger-settings-button
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">{data.description}</div>
          
          {/* Show configured details */}
          {data?.triggerConfig && (
            <div className="mt-2 pt-2 border-t border-zinc-800 text-xs text-zinc-400">
              {data.triggerConfig.type === 'system-usage' && (
                <div className="flex items-center gap-1">
                  {data.triggerConfig.resourceType === 'cpu' && <Cpu className="h-3 w-3" />}
                  {data.triggerConfig.resourceType === 'gpu' && <Zap className="h-3 w-3" />}
                  {data.triggerConfig.resourceType === 'memory' && <HardDrive className="h-3 w-3" />}
                  <span>
                    {data.triggerConfig.resourceType.toUpperCase()} {data.triggerConfig.operator} {data.triggerConfig.threshold}% 
                    for {data.triggerConfig.duration}s
                  </span>
                </div>
              )}
              
              {data.triggerConfig.type === 'time' && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {data.triggerConfig.schedule === 'once' ? 'Once at' : 
                      data.triggerConfig.schedule === 'daily' ? 'Daily at' : 'Weekly on'} {data.triggerConfig.time}
                    {data.triggerConfig.days?.length && ` (${data.triggerConfig.days.join(', ')})`}
                  </span>
                </div>
              )}
              
              {data.triggerConfig.type === 'on-demand' && (
                <div className="flex items-center gap-1">
                  <Play className="h-3 w-3" />
                  <span>Manual trigger {data.triggerConfig.requireConfirmation ? 'with confirmation' : ''}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Configuration menu */}
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
          <TriggerConfigPanel nodeId={id} triggerType={data.triggerConfig?.type || getTriggerTypeFromLabel(data.label)} />
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