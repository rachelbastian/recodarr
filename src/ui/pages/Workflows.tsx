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
import { Plus, Edit, Trash2, ArrowLeft, Play, MoreHorizontal, Clock } from 'lucide-react';
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    SortingState,
    getSortedRowModel,
} from '@tanstack/react-table';

type Workflow = {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
};

// Define type for execution logs based on backend handler
type ExecutionLog = {
  id: string; // Execution ID (UUID)
  workflow_id: string;
  workflow_name: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error_message: string | null;
  trigger_node_id: string;
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
      // Dispatch an event that WorkflowCanvas can listen to
      window.dispatchEvent(new CustomEvent('nodeDataChanged', {
        detail: { nodeId, data }
      }));
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
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Workflow Editor</h1>
          <p className="text-muted-foreground">Create automated encoding workflows</p>
        </div>
        <RealTimeClock />
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

// Helper function to calculate duration
const calculateDuration = (start: string, end: string | null): string => {
  if (!end) return '-';
  const startDate = new Date(start + 'Z'); // Assume UTC if no timezone
  const endDate = new Date(end + 'Z');
  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs < 0) return '-';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  if (seconds > 0) return `${seconds}s`;
  return `${diffMs}ms`; // Show milliseconds for very short durations
};

// Define columns for the Execution Logs table
const executionLogColumns: ColumnDef<ExecutionLog>[] = [
  {
    accessorKey: 'status',
    header: 'Status',
    cell: info => {
      const status = info.getValue<string>();
      let variant: "default" | "secondary" | "destructive" | "outline" = 'secondary';
      if (status === 'completed') variant = 'default';
      if (status === 'failed' || status === 'error') variant = 'destructive';
      if (status === 'running') variant = 'outline';

      return <Badge variant={variant} className="capitalize">{status}</Badge>;
    },
    size: 100,
  },
  {
    accessorKey: 'workflow_name',
    header: 'Workflow Name',
    cell: info => <span className="font-medium">{info.getValue<string>()}</span>,
    size: 250,
  },
  {
    accessorKey: 'started_at',
    header: 'Started At',
    cell: info => {
      const userTimeZone = 'America/Chicago'; // Consider making this configurable
      return formatInTimeZone(new Date(info.getValue<string>() + 'Z'), userTimeZone, 'MMM d, hh:mm:ss a');
    },
    size: 180,
  },
  {
    id: 'duration',
    header: 'Duration',
    accessorFn: row => calculateDuration(row.started_at, row.completed_at),
    cell: info => info.getValue(),
    size: 100,
  },
  {
    accessorKey: 'error_message',
    header: 'Result / Error',
    cell: info => {
        const error = info.getValue<string | null>();
        return error ? (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="text-red-600 truncate block cursor-help" title={error}>
                            {error}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md break-words">
                        <p>{error}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ) : (
            <span className="text-green-600">Completed</span>
        );
    },
    size: 300, // Allow more space for errors
  },
  {
    accessorKey: 'id',
    header: 'Execution ID',
    cell: info => <span className="text-xs text-muted-foreground font-mono" title={info.getValue<string>()}>{info.getValue<string>().substring(0, 8)}...</span>,
    size: 120,
  },
];

