import React, { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useWorkflows } from '../../context/WorkflowsContext';

export const CreateWorkflowDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { 
    formData, 
    setFormData, 
    isLoading,
    setShowWorkflowsList,
    setIsEditing,
    setNodes,
    setEdges,
    emptyNodes,
    emptyEdges,
  } = useWorkflows();

  const handleCreateWorkflow = () => {
    // Clear existing nodes and create a clean canvas
    setNodes(emptyNodes);
    setEdges(emptyEdges);
    setShowWorkflowsList(false);
    setIsEditing(true);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white">
          <Plus className="w-4 h-4 mr-2" />
          New Workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="dark bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Create New Workflow</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Give your workflow a name and description to get started.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-zinc-100">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="My Workflow"
              className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description" className="text-zinc-100">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="What does this workflow do?"
              className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setIsOpen(false)} 
            className="bg-transparent border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreateWorkflow} 
            disabled={!formData.name.trim() || isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all disabled:bg-indigo-600/50 text-white"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 