import React from 'react';
import { ScrollArea } from "src/components/ui/scroll-area";
import { useWorkflows } from '../context/WorkflowsContext';
import { cn } from '@/lib/utils';

export const WorkflowsList: React.FC = () => {
  const { workflows, selectedWorkflow, setSelectedWorkflow, isLoading } = useWorkflows();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zinc-500" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-12rem)] w-full">
      <div className="space-y-1 p-2">
        {workflows.map((workflow) => (
          <button
            key={workflow.id}
            onClick={() => setSelectedWorkflow(workflow)}
            className={cn(
              "flex items-center w-full rounded-lg px-3 py-2 text-sm font-medium",
              "hover:bg-zinc-800/50 transition-colors duration-200",
              selectedWorkflow?.id === workflow.id
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400"
            )}
          >
            <div className="flex flex-col items-start">
              <span className="font-medium">{workflow.name}</span>
              {workflow.description && (
                <span className="text-xs text-zinc-500 line-clamp-1">
                  {workflow.description}
                </span>
              )}
            </div>
          </button>
        ))}
        {workflows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
            <span className="text-sm">No workflows found</span>
            <span className="text-xs">Create a new workflow to get started</span>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}; 