import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import { WorkflowsProvider } from './context/WorkflowsContext';
import { WorkflowsPage } from './components/WorkflowsPage';

const WorkflowsWrapper: React.FC = () => {
  return (
    <ReactFlowProvider>
      <WorkflowsProvider>
        <WorkflowsPage />
      </WorkflowsProvider>
    </ReactFlowProvider>
  );
};

export default WorkflowsWrapper; 