import React from 'react';
import { ALL_NODES } from './types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

interface NodePaletteProps {
  onAddTrigger: () => void;
  hasTriggerNode: boolean;
}

// Group nodes by type
const triggerNodes = ALL_NODES.filter(node => node.type === 'trigger');
const actionNodes = ALL_NODES.filter(node => node.type === 'action');
const conditionNodes = ALL_NODES.filter(node => node.type === 'condition');

const NodePalette: React.FC<NodePaletteProps> = ({ onAddTrigger, hasTriggerNode }) => {
  return (
    <div className="h-full flex flex-col border-r border-border bg-card/50">
      <div className="p-4 border-b flex flex-col gap-2">
        <h2 className="font-semibold text-xl">Workflow Editor</h2>
        <p className="text-sm text-muted-foreground">
          Create automation workflows for your media encoding tasks
        </p>
        
        {!hasTriggerNode && (
          <Button 
            onClick={onAddTrigger}
            className="mt-2 bg-indigo-600 hover:bg-indigo-700"
            size="sm"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Trigger
          </Button>
        )}
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4">
          <h3 className="text-sm font-medium mb-2">Node Types Reference</h3>
          
          {/* Triggers */}
          <div className="mb-6">
            <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center">
              <span className="h-2 w-2 rounded-full bg-indigo-500 mr-2"></span>
              Triggers
            </h4>
            <div className="space-y-2 pl-4">
              {triggerNodes.map(node => (
                <div key={node.id} className="text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-indigo-500">{node.icon}</span>
                    <span className="font-medium">{node.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-5">{node.description}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Actions */}
          <div className="mb-6">
            <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center">
              <span className="h-2 w-2 rounded-full bg-emerald-500 mr-2"></span>
              Actions
            </h4>
            <div className="space-y-2 pl-4">
              {actionNodes.map(node => (
                <div key={node.id} className="text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-emerald-500">{node.icon}</span>
                    <span className="font-medium">{node.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-5">{node.description}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Conditions */}
          <div className="mb-6">
            <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center">
              <span className="h-2 w-2 rounded-full bg-amber-500 mr-2"></span>
              Conditions
            </h4>
            <div className="space-y-2 pl-4">
              {conditionNodes.map(node => (
                <div key={node.id} className="text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-amber-500">{node.icon}</span>
                    <span className="font-medium">{node.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-5">{node.description}</p>
                </div>
              ))}
            </div>
          </div>
          
          <div className="mt-8 text-sm text-muted-foreground">
            <h4 className="font-medium mb-2">How to use:</h4>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Add a trigger to start your workflow</li>
              <li>Click the "+" buttons on nodes to add connected nodes</li>
              <li>Configure each node in the properties panel</li>
              <li>Save your workflow when complete</li>
            </ol>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default NodePalette;
