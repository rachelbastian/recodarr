import React, { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowCanvas from '@/ui/components/workflows/WorkflowCanvas';
import PropertiesPanel from '@/ui/components/workflows/PropertiesPanel';
import { WorkflowNode, NodeData } from '@/ui/components/workflows/types';
import { 
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, ArrowLeft, Play, MoreHorizontal } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInTimeZone } from 'date-fns-tz';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

type Workflow = {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
};

const WorkflowEditor: React.FC<{
  workflowId: string;
  onBack: () => void;
}> = ({ workflowId, onBack }) => {
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [showProperties, setShowProperties] = useState(true);
  const [showTriggerDialog, setShowTriggerDialog] = useState(false);

  // Update selected node's data
  const handleNodeChange = (nodeId: string, data: NodeData) => {
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode({
        ...selectedNode,
        data,
      });
    }
  };

  // Handle closing properties panel
  const handleClosePanel = () => {
    setShowProperties(false);
  };

  // Handle node selection - also ensures properties panel is open
  const handleNodeSelect = (node: WorkflowNode | null) => {
    setSelectedNode(node);
    if (node && !showProperties) {
      setShowProperties(true);
    }
  };

  // Handler for custom events from node buttons (for adding nodes)
  useEffect(() => {
    const handleOpenNodeDialog = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { nodeId, handleId } = customEvent.detail;
      
      // Dispatch event to the WorkflowCanvas component
      window.dispatchEvent(new CustomEvent('openNodeDialogFromWorkflow', {
        detail: { nodeId, handleId }
      }));
    };

    // Listen for events from the nodes
    window.addEventListener('openNodeDialog', handleOpenNodeDialog);
    
    return () => {
      window.removeEventListener('openNodeDialog', handleOpenNodeDialog);
    };
  }, []);

  // Forward the trigger dialog state to the WorkflowCanvas
  useEffect(() => {
    if (showTriggerDialog) {
      window.dispatchEvent(new CustomEvent('openTriggerDialog'));
      setShowTriggerDialog(false);
    }
  }, [showTriggerDialog]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center">
        <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Workflow Editor</h1>
          <p className="text-muted-foreground">Create automated encoding workflows</p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Canvas */}
            <ResizablePanel defaultSize={showProperties ? 80 : 100} minSize={showProperties ? 70 : 100}>
              <WorkflowCanvas
                onNodeSelect={handleNodeSelect}
                selectedNode={selectedNode}
                workflowId={workflowId}
              />
            </ResizablePanel>
            
            {/* Properties panel - conditionally rendered */}
            {showProperties && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
                  <PropertiesPanel 
                    selectedNode={selectedNode}
                    onNodeChange={handleNodeChange}
                    onClosePanel={handleClosePanel}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </ReactFlowProvider>
      </div>
    </div>
  );
};