// Real-time clock component
const RealTimeClock: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const userTimeZone = 'America/Chicago'; // CST/CDT - make this configurable if needed

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md border">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-sm font-mono font-medium">
                {formatInTimeZone(currentTime, userTimeZone, 'h:mm:ss a')}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatInTimeZone(currentTime, userTimeZone, 'MMM d, yyyy')}
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p><strong>Local Time ({userTimeZone}):</strong></p>
            <p>{formatInTimeZone(currentTime, userTimeZone, 'PPP p zzz')}</p>
            <br />
            <p><strong>24-Hour Format:</strong></p>
            <p>{formatInTimeZone(currentTime, userTimeZone, 'HH:mm:ss')}</p>
            <br />
            <p><strong>UTC Time:</strong></p>
            <p>{formatInTimeZone(currentTime, 'UTC', 'PPP p zzz')}</p>
            <br />
            <p><strong>System Time:</strong></p>
            <p>{currentTime.toLocaleString()}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renamingWorkflow, setRenamingWorkflow] = useState<Workflow | null>(null);
  const [renameInputName, setRenameInputName] = useState('');
  const [renameInputDescription, setRenameInputDescription] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("workflows");
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState<boolean>(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logSorting, setLogSorting] = useState<SortingState>([
    { id: 'started_at', desc: true } // Default sort by start time descending
  ]);

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

  // Effect to listen for toast notifications from the main process
  useEffect(() => {
    const unsubscribe = window.electron.subscribeToLogs((logEntry: any) => {
      // This is an example if you had a generic log subscription
      // For specific toast, we need a dedicated listener or a type check on logEntry
    });

    // Dedicated listener for toast notifications
    const handleShowToast = ({ title, type, message }: { title: string; type: 'info' | 'success' | 'warning' | 'error'; message: string }) => {
      console.log(`[Workflows.tsx] Received toast: ${type} - ${title}: ${message}`);
      switch (type) {
        case 'success':
          toast.success(message, { description: title });
          break;
        case 'error':
          toast.error(message, { description: title });
          break;
        case 'warning':
          toast.warning(message, { description: title });
          break;
        case 'info':
        default:
          toast.info(message, { description: title });
          break;
      }
    };

    // Assuming you have a generic way to subscribe to IPC events or a specific one for this toast
    // For now, let's assume a generic `on` method on window.electron or a specific new method needs to be added to preload
    // If window.electron.on is not available, this needs to be setup in preload.cts
    // Example using a hypothetical window.electron.on method:
    // const unsubscribeToast = window.electron.on('show-toast-notification', handleShowToast);

    // If you create a specific subscription method in preload.cts like subscribeToToastNotifications:
    const unsubscribeToast = window.electron.onShowToastNotification(handleShowToast);


    return () => {
      unsubscribe(); // Cleanup generic log subscription if it was used
      // if (unsubscribeToast) unsubscribeToast(); // Cleanup specific toast subscription
      unsubscribeToast(); // Cleanup specific toast subscription
    };
  }, []);

  // Fetch execution logs when the logs tab is active
  useEffect(() => {
    const fetchLogs = async () => {
      if (activeTab === 'logs') {
        setIsLogsLoading(true);
        setLogsError(null);
        try {
          const logs = await window.electron.getWorkflowExecutions(100); // Fetch last 100 executions
          setExecutionLogs(logs);
        } catch (error) {
          console.error("Error fetching execution logs:", error);
          setLogsError(error instanceof Error ? error.message : "Failed to load execution logs.");
          setExecutionLogs([]); // Clear logs on error
        }
        setIsLogsLoading(false);
      }
    };

    fetchLogs();
  }, [activeTab]); // Re-run when activeTab changes

  // Instantiate the table for Execution Logs
  const logsTable = useReactTable({
    data: executionLogs,
    columns: executionLogColumns,
    state: {
      sorting: logSorting,
    },
    onSortingChange: setLogSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: false, // Frontend sorting is fine for moderate log counts
  });

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
      
      // Reload workflow tasks in the scheduler
      try {
        await window.electron.reloadWorkflowTasks();
        console.log('Workflow tasks reloaded after creating new workflow');
      } catch (error) {
        console.error('Failed to reload workflow tasks after creating new workflow:', error);
      }
      
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
      
      // Reload workflow tasks in the scheduler
      try {
        await window.electron.reloadWorkflowTasks();
        console.log('Workflow tasks reloaded after renaming workflow');
      } catch (error) {
        console.error('Failed to reload workflow tasks after renaming workflow:', error);
      }
      
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

  const handleRun = useCallback(async (id: string) => {
    console.log('Attempting to run workflow:', id);
    try {
      const workflow = await window.electron.getWorkflow(id);
      if (!workflow || !workflow.nodes) {
        toast.error('Could not load workflow details to run.');
        return;
      }

      // Find the manual trigger node instance
      // The template ID is stored in data.id, the instance ID is node.id
      const manualTriggerNode = workflow.nodes.find(
        (node: WorkflowNode) => node.data?.id === 'manual-trigger' && node.type === 'trigger'
      );

      if (manualTriggerNode) {
        console.log('Found manual trigger node:', manualTriggerNode.id);
        // Call the new IPC handler with the workflow ID and the *instance ID* of the manual trigger node
        const result = await window.electron.executeManualWorkflow(id, manualTriggerNode.id);
        if (result.success) {
          toast.success(result.message || `Workflow "${workflow.name}" started (simulated).`);
        } else {
          toast.error(result.message || 'Failed to start manual workflow.');
        }
      } else {
        toast.warning('This workflow does not have a manual trigger or is not configured correctly to be run manually.');
        // TODO: Potentially implement execution for other trigger types if desired in the future
        console.log('No manual trigger node found for this workflow. Current trigger(s):', workflow.nodes.filter((n:WorkflowNode) => n.type === 'trigger'));
      }
    } catch (error) {
      console.error('Error running workflow:', error);
      toast.error(error instanceof Error ? error.message : 'An unknown error occurred while trying to run the workflow.');
    }
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
        {/* <Toaster position="bottom-right" /> */}
      </ReactFlowProvider>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-muted-foreground">Create, manage, and monitor your automation workflows</p>
        </div>
        <div className="flex items-center gap-4">
          <RealTimeClock />
          {/* Debug scheduler button - temporary for debugging */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              try {
                const debugInfo = await window.electron.debugScheduler();
                console.log('[Scheduler Debug Info]', debugInfo);
                toast.info('Scheduler debug info logged to console', {
                  description: `${debugInfo.enabledTasks || 0} enabled tasks, ${debugInfo.activeJobs || 0} active jobs`
                });
              } catch (error) {
                console.error('Error getting scheduler debug info:', error);
                toast.error('Failed to get scheduler debug info');
              }
            }}
          >
            Debug Scheduler
          </Button>
          {activeTab === "workflows" && (
            <Button onClick={handleCreateNew} className="bg-white text-gray-800 hover:bg-gray-100 border border-gray-300">
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-2 border-b">
          <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground md:w-[300px] w-full">
            <TabsTrigger value="workflows" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex-1">
              Manage Workflows
            </TabsTrigger>
            <div className="h-4 w-px bg-slate-400 mx-1"></div>
            <TabsTrigger value="logs" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex-1">
              Execution Logs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="workflows" className="flex-1 overflow-auto mt-0 data-[state=inactive]:hidden">
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
        </TabsContent>

        <TabsContent value="logs" className="flex-1 overflow-auto mt-0 data-[state=inactive]:hidden">
          {isLogsLoading ? (
            <div className="flex items-center justify-center h-full">
              <p>Loading logs...</p>
            </div>
          ) : logsError ? (
            <div className="flex items-center justify-center h-full text-red-600">
              <p>Error: {logsError}</p>
            </div>
          ) : executionLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full border-2 border-dashed border-muted rounded-lg">
              <p className="text-muted-foreground">No execution logs found.</p>
            </div>
          ) : (
            <div className="p-4 h-full">
              <ScrollArea className="h-full w-full rounded-md border">
                <Table>
                  <TableHeader>
                    {logsTable.getHeaderGroups().map(headerGroup => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <TableHead 
                            key={header.id}
                            style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }} // Use size if not default
                            className={`sticky top-0 bg-muted ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''}`}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                            {{
                              asc: ' ▲',
                              desc: ' ▼',
                            }[header.column.getIsSorted() as string] ?? null}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {logsTable.getRowModel().rows.map(row => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map(cell => (
                          <TableCell key={cell.id} style={{ width: cell.column.getSize() !== 150 ? cell.column.getSize() : undefined }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="vertical" />
              </ScrollArea>
            </div>
          )}
        </TabsContent>
      </Tabs>
      
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

      {renamingWorkflow && (
        <Dialog open={showRenameDialog} onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRenamingWorkflow(null);
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
