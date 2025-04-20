import React from 'react';
import { Plus, Edit, X, Save, Trash2, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useWorkflows } from '../context/WorkflowsContext';
import { CreateWorkflowDialog } from './dialogs/CreateWorkflowDialog';
import { DeleteWorkflowDialog } from './dialogs/DeleteWorkflowDialog';

export const WorkflowHeader: React.FC = () => {
  const {
    showWorkflowsList,
    selectedWorkflow,
    isLoading,
    isEditing,
    setShowWorkflowsList,
    setIsEditing,
    saveWorkflow,
  } = useWorkflows();

  const handleBackToList = () => {
    if (isEditing) {
      if (window.confirm('Discard unsaved changes?')) {
        setShowWorkflowsList(true);
        setIsEditing(false);
      }
    } else {
      setShowWorkflowsList(true);
      setIsEditing(false);
    }
  };

  return (
    <div className="p-4 border-b">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
          {!showWorkflowsList && (
            <Button
              variant="ghost"
              onClick={handleBackToList}
              className="text-zinc-400 hover:text-zinc-100"
            >
              Back to list
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {showWorkflowsList ? (
            <CreateWorkflowDialog />
          ) : (
            <>
              {!isEditing ? (
                <Button 
                  className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Enable Editing
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline"
                    className="gap-2"
                    onClick={() => setIsEditing(false)}
                  >
                    <X size={16} />
                    Cancel Editing
                  </Button>

                  <Button 
                    className="bg-indigo-600 hover:bg-indigo-500 gap-2 text-white"
                    onClick={saveWorkflow}
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
                    Save
                  </Button>
                </>
              )}
              
              {selectedWorkflow && <DeleteWorkflowDialog />}
            </>
          )}
        </div>
      </div>
      
      {/* If we're in the workflow editor, show workflow metadata here */}
      {!showWorkflowsList && selectedWorkflow && (
        <div className="mt-2 flex items-center text-sm text-muted-foreground">
          <span className="font-medium mr-2">{selectedWorkflow.name}</span>
          {selectedWorkflow.description && (
            <>
              <span className="mx-1">•</span>
              <span>{selectedWorkflow.description}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}; 