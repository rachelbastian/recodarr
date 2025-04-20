import React from 'react';
import { useWorkflows } from '../context/WorkflowsContext';
import { WorkflowHeader } from './WorkflowHeader';
import { WorkflowsList } from './WorkflowsList';
import { WorkflowCanvas } from './WorkflowCanvas';

export const WorkflowsPage: React.FC = () => {
  const { showWorkflowsList, selectedWorkflow } = useWorkflows();

  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      <WorkflowHeader />
      
      {/* Main content area - either workflow list or editor */}
      <div className="flex-1 overflow-hidden">
        {showWorkflowsList ? <WorkflowsList /> : <WorkflowCanvas />}
      </div>
    </div>
  );
}; 