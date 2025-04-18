import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  Panel,
  NodeTypes,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  NodeMouseHandler,
  NodeProps,
  Position,
  Handle,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from "../../../@/components/ui/button";
import { Input } from "../../../@/components/ui/input";
import { Label } from "../../../@/components/ui/label";
import { Textarea } from "../../../@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../../@/components/ui/select";
import {
  Slider
} from "../../../@/components/ui/slider";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Separator } from "../../../@/components/ui/separator";
import { 
  Plus, 
  Clock, 
  Zap, 
  Library, 
  Activity, 
  Play, 
  Edit, 
  Trash2, 
  MoreVertical, 
  Save, 
  X,
  Loader2,
  Settings,
  ChevronRight,
  Calendar,
  Timer,
  Cpu,
  HardDrive,
  AlertCircle,
} from 'lucide-react';

// Define types here if they can't be imported directly
interface Workflow {
  id: number;
  name: string;
  description: string;
}

interface WorkflowDetails extends Workflow {
  nodes: Node[];
  edges: Edge[];
}

// Define types for trigger configurations
interface BaseTriggerConfig {
  type: string;
  label: string;
  description?: string;
}

interface SystemUsageTriggerConfig extends BaseTriggerConfig {
  type: 'system-usage';
  resourceType: 'cpu' | 'gpu' | 'memory';
  threshold: number;
  operator: 'below' | 'above';
  duration: number; // seconds threshold must be met before triggering
}

interface TimeTriggerConfig extends BaseTriggerConfig {
  type: 'time';
  schedule: 'once' | 'daily' | 'weekly';
  time: string; // HH:MM format
  days?: string[]; // for weekly schedule: ['monday', 'wednesday', etc.]
  date?: string; // for once schedule: ISO date string
}

interface OnDemandTriggerConfig extends BaseTriggerConfig {
  type: 'on-demand';
  requireConfirmation: boolean;
}

type TriggerConfig = SystemUsageTriggerConfig | TimeTriggerConfig | OnDemandTriggerConfig;

// Custom Node Data interface
interface NodeData {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  iconName?: string;
  triggerConfig?: TriggerConfig;
}