const WorkflowsList: React.FC<{
  workflows: Workflow[];
  isLoading: boolean;
  onCreateNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
  onRename: (workflow: Workflow) => void;
}> = ({ workflows, isLoading, onCreateNew, onEdit, onDelete, onRun, onRename }) => {
  const userTimeZone = 'America/Chicago'; // CST/CDT

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-2/3 mb-2" />
              <Skeleton className="h-4 w-5/6" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
            <CardFooter className="flex justify-between">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] p-4">
        <div className="mb-4 text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-2"
          >
            <path d="M16 16h.01"></path>
            <path d="M8 16h.01"></path>
            <path d="M18 9c0-1-1-2-3-2h-1a3 3 0 1 0-6 0H7C5 7 4 8 4 9c0 5 2 8 8 8s8-3 8-8Z"></path>
          </svg>
          <h3 className="text-lg font-medium text-center">No workflows yet</h3>
          <p className="text-center max-w-md mt-2">
            Create your first workflow to automate encoding processes and media management tasks.
          </p>
        </div>
        <Button onClick={onCreateNew} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="mr-2 h-4 w-4" />
          Create Workflow
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {workflows.map((workflow) => (
        <Card key={workflow.id} className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <CardTitle className="text-lg">{workflow.name}</CardTitle>
              <div className={`h-2 w-2 rounded-full ${workflow.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            </div>
            <CardDescription>
              {workflow.description || 'No description'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground space-y-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p>Created: {formatInTimeZone(new Date(workflow.created_at + 'Z'), userTimeZone, 'MMM d, yyyy, h:mm a')}</p>
                  </TooltipTrigger>
                  <TooltipContent>
                    {formatInTimeZone(new Date(workflow.created_at + 'Z'), userTimeZone, 'PPP p zzz')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p>Last updated: {formatInTimeZone(new Date(workflow.updated_at + 'Z'), userTimeZone, 'MMM d, yyyy, h:mm a')}</p>
                  </TooltipTrigger>
                  <TooltipContent>
                    {formatInTimeZone(new Date(workflow.updated_at + 'Z'), userTimeZone, 'PPP p zzz')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={() => onEdit(workflow.id)} className="flex-grow sm:flex-grow-0">
              <Edit className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
            <div className="flex gap-2 items-center">
              <Button variant="outline" size="sm" onClick={() => onRun(workflow.id)}>
                <Play className="mr-1 h-3.5 w-3.5" />
                Run
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onRename(workflow)} className="hover:!bg-indigo-50 dark:hover:!bg-indigo-950/50">
                    <Edit className="mr-2 h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()} 
                        className="hover:bg-red-500/5 hover:ring-1 hover:ring-red-600 focus:bg-red-500/5 focus:ring-1 focus:ring-red-600 data-[highlighted]:bg-red-500/5 data-[highlighted]:ring-1 data-[highlighted]:ring-red-600 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10 dark:data-[highlighted]:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the workflow "{workflow.name}". This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          className="bg-red-600 text-white hover:bg-red-700 focus:bg-red-700 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-red-500 dark:focus:ring-offset-red-700"
                          onClick={() => onDelete(workflow.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

const Workflows: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // State for Rename Dialog
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renamingWorkflow, setRenamingWorkflow] = useState<Workflow | null>(null);
  const [renameInputName, setRenameInputName] = useState('');
  const [renameInputDescription, setRenameInputDescription] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Load workflows from the database
  const loadWorkflows = useCallback(async () => {
    try {
      setIsLoading(true);
      const results = await window.electron.getWorkflows();
      setWorkflows(results);
    } catch (error) {
      console.error('Error loading workflows:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const handleCreateNew = useCallback(() => {
    setNewWorkflowName('');
    setNewWorkflowDescription('');
    setShowCreateDialog(true);
  }, []);

  const handleCreateWorkflow = useCallback(async () => {
    if (!newWorkflowName.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    try {
      setIsSaving(true);
      const newId = uuidv4();
      
      // Create a basic workflow with just a name and description
      const newWorkflow = {
        id: newId,
        name: newWorkflowName.trim(),
        description: newWorkflowDescription.trim() || null,
        nodes: [],
        edges: []
      };
      
      // Save to database
      await window.electron.saveWorkflow(newWorkflow);
      
      // Open the workflow editor
      setActiveWorkflowId(newId);
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Error creating workflow:', error);
      toast.error('Failed to create workflow');
    } finally {
      setIsSaving(false);
    }
  }, [newWorkflowName, newWorkflowDescription]);

  const handleEdit = useCallback((id: string) => {
    setActiveWorkflowId(id);
  }, []);

  const handleOpenRenameDialog = useCallback((workflow: Workflow) => {
    setRenamingWorkflow(workflow);
    setRenameInputName(workflow.name);
    setRenameInputDescription(workflow.description || '');
    setShowRenameDialog(true);
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!renamingWorkflow || !renameInputName.trim()) {
      toast.error('Workflow name cannot be empty.');
      return;
    }

    setIsRenaming(true);
    try {
      // Fetch the full workflow data (nodes and edges) as saveWorkflow expects it
      const fullWorkflow = await window.electron.getWorkflow(renamingWorkflow.id);
      if (!fullWorkflow) {
        toast.error('Could not fetch workflow details to save.');
        setIsRenaming(false);
        return;
      }

      const updatedWorkflowData = {
        ...fullWorkflow, // This includes existing id, nodes, edges
        name: renameInputName.trim(),
        description: renameInputDescription.trim() || null,
      };

      await window.electron.saveWorkflow(updatedWorkflowData);
      toast.success(`Workflow "${updatedWorkflowData.name}" updated successfully.`);
      setShowRenameDialog(false);
      setRenamingWorkflow(null);
      loadWorkflows(); // Refresh the list
    } catch (error) {
      console.error('Error renaming workflow:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to rename workflow.');
    } finally {
      setIsRenaming(false);
    }
  }, [renamingWorkflow, renameInputName, renameInputDescription, loadWorkflows]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await window.electron.deleteWorkflow(id);
      // Refresh the list after deletion
      loadWorkflows();
    } catch (error) {
      console.error('Error deleting workflow:', error);
    }
  }, [loadWorkflows]);

  const handleRun = useCallback((id: string) => {
    // This would trigger the workflow execution
    console.log('Run workflow:', id);
    // TODO: Implement workflow execution
  }, []);

  const handleBack = useCallback(() => {
    setActiveWorkflowId(null);
    // Refresh workflows list when coming back from editor
    loadWorkflows();
  }, [loadWorkflows]);

  if (activeWorkflowId) {
    return (
      <ReactFlowProvider>
        <WorkflowEditor 
          workflowId={activeWorkflowId} 
          onBack={handleBack}
        />
        <Toaster position="bottom-right" />
      </ReactFlowProvider>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-muted-foreground">Create and manage your automation workflows</p>
        </div>
        <Button onClick={handleCreateNew} className="bg-white text-gray-800 hover:bg-gray-100 border border-gray-300">
          <Plus className="mr-2 h-4 w-4" />
          Create Workflow
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <ScrollArea className="h-full w-full">
          <WorkflowsList
            workflows={workflows}
            isLoading={isLoading}
            onCreateNew={handleCreateNew}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onRun={handleRun}
            onRename={handleOpenRenameDialog}
          />
        </ScrollArea>
      </div>
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Workflow</DialogTitle>
            <DialogDescription>
              Give your workflow a name and optional description to get started.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="workflow-name">Workflow Name</Label>
              <Input 
                id="workflow-name" 
                value={newWorkflowName} 
                onChange={(e) => setNewWorkflowName(e.target.value)} 
                placeholder="My Encoding Workflow"
                className="mt-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newWorkflowName.trim() && !isSaving) {
                    handleCreateWorkflow();
                  }
                }}
              />
            </div>
            
            <div>
              <Label htmlFor="workflow-description">Description (optional)</Label>
              <Textarea
                id="workflow-description"
                value={newWorkflowDescription}
                onChange={(e) => setNewWorkflowDescription(e.target.value)}
                placeholder="Describe what this workflow will do"
                className="mt-2 resize-none"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateWorkflow} 
              className="bg-white text-gray-800 hover:bg-gray-100 border border-gray-300"
              disabled={isSaving || !newWorkflowName.trim()}
            >
              {isSaving ? 'Creating...' : 'Create Workflow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Workflow Dialog */}
      {renamingWorkflow && (
        <Dialog open={showRenameDialog} onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRenamingWorkflow(null); // Clear selection when dialog is closed
          }
          setShowRenameDialog(isOpen);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Workflow</DialogTitle>
              <DialogDescription>
                Update the name and description for "{renamingWorkflow.name}".
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="rename-workflow-name">Workflow Name</Label>
                <Input 
                  id="rename-workflow-name" 
                  value={renameInputName} 
                  onChange={(e) => setRenameInputName(e.target.value)} 
                  placeholder="My Encoding Workflow"
                  className="mt-2"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="rename-workflow-description">Description (optional)</Label>
                <Textarea
                  id="rename-workflow-description"
                  value={renameInputDescription}
                  onChange={(e) => setRenameInputDescription(e.target.value)}
                  placeholder="Describe what this workflow will do"
                  className="mt-2 resize-none"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRenameDialog(false)}
                disabled={isRenaming}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveRename} 
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={isRenaming || !renameInputName.trim()}
              >
                {isRenaming ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      <Toaster position="bottom-right" />
    </div>
  );
};

export default Workflows;
