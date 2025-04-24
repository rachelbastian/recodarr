import React, { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "src/components/ui/dialog";
import { useWorkflows } from '../../context/WorkflowsContext';

export const DeleteWorkflowDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedWorkflow, isLoading, deleteWorkflow } = useWorkflows();

  const handleDelete = async () => {
    if (!selectedWorkflow?.id) return;
    await deleteWorkflow(selectedWorkflow.id);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <Trash2 size={16} />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="dark bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Delete Workflow</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Are you sure you want to delete "{selectedWorkflow?.name}"?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline"
            onClick={() => setIsOpen(false)} 
            className="bg-transparent border-zinc-800 text-zinc-100 hover:bg-zinc-800"
          >
            Cancel
          </Button>
          <Button 
            variant="destructive"
            onClick={handleDelete}
            className="gap-2"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={16} />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 