// Custom Node Components
const TriggerNode = ({ data, id, selected }: NodeProps<NodeData>) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  
  // Configuration panel reference
  const configRef = useRef<HTMLDivElement>(null);
  
  // Close if clicked outside (except when clicking on the settings button or any dropdown)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if clicked on the config panel itself or any of its children
      if (configRef.current?.contains(event.target as HTMLElement)) {
        return;
      }
      
      // Don't close if clicked on the settings button that opens the panel
      if ((event.target as HTMLElement).closest('[data-trigger-settings-button]')) {
        return;
      }
      
      // Don't close if the click is on a radix UI dropdown or popover (portalled content)
      const target = event.target as HTMLElement;
      if (
        target.closest('[role="dialog"]') || 
        target.closest('[role="listbox"]') || 
        target.closest('[role="menu"]') ||
        target.closest('[data-radix-popper-content-wrapper]')
      ) {
        return;
      }
      
      // If we reached here, it's a valid outside click - close the panel
      setIsConfigOpen(false);
    };

    if (isConfigOpen) {
      // Use a slight delay to avoid immediate closing when opening a dropdown
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isConfigOpen]);

  return (
    <div className={cn(
      "px-4 py-2 shadow-lg rounded-lg border bg-card min-w-[240px] relative",
      selected && "ring-2 ring-primary",
      data?.triggerConfig ? "border-green-500/30" : "border-zinc-700"
    )}>
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-md bg-primary/10 relative">
          {data.icon}
          {data?.triggerConfig && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-background"></div>
          )}
        </div>
        <div className="flex-grow">
          <div className="font-semibold text-primary flex items-center justify-between">
            <span>{data.label}</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 ml-2 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setIsConfigOpen(!isConfigOpen);
              }}
              data-trigger-settings-button
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">{data.description}</div>
          
          {/* Show configured details */}
          {data?.triggerConfig && (
            <div className="mt-2 pt-2 border-t border-zinc-800 text-xs text-zinc-400">
              {data.triggerConfig.type === 'system-usage' && (
                <div className="flex items-center gap-1">
                  {data.triggerConfig.resourceType === 'cpu' && <Cpu className="h-3 w-3" />}
                  {data.triggerConfig.resourceType === 'gpu' && <Zap className="h-3 w-3" />}
                  {data.triggerConfig.resourceType === 'memory' && <HardDrive className="h-3 w-3" />}
                  <span>
                    {data.triggerConfig.resourceType.toUpperCase()} {data.triggerConfig.operator} {data.triggerConfig.threshold}% 
                    for {data.triggerConfig.duration}s
                  </span>
                </div>
              )}
              
              {data.triggerConfig.type === 'time' && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {data.triggerConfig.schedule === 'once' ? 'Once at' : 
                      data.triggerConfig.schedule === 'daily' ? 'Daily at' : 'Weekly on'} {data.triggerConfig.time}
                    {data.triggerConfig.days?.length && ` (${data.triggerConfig.days.join(', ')})`}
                  </span>
                </div>
              )}
              
              {data.triggerConfig.type === 'on-demand' && (
                <div className="flex items-center gap-1">
                  <Play className="h-3 w-3" />
                  <span>Manual trigger {data.triggerConfig.requireConfirmation ? 'with confirmation' : ''}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Configuration menu */}
      {isConfigOpen && (
        <div 
          ref={configRef}
          className="absolute z-[9999] mt-2 w-[320px] rounded-lg border bg-card shadow-lg animate-in fade-in-20 slide-in-from-top-5 pointer-events-auto"
          style={{ 
            top: '100%', 
            left: 0,
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'absolute'
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <TriggerConfigPanel nodeId={id} triggerType={data.triggerConfig?.type || getTriggerTypeFromLabel(data.label)} />
          <div className="flex justify-end p-2 border-t">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={(e) => {
                e.stopPropagation();
                setIsConfigOpen(false);
              }}
              className="text-xs"
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-blue-500"
        style={{ right: -6 }}
      />
    </div>
  );
};

// Enhanced wrapper for Select components to prevent propagation issues
const SafeSelect = ({
  value,
  onValueChange,
  children,
  placeholder
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  placeholder: string;
}) => {
  // Stop all events from bubbling up to parent handlers
  const handleMouseDown = (e: React.MouseEvent) => e.stopPropagation();
  const handleMouseUp = (e: React.MouseEvent) => e.stopPropagation();
  const handleClick = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger 
        className="w-full h-8 text-xs"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent 
        position="popper" 
        sideOffset={5} 
        side="bottom" 
        align="start"
        className="z-[9999]"
      >
        {children}
      </SelectContent>
    </Select>
  );
};

// TriggerConfigPanel component
interface TriggerConfigPanelProps {
  nodeId: string;
  triggerType: string;
}

const TriggerConfigPanel = ({ nodeId, triggerType }: TriggerConfigPanelProps) => {
  const { getNodes, setNodes } = useReactFlow();
  const [config, setConfig] = useState<TriggerConfig | null>(null);
  
  // Prevent triggering parent events
  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };
  
  // Find the current node and load its configuration
  useEffect(() => {
    const nodes = getNodes();
    const node = nodes.find(n => n.id === nodeId);
    
    if (node?.data?.triggerConfig) {
      setConfig(node.data.triggerConfig);
    } else {
      // If no existing config, create default based on type
      const defaultConfig = triggerTypes.find(t => t.id === triggerType)?.defaultConfig;
      setConfig(defaultConfig || null);
    }
  }, [nodeId, triggerType, getNodes]);
  
  const updateNodeConfig = useCallback(() => {
    if (!config) return;
    
    setNodes(nodes => 
      nodes.map(node => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              triggerConfig: config
            }
          };
        }
        return node;
      })
    );
  }, [nodeId, config, setNodes]);
  
  // Whenever config changes, update the node
  useEffect(() => {
    if (config) {
      updateNodeConfig();
    }
  }, [config, updateNodeConfig]);
  
  // Type-safe update function for specific trigger configs
  const updateSystemUsageConfig = <K extends keyof SystemUsageTriggerConfig>(
    key: K, 
    value: SystemUsageTriggerConfig[K]
  ) => {
    if (!config || config.type !== 'system-usage') return;
    setConfig({ ...config, [key]: value } as TriggerConfig);
  };
  
  const updateTimeConfig = <K extends keyof TimeTriggerConfig>(
    key: K, 
    value: TimeTriggerConfig[K]
  ) => {
    if (!config || config.type !== 'time') return;
    setConfig({ ...config, [key]: value } as TriggerConfig);
  };
  
  const updateOnDemandConfig = <K extends keyof OnDemandTriggerConfig>(
    key: K, 
    value: OnDemandTriggerConfig[K]
  ) => {
    if (!config || config.type !== 'on-demand') return;
    setConfig({ ...config, [key]: value } as TriggerConfig);
  };
  
  if (!config) return <div className="p-4">Loading configuration...</div>;
  
  // Different forms based on trigger type
  switch (config.type) {
    case 'system-usage':
      return (
        <div 
          className="p-4 space-y-4 max-w-full"
          onClick={stopPropagation}
          onMouseDown={stopPropagation}
        >
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Cpu className="w-4 h-4" />
            System Usage Trigger
          </h3>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Resource</Label>
              <SafeSelect 
                value={(config as SystemUsageTriggerConfig).resourceType}
                onValueChange={(value) => 
                  updateSystemUsageConfig('resourceType', value as SystemUsageTriggerConfig['resourceType'])
                }
                placeholder="Select resource"
              >
                <SelectItem value="cpu">CPU</SelectItem>
                <SelectItem value="memory">Memory</SelectItem>
                <SelectItem value="gpu">GPU</SelectItem>
              </SafeSelect>
            </div>
            
            <div>
              <Label className="text-xs">Condition</Label>
              <SafeSelect 
                value={(config as SystemUsageTriggerConfig).operator}
                onValueChange={(value) => 
                  updateSystemUsageConfig('operator', value as SystemUsageTriggerConfig['operator'])
                }
                placeholder="Select condition"
              >
                <SelectItem value="above">Above threshold</SelectItem>
                <SelectItem value="below">Below threshold</SelectItem>
              </SafeSelect>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs">Threshold</Label>
              <span className="text-xs font-medium">{(config as SystemUsageTriggerConfig).threshold}%</span>
            </div>
            <Slider 
              value={[(config as SystemUsageTriggerConfig).threshold]} 
              min={1}
              max={100}
              step={1}
              onValueChange={(value) => updateSystemUsageConfig('threshold', value[0])}
              className="py-2"
            />
          </div>
          
          <div>
            <Label className="text-xs mb-1 block">Duration (seconds)</Label>
            <Input 
              type="number" 
              min={1}
              value={(config as SystemUsageTriggerConfig).duration} 
              onChange={(e) => updateSystemUsageConfig('duration', parseInt(e.target.value) || 30)}
              className="h-8 text-xs"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Time threshold must be met before triggering
            </p>
          </div>
        </div>
      );
      
    case 'time':
      return (
        <div 
          className="p-4 space-y-4 max-w-full"
          onClick={stopPropagation}
          onMouseDown={stopPropagation}
        >
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4" />
            Time Schedule Trigger
          </h3>
          
          <div className="space-y-2">
            <Label className="text-xs">Schedule Type</Label>
            <SafeSelect 
              value={(config as TimeTriggerConfig).schedule}
              onValueChange={(value) => 
                updateTimeConfig('schedule', value as TimeTriggerConfig['schedule'])
              }
              placeholder="Select schedule type"
            >
              <SelectItem value="once">Run once</SelectItem>
              <SelectItem value="daily">Run daily</SelectItem>
              <SelectItem value="weekly">Run weekly</SelectItem>
            </SafeSelect>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">Time</Label>
            <Input 
              type="time" 
              value={(config as TimeTriggerConfig).time} 
              onChange={(e) => updateTimeConfig('time', e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          
          {(config as TimeTriggerConfig).schedule === 'weekly' && (
            <div className="space-y-2">
              <Label className="text-xs">Days of Week</Label>
              <div className="grid grid-cols-2 gap-2">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                  <div key={day} className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      id={day}
                      checked={!!(config as TimeTriggerConfig).days?.includes(day)}
                      onChange={(e) => {
                        const currentDays = (config as TimeTriggerConfig).days || [];
                        const days = e.target.checked
                          ? [...currentDays, day]
                          : currentDays.filter(d => d !== day);
                        updateTimeConfig('days', days);
                      }}
                      className="rounded border-zinc-500 h-3 w-3"
                    />
                    <Label htmlFor={day} className="capitalize text-xs">
                      {day.substring(0, 3)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {(config as TimeTriggerConfig).schedule === 'once' && (
            <div className="space-y-2">
              <Label className="text-xs">Date</Label>
              <Input 
                type="date" 
                value={(config as TimeTriggerConfig).date || ''} 
                onChange={(e) => updateTimeConfig('date', e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>
      );
      
    case 'on-demand':
      return (
        <div 
          className="p-4 space-y-4 max-w-full"
          onClick={stopPropagation}
          onMouseDown={stopPropagation}
        >
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Play className="w-4 h-4" />
            Manual Trigger
          </h3>
          
          <div className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              id="requireConfirmation"
              checked={(config as OnDemandTriggerConfig).requireConfirmation}
              onChange={(e) => 
                updateOnDemandConfig('requireConfirmation', e.target.checked)
              }
              className="rounded border-zinc-500 h-3 w-3"
            />
            <Label htmlFor="requireConfirmation" className="text-xs">
              Require confirmation before execution
            </Label>
          </div>
          
          <p className="text-xs text-zinc-400">
            This trigger can be manually activated from the workflows dashboard.
          </p>
        </div>
      );
      
    default:
      return (
        <div 
          className="p-4 max-w-full"
          onClick={stopPropagation}
        >
          <h3 className="font-semibold text-sm">Unknown trigger type</h3>
          <p className="text-xs text-zinc-400">
            Trigger type "{(config as BaseTriggerConfig).type}" is not recognized.
          </p>
        </div>
      );
  }
};

// Helper to guess trigger type from label
const getTriggerTypeFromLabel = (label: string): string => {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('system') || lowerLabel.includes('usage') || lowerLabel.includes('cpu') || lowerLabel.includes('gpu')) {
    return 'system-usage';
  }
  if (lowerLabel.includes('time') || lowerLabel.includes('schedule')) {
    return 'time';
  }
  if (lowerLabel.includes('demand') || lowerLabel.includes('manual')) {
    return 'on-demand';
  }
  return 'system-usage'; // Default
};

const ActionNode = ({ data }: { data: any }) => {
  return (
    <div className="px-4 py-2 shadow-lg rounded-lg border bg-card min-w-[200px]">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-md bg-blue-500/10">
          {data.icon}
        </div>
        <div>
          <div className="font-semibold text-blue-500">{data.label}</div>
          <div className="text-sm text-muted-foreground">{data.description}</div>
        </div>
      </div>
      
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-blue-500"
        style={{ left: -6 }}
      />
    </div>
  );
};

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
};

// Empty nodes & edges for new workflows
const emptyNodes: Node[] = [];
const emptyEdges: Edge[] = [];

interface WorkflowFormData {
  name: string;
  description: string;
}

// Helper function to convert JSX icon to string identifier for storage
const iconToString = (icon: React.ReactNode): string => {
  if (React.isValidElement(icon)) {
    // Access the displayName or name safely with optional chaining
    return (icon.type as any)?.displayName || (icon.type as any)?.name || 'Activity';
  }
  return 'Activity';
};

// Helper function to convert string identifier back to JSX icon
const stringToIcon = (iconName: string, className: string = "w-4 h-4"): React.ReactNode => {
  const iconProps = { className };
  
  switch (iconName) {
    case 'Activity':
      return <Activity {...iconProps} />;
    case 'Clock':
      return <Clock {...iconProps} />;
    case 'Play':
      return <Play {...iconProps} />;
    case 'Library':
      return <Library {...iconProps} />;
    default:
      return <Activity {...iconProps} />;
  }
};

// Function to serialize node data before saving to DB
const prepareNodesForSave = (nodes: Node[]): Node[] => {
  return nodes.map(node => {
    // If node has icon, convert it to a string
    if (node.data?.icon) {
      // Preserve the triggerConfig
      return {
        ...node,
        data: {
          ...node.data,
          iconName: iconToString(node.data.icon),
          // Remove actual JSX icon as it can't be serialized
          icon: undefined
        }
      };
    }
    return node;
  });
};

// Function to deserialize node data after loading from DB
const prepareNodesAfterLoad = (nodes: Node[]): Node[] => {
  return nodes.map(node => {
    // Create a deep copy to avoid modifying the source object
    const newNode = JSON.parse(JSON.stringify(node));
    
    // If node has iconName, convert back to JSX
    if (newNode.data?.iconName) {
      newNode.data.icon = stringToIcon(newNode.data.iconName);
    }
    // If node has NO iconName but has label, try to infer icon from trigger type
    else if (newNode.data?.label) {
      let iconName = 'Activity';
      
      if (newNode.data.label.includes('Time') || newNode.data.label.includes('Schedule')) {
        iconName = 'Clock';
      } else if (newNode.data.label.includes('Demand') || newNode.data.label.includes('Manual')) {
        iconName = 'Play';
      } else if (newNode.data.label.includes('Library') || newNode.data.label.includes('Media')) {
        iconName = 'Library';
      }
      
      newNode.data.icon = stringToIcon(iconName);
    }
    
    return newNode;
  });
};

// Define trigger types with their configurations
const triggerTypes = [
  {
    id: 'system-usage',
    label: 'System Usage',
    description: 'Trigger on resource thresholds',
    icon: <Activity className="w-4 h-4" />,
    defaultConfig: {
      type: 'system-usage',
      resourceType: 'cpu',
      threshold: 20,
      operator: 'below',
      duration: 30
    } as SystemUsageTriggerConfig,
  },
  {
    id: 'time',
    label: 'Time Schedule',
    description: 'Trigger at specific times',
    icon: <Clock className="w-4 h-4" />,
    defaultConfig: {
      type: 'time',
      schedule: 'daily',
      time: '12:00'
    } as TimeTriggerConfig,
  },
  {
    id: 'on-demand',
    label: 'Manual Trigger',
    description: 'Trigger on demand',
    icon: <Play className="w-4 h-4" />,
    defaultConfig: {
      type: 'on-demand',
      requireConfirmation: false
    } as OnDemandTriggerConfig,
  },
];

// Declare the window.electron interface
declare global {
  interface Window {
    electron: {
      getWorkflows: () => Promise<Workflow[]>;
      getWorkflowDetails: (id: number) => Promise<WorkflowDetails | null>;
      saveWorkflow: (data: { 
        id?: number; 
        name: string; 
        description: string; 
        nodes: Node[]; 
        edges: Edge[] 
      }) => Promise<number>;
      deleteWorkflow: (id: number) => Promise<{ changes: number }>;
      subscribeSystemStats: (callback: (stats: any) => void) => (() => void);
    }
  }
}

// Wrap Workflows component with ReactFlow provider
const WorkflowsWrapper: React.FC = () => {
  return (
    <ReactFlowProvider>
      <Workflows />
    </ReactFlowProvider>
  );
};

const Workflows: React.FC = () => {
  // State for workflow list and selection
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // State for workflow editing
  const [nodes, setNodes] = useNodesState(emptyNodes);
  const [edges, setEdges] = useEdgesState(emptyEdges);
  const [isEditing, setIsEditing] = useState(false);
  
  // State for dialogs
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false);
  const [workflowToEdit, setWorkflowToEdit] = useState<Workflow | null>(null);
  const [showWorkflowsList, setShowWorkflowsList] = useState(true);
  
  // State for form data
  const [formData, setFormData] = useState<WorkflowFormData>({
    name: '',
    description: '',
  });
  
  // Get ReactFlow instance
  const reactFlowInstance = useReactFlow();

  // Load all workflows on component mount
  useEffect(() => {
    loadWorkflows();
  }, []);

  // Load workflows from the database
  const loadWorkflows = async () => {
    try {
      setIsLoading(true);
      const workflowsList = await window.electron.getWorkflows();
      setWorkflows(workflowsList);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading workflows:', error);
      setIsLoading(false);
    }
  };

  // Set up the metadata edit dialog for a specific workflow
  const setupMetadataEdit = (workflow: Workflow) => {
    setWorkflowToEdit(workflow);
    setFormData({
      name: workflow.name,
      description: workflow.description
    });
    setIsMetadataDialogOpen(true);
  };

  // Load a specific workflow details by ID
  const loadWorkflowDetails = async (id: number) => {
    try {
      setIsLoading(true);
      const details = await window.electron.getWorkflowDetails(id);
      if (details) {
        // Process nodes to restore icons and handle configurations
        const processedNodes = prepareNodesAfterLoad(details.nodes);
        
        // Set UI state with reconstructed workflow
        setSelectedWorkflow({
          ...details,
          nodes: processedNodes
        });
        
        // Set ReactFlow state
        setNodes(processedNodes);
        setEdges(details.edges);
        
        // Set form data
        setFormData({
          name: details.name,
          description: details.description
        });
        
        // Switch to workflow view
        setShowWorkflowsList(false);
      }
      setIsLoading(false);
    } catch (error) {
      console.error(`Error loading workflow details for id ${id}:`, error);
      setIsLoading(false);
    }
  };

  // Save workflow metadata only (from list view)
  const saveWorkflowMetadata = async () => {
    if (!workflowToEdit?.id || !formData.name.trim()) return;
    
    try {
      setIsLoading(true);
      setSaveStatus('Saving metadata...');
      
      // If we're editing the metadata for the currently loaded workflow, 
      // we need to update selectedWorkflow and diagram too
      const isCurrentlySelectedWorkflow = selectedWorkflow?.id === workflowToEdit.id;
      
      let workflowData: any = {
        id: workflowToEdit.id,
        name: formData.name,
        description: formData.description,
      };
      
      if (isCurrentlySelectedWorkflow) {
        // If it's the currently selected workflow, we need to include the nodes and edges
        workflowData.nodes = prepareNodesForSave(nodes);
        workflowData.edges = edges;
      } else {
        // If it's not the currently selected workflow, fetch the full details first
        const details = await window.electron.getWorkflowDetails(workflowToEdit.id);
        if (details) {
          workflowData.nodes = details.nodes;
          workflowData.edges = details.edges;
        } else {
          throw new Error("Could not load workflow details");
        }
      }
      
      await window.electron.saveWorkflow(workflowData);
      
      // Update the workflow in the list
      setWorkflows(prev => 
        prev.map(w => 
          w.id === workflowToEdit.id 
            ? { ...w, name: formData.name, description: formData.description } 
            : w
        )
      );
      
      // Update selected workflow if it's the one being edited
      if (isCurrentlySelectedWorkflow) {
        setSelectedWorkflow(prev => prev ? { 
          ...prev, 
          name: formData.name, 
          description: formData.description 
        } : null);
      }
      
      setIsMetadataDialogOpen(false);
      setWorkflowToEdit(null);
      setSaveStatus('Metadata saved');
      
      // Clear status after a delay
      setTimeout(() => setSaveStatus(null), 3000);
      setIsLoading(false);
    } catch (error) {
      console.error('Error saving workflow metadata:', error);
      setSaveStatus('Error saving metadata');
      setIsLoading(false);
    }
  };

  // Save workflow diagram (nodes and edges)
  const saveWorkflowDiagram = async () => {
    if (!selectedWorkflow?.id) return;
    
    try {
      setIsLoading(true);
      setSaveStatus('Saving diagram...');

      // Prepare nodes for saving (convert JSX icons to strings)
      const nodesForSaving = prepareNodesForSave(nodes);

      const workflowData = {
        id: selectedWorkflow.id,
        name: selectedWorkflow.name, // Keep existing name
        description: selectedWorkflow.description, // Keep existing description
        nodes: nodesForSaving,
        edges
      };

      await window.electron.saveWorkflow(workflowData);
      
      // Update selectedWorkflow with new nodes and edges
      setSelectedWorkflow(prev => prev ? { 
        ...prev, 
        nodes: nodesForSaving.map(node => ({
          ...node,
          data: {
            ...node.data,
            // Restore the icon since we're storing the saved version
            icon: node.data.iconName ? stringToIcon(node.data.iconName) : undefined
          }
        })),
        edges: edges 
      } : null);
      
      setSaveStatus('Diagram saved');
      setIsLoading(false);
      
      // Clear status after a delay
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('Error saving workflow diagram:', error);
      setSaveStatus('Error saving diagram');
      setIsLoading(false);
    }
  };

  // Create a new workflow (this method stays the same but becomes clearer now)
  const saveNewWorkflow = async () => {
    try {
      if (!formData.name.trim()) {
        setSaveStatus('Workflow name is required');
        return;
      }

      setIsLoading(true);
      setSaveStatus('Creating workflow...');

      // Prepare nodes for saving (convert JSX icons to strings)
      const nodesForSaving = prepareNodesForSave(nodes);

      const workflowData = {
        name: formData.name,
        description: formData.description,
        nodes: nodesForSaving,
        edges
      };

      const savedId = await window.electron.saveWorkflow(workflowData);
      
      // Update selectedWorkflow with its new ID
      setSelectedWorkflow({
        id: savedId,
        name: formData.name,
        description: formData.description,
        nodes: nodes,
        edges: edges
      });
      
      // Refresh workflow list
      await loadWorkflows();
      
      setSaveStatus('Workflow created');
      setIsLoading(false);
      
      // Clear status after a delay
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('Error creating workflow:', error);
      setSaveStatus('Error creating workflow');
      setIsLoading(false);
    }
  };

  // Handle the Save button click based on context
  const handleSave = () => {
    if (selectedWorkflow) {
      // Existing workflow - save diagram only
      saveWorkflowDiagram();
    } else {
      // New workflow - save everything
      saveNewWorkflow();
    }
  };

  // Delete a workflow from the database
  const deleteWorkflow = async () => {
    if (!selectedWorkflow?.id) return;
    
    try {
      setIsLoading(true);
      await window.electron.deleteWorkflow(selectedWorkflow.id);
      setSelectedWorkflow(null);
      setNodes(emptyNodes);
      setEdges(emptyEdges);
      setIsDeleteDialogOpen(false);
      await loadWorkflows();
      setShowWorkflowsList(true);
      setIsLoading(false);
    } catch (error) {
      console.error(`Error deleting workflow ${selectedWorkflow.id}:`, error);
      setIsLoading(false);
    }
  };

  // Create a new workflow
  const handleCreateWorkflow = () => {
    // Clear existing nodes and create a clean canvas
    setNodes(emptyNodes);
    setEdges(emptyEdges);
    setSelectedWorkflow(null);
    setShowWorkflowsList(false);
    setIsEditing(true);
    setIsCreateDialogOpen(false);
  };

  // Handle connection between nodes
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Add a new trigger node to the canvas
  const addNewTrigger = useCallback((triggerType: typeof triggerTypes[0]) => {
    // Get the current viewport center
    let position = { x: 100, y: 100 };
    
    if (reactFlowInstance) {
      const { x, y, zoom } = reactFlowInstance.getViewport();
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 3;
      
      // Calculate the position in the viewport center
      position = {
        x: (centerX - x) / zoom,
        y: (centerY - y) / zoom,
      };
    }
    
    const newNode: Node<NodeData> = {
      id: `trigger-${Date.now()}`,
      type: 'trigger',
      position: position,
      data: {
        label: triggerType.label,
        description: triggerType.description,
        icon: triggerType.icon,
        triggerConfig: triggerType.defaultConfig,
      },
    };
    
    setNodes((nds) => [...nds, newNode]);
  }, [reactFlowInstance, setNodes]);

  // Return to workflow list
  const handleBackToList = () => {
    // If editing, prompt for confirmation
    if (isEditing && (nodes.length > 0 || edges.length > 0)) {
      if (window.confirm('Discard unsaved changes?')) {
        setShowWorkflowsList(true);
        setSelectedWorkflow(null);
        setIsEditing(false);
      }
    } else {
      setShowWorkflowsList(true);
      setSelectedWorkflow(null);
      setIsEditing(false);
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
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
            {/* Show different buttons based on context */}
            {showWorkflowsList ? (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
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
                      onClick={() => setIsCreateDialogOpen(false)} 
                      className="bg-transparent border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCreateWorkflow} 
                      disabled={!formData.name.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all disabled:bg-indigo-600/50 text-white"
                    >
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <>
                {/* Editor action buttons */}
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
                      onClick={handleSave}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
                      Save
                    </Button>
                  </>
                )}
                
                {selectedWorkflow && (
                  <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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
                          Are you sure you want to delete "{selectedWorkflow.name}"?
                          This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button 
                          variant="outline"
                          onClick={() => setIsDeleteDialogOpen(false)} 
                          className="bg-transparent border-zinc-800 text-zinc-100 hover:bg-zinc-800"
                        >
                          Cancel
                        </Button>
                        <Button 
                          variant="destructive"
                          onClick={deleteWorkflow}
                          className="gap-2"
                          disabled={isLoading}
                        >
                          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={16} />}
                          Delete
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
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

      {/* Show save status if available */}
      {saveStatus && (
        <div className={`px-4 py-2 ${
          saveStatus.includes('saved') || saveStatus.includes('created')
            ? 'bg-green-500/10 text-green-500' 
            : saveStatus.includes('Saving') || saveStatus.includes('Creating')
              ? 'bg-blue-500/10 text-blue-500'
              : 'bg-red-500/10 text-red-500'
        }`}>
          {saveStatus}
        </div>
      )}

      {/* Main content area - either workflow list or editor */}
      <div className="flex-1 overflow-hidden">
        {showWorkflowsList ? (
          /* Workflow list table */
          <div className="p-6 h-full overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Your Workflows</h2>
            {isLoading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              </div>
            ) : workflows.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <p>No workflows found. Create your first workflow to get started.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workflows.map((workflow) => (
                      <TableRow key={workflow.id}>
                        <TableCell className="font-medium">{workflow.name}</TableCell>
                        <TableCell>{workflow.description}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="dark bg-zinc-900 border-zinc-800">
                              <DropdownMenuItem 
                                onClick={() => loadWorkflowDetails(workflow.id)}
                                className="cursor-pointer hover:bg-zinc-800"
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                <span>Modify Workflow</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setupMetadataEdit(workflow)}
                                className="cursor-pointer hover:bg-zinc-800"
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                <span>Edit Details</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-500 cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800"
                                onClick={async () => {
                                  if (confirm(`Are you sure you want to delete "${workflow.name}"?`)) {
                                    await window.electron.deleteWorkflow(workflow.id);
                                    loadWorkflows();
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : (
          /* Workflow editor with ReactFlow */
          <div className="h-full w-full">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              fitView
              className="bg-background"
              nodesDraggable={isEditing}
              nodesConnectable={isEditing}
              elementsSelectable={isEditing}
              edgesFocusable={isEditing}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              
              {isEditing && (
                <Panel position="top-right" className="bg-card border rounded-lg p-4 shadow-lg mr-4 mt-4 z-50">
                  <div className="space-y-4 w-[200px]">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Triggers
                    </h3>
                    <div className="space-y-2">
                      {triggerTypes.map((trigger) => (
                        <Button
                          key={trigger.id}
                          variant="outline"
                          className="w-full justify-start pointer-events-auto"
                          onClick={() => addNewTrigger(trigger)}
                        >
                          {trigger.icon}
                          <span className="ml-2">{trigger.label}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>
        )}
      </div>

      {/* All dialogs remain unchanged */}
      <Dialog open={isMetadataDialogOpen} onOpenChange={setIsMetadataDialogOpen}>
        <DialogContent className="dark bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Edit Workflow Details</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update the name and description of your workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name" className="text-zinc-100">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Workflow Name"
                className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description" className="text-zinc-100">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Workflow description"
                className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsMetadataDialogOpen(false);
                setWorkflowToEdit(null);
              }} 
              className="bg-transparent border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Cancel
            </Button>
            <Button 
              onClick={saveWorkflowMetadata}
              disabled={!formData.name.trim() || isLoading}
              className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all disabled:bg-indigo-600/50 text-white"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Details'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkflowsWrapper; 