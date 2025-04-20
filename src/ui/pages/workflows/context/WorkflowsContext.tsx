import React, { createContext, useContext, useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

export interface Workflow {
  id: number;
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
}

interface WorkflowFormData {
  name: string;
  description: string;
}

interface WorkflowsContextType {
  workflows: Workflow[];
  selectedWorkflow: Workflow | null;
  setSelectedWorkflow: (workflow: Workflow | null) => void;
  isLoading: boolean;
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
  showWorkflowsList: boolean;
  setShowWorkflowsList: (show: boolean) => void;
  formData: WorkflowFormData;
  setFormData: (data: WorkflowFormData | ((prev: WorkflowFormData) => WorkflowFormData)) => void;
  nodes: Node[];
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  edges: Edge[];
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  deleteWorkflow: (id: number) => Promise<void>;
  createWorkflow: (workflow: Omit<Workflow, 'id'>) => Promise<void>;
  updateWorkflow: (id: number, workflow: Partial<Workflow>) => Promise<void>;
  saveWorkflow: () => Promise<void>;
}

const WorkflowsContext = createContext<WorkflowsContextType | undefined>(undefined);

export const WorkflowsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showWorkflowsList, setShowWorkflowsList] = useState(true);
  const [formData, setFormData] = useState<WorkflowFormData>({ name: '', description: '' });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const deleteWorkflow = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      await window.electron.deleteWorkflow(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      if (selectedWorkflow?.id === id) {
        setSelectedWorkflow(null);
      }
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [selectedWorkflow]);

  const createWorkflow = useCallback(async (workflow: Omit<Workflow, 'id'>) => {
    try {
      setIsLoading(true);
      const savedId = await window.electron.saveWorkflow({
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        edges: workflow.edges
      });
      const newWorkflow: Workflow = {
        ...workflow,
        id: savedId
      };
      setWorkflows((prev) => [...prev, newWorkflow]);
      setSelectedWorkflow(newWorkflow);
    } catch (error) {
      console.error('Failed to create workflow:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateWorkflow = useCallback(async (id: number, workflow: Partial<Workflow>) => {
    try {
      setIsLoading(true);
      // Get the current workflow data
      const currentWorkflow = workflows.find(w => w.id === id);
      if (!currentWorkflow) throw new Error('Workflow not found');

      // Merge current data with updates
      const updatedWorkflow = {
        id,
        name: workflow.name ?? currentWorkflow.name,
        description: workflow.description ?? currentWorkflow.description,
        nodes: workflow.nodes ?? currentWorkflow.nodes,
        edges: workflow.edges ?? currentWorkflow.edges
      };

      await window.electron.saveWorkflow(updatedWorkflow);
      
      setWorkflows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...workflow } : w))
      );
      if (selectedWorkflow?.id === id) {
        setSelectedWorkflow(prev => prev ? { ...prev, ...workflow } : null);
      }
    } catch (error) {
      console.error('Failed to update workflow:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [selectedWorkflow, workflows]);

  const saveWorkflow = useCallback(async () => {
    if (selectedWorkflow) {
      // Update existing workflow
      await updateWorkflow(selectedWorkflow.id, {
        name: formData.name,
        description: formData.description,
        nodes,
        edges
      });
    } else {
      // Create new workflow
      await createWorkflow({
        name: formData.name,
        description: formData.description,
        nodes,
        edges
      });
    }
  }, [selectedWorkflow, formData, nodes, edges, updateWorkflow, createWorkflow]);

  const value = {
    workflows,
    selectedWorkflow,
    setSelectedWorkflow,
    isLoading,
    isEditing,
    setIsEditing,
    showWorkflowsList,
    setShowWorkflowsList,
    formData,
    setFormData,
    nodes,
    setNodes,
    edges,
    setEdges,
    deleteWorkflow,
    createWorkflow,
    updateWorkflow,
    saveWorkflow,
  };

  return (
    <WorkflowsContext.Provider value={value}>
      {children}
    </WorkflowsContext.Provider>
  );
};

export const useWorkflows = () => {
  const context = useContext(WorkflowsContext);
  if (context === undefined) {
    throw new Error('useWorkflows must be used within a WorkflowsProvider');
  }
  return context;
}; 