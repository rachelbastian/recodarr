import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription, 
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { 
  Play, 
  Trash2, 
  Calendar, 
  Clock, 
  Globe, 
  HardDrive,
  Database,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { cn } from "@/lib/utils";

// Task type definition matching the backend
interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  type: 'scan' | 'cleanup' | 'custom' | 'workflow';
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  cronExpression?: string;
  targetPaths?: string[];
  parameters?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Define the expected shape of the electron API
interface ElectronAPI {
  getAllScheduledTasks: () => Promise<ScheduledTask[]>;
  addScheduledTask: (task: Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ScheduledTask>;
  updateScheduledTask: (taskId: string, updates: Partial<Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<ScheduledTask>;
  toggleScheduledTask: (taskId: string, enabled: boolean) => Promise<ScheduledTask>;
  deleteScheduledTask: (taskId: string) => Promise<boolean>;
  runScheduledTaskNow: (taskId: string) => Promise<void>;
  getConfigValue: (key: string) => Promise<any>;
  setConfigValue: (key: string, value: any) => Promise<void>;
  // Add workflow methods
  getWorkflows: () => Promise<any[]>;
}

// Preset task definitions
interface PresetTask {
  id: string;
  name: string;
  description: string;
  type: 'scan' | 'cleanup' | 'custom' | 'workflow';
  defaultHour: number; // Default hour to run (24h format)
  defaultMinute: number;
  icon: React.ReactNode;
  cronTemplate: string; // Template for cron expression, can include {hour}, {minute}
  isWorkflowTask?: boolean; // New flag to identify workflow tasks
}

// Format a date to a readable string
const formatDate = (date?: Date | any): string => {
  if (date === undefined || date === null) {
    // console.log('formatDate received undefined/null, returning "Never"');
    return 'Never';
  }

  if (typeof date === 'string' && date.toLowerCase() === "undefined") {
    console.warn('formatDate received string "undefined", returning "Invalid date (was string undefined)"');
    return 'Invalid date (was string undefined)';
  }

  try {
    let dateToFormat: Date;

    if (date && typeof date === 'object' && 'isLuxonDateTime' in date && date.isLuxonDateTime) {
      if ('ts' in date && typeof date.ts === 'number') {
        dateToFormat = new Date(date.ts);
      } else {
        console.warn('formatDate: Luxon-like object without valid .ts property:', date);
        return 'Invalid Luxon date data';
      }
    } else if (date instanceof Date) {
      dateToFormat = date;
    } else {
      dateToFormat = new Date(date);
    }

    if (isNaN(dateToFormat.getTime())) {
      console.warn('formatDate: Resulted in Invalid Date from input:', date);
      return 'Invalid date';
    }

    const result = dateToFormat.toLocaleString();
    if (typeof result !== 'string') {
        console.error('formatDate: toLocaleString() did not return a string. Input:', date, 'Output:', result);
        return 'Formatting error (non-string)';
    }
    // It's highly unlikely toLocaleString() would return "undefined", but check defensively.
    if (result.toLowerCase() === 'undefined') {
        console.error('formatDate: toLocaleString() returned "undefined" string. Input:', date);
        return 'Formatting error (is undefined string)';
    }
    return result;

  } catch (error) {
    console.error('Error formatting date:', error, 'Input was:', date);
    return 'Error formatting date';
  }
};

// Format a relative time (time until next run)
const formatRelativeTime = (date?: Date | any): string => {
  if (date === undefined || date === null) {
    // console.log('formatRelativeTime received undefined/null, returning "Not scheduled"');
    return 'Not scheduled';
  }

  if (typeof date === 'string' && date.toLowerCase() === "undefined") {
    console.warn('formatRelativeTime received string "undefined", returning "Invalid date (was string undefined)"');
    return 'Invalid date (was string undefined)';
  }
  
  try {
    let timestamp: number;
    
    if (date && typeof date === 'object' && 'isLuxonDateTime' in date && date.isLuxonDateTime) {
      if ('ts' in date && typeof date.ts === 'number') {
        timestamp = date.ts;
      } else {
        console.warn('formatRelativeTime: Luxon-like object without valid .ts property:', date);
        return 'Invalid Luxon date data';
      }
    } else {
      const nextRunDateObj = date instanceof Date ? date : new Date(date);
      if (isNaN(nextRunDateObj.getTime())) {
        console.warn('formatRelativeTime: Resulted in Invalid Date from input:', date);
        return 'Invalid date';
      }
      timestamp = nextRunDateObj.getTime();
    }
    
    const now = new Date().getTime();
    const diff = timestamp - now;
    
    if (diff < 0) return 'Overdue';
    
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds} seconds`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
    
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  } catch (error) {
    console.error('Error calculating relative time:', error, date);
    return 'Error calculating time';
  }
};

// TimePickerSimple component for selecting hour and minute
const TimePickerSimple: React.FC<{
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  disabled?: boolean;
}> = ({ hour, minute, onChange, disabled = false }) => {
  // Options for hours (0-23)
  const hourOptions = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: i === 0 ? '12 AM' : i === 12 ? '12 PM' : i < 12 ? `${i} AM` : `${i-12} PM`
  }));

  // Options for minutes (0, 15, 30, 45)
  const minuteOptions = [0, 15, 30, 45].map(m => ({
    value: m,
    label: m === 0 ? '00' : m.toString()
  }));

  return (
    <div className="flex items-center space-x-2">
      <Select
        value={hour.toString()}
        onValueChange={(val) => onChange(parseInt(val, 10), minute)}
        disabled={disabled}
      >
        <SelectTrigger className="w-[110px]">
          <SelectValue placeholder="Hour" />
        </SelectTrigger>
        <SelectContent>
          {hourOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value.toString()}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select
        value={minute.toString()}
        onValueChange={(val) => onChange(hour, parseInt(val, 10))}
        disabled={disabled}
      >
        <SelectTrigger className="w-[80px]">
          <SelectValue placeholder="Min" />
        </SelectTrigger>
        <SelectContent>
          {minuteOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value.toString()}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

// Timezone selector component
const TimezoneSelector: React.FC<{
  value: string;
  onChange: (timezone: string) => void;
}> = ({ value, onChange }) => {
  // Get common timezones and group them
  const timezones = getCommonTimezones();
  
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[260px]">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Select timezone" />
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-[400px]">
        {Object.entries(timezones).map(([region, zoneList]) => (
          <div key={region}>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{region}</div>
            {zoneList.map(tz => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
};

// Get common timezones grouped by region
const getCommonTimezones = () => {
  const now = new Date();
  
  // Define common timezone IDs grouped by region
  const timezonesByRegion: Record<string, Array<{ value: string; label: string }>> = {
    "America": [
      { value: "America/New_York", label: "New York" },
      { value: "America/Chicago", label: "Chicago" },
      { value: "America/Denver", label: "Denver" },
      { value: "America/Los_Angeles", label: "Los Angeles" },
      { value: "America/Phoenix", label: "Phoenix" },
      { value: "America/Anchorage", label: "Anchorage" },
      { value: "America/Toronto", label: "Toronto" },
      { value: "America/Vancouver", label: "Vancouver" },
      { value: "America/Mexico_City", label: "Mexico City" },
    ],
    "Europe": [
      { value: "Europe/London", label: "London" },
      { value: "Europe/Paris", label: "Paris" },
      { value: "Europe/Berlin", label: "Berlin" },
      { value: "Europe/Madrid", label: "Madrid" },
      { value: "Europe/Rome", label: "Rome" },
      { value: "Europe/Moscow", label: "Moscow" },
    ],
    "Asia/Pacific": [
      { value: "Asia/Tokyo", label: "Tokyo" },
      { value: "Asia/Shanghai", label: "Shanghai" },
      { value: "Asia/Hong_Kong", label: "Hong Kong" },
      { value: "Asia/Singapore", label: "Singapore" },
      { value: "Asia/Dubai", label: "Dubai" },
      { value: "Australia/Sydney", label: "Sydney" },
      { value: "Australia/Melbourne", label: "Melbourne" },
      { value: "Pacific/Auckland", label: "Auckland" }
    ],
    "Other": [
      { value: "UTC", label: "UTC" }
    ]
  };
  
  // Process and format timezone labels with UTC offset
  const result: Record<string, Array<{ value: string; label: string }>> = {};
  
  for (const [region, zones] of Object.entries(timezonesByRegion)) {
    result[region] = zones.map(zone => {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: zone.value,
          timeZoneName: 'short',
        });
        
        const formatted = formatter.format(now);
        // Extract the timezone abbreviation (e.g., "EST")
        const timezoneAbbr = formatted.split(' ').pop() || '';
        
        // Calculate offset from UTC
        const localDate = new Date(now);
        const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
        const tzDate = new Date(now.toLocaleString('en-US', { timeZone: zone.value }));
        
        const offsetInMinutes = (tzDate.getTime() - utcDate.getTime()) / 60000;
        const offsetHours = Math.floor(Math.abs(offsetInMinutes) / 60);
        const offsetMinutes = Math.abs(offsetInMinutes) % 60;
        
        const offsetFormatted = `UTC${offsetInMinutes >= 0 ? '+' : '-'}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
        
        return {
          value: zone.value,
          label: `${zone.label} (${offsetFormatted}${timezoneAbbr ? `, ${timezoneAbbr}` : ''})`
        };
      } catch (e) {
        // Fallback for invalid timezones
        return {
          value: zone.value,
          label: zone.label
        };
      }
    });
  }
  
  return result;
};

// Status badge component
const TaskStatusBadge: React.FC<{ task: ScheduledTask }> = ({ task }) => {
  if (!task.enabled) {
    return <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>;
  }

  if (!task.lastRun && task.nextRun) {
    return <Badge variant="secondary">Pending</Badge>;
  }

  if (task.nextRun) {
    return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Scheduled</Badge>;
  }

  return <Badge variant="destructive">Error</Badge>;
};

// Workflow Task Card component for read-only workflow scheduling display
const WorkflowTaskCard: React.FC<{
  workflow: any;
  existingTask?: ScheduledTask;
  onRunNow: () => void;
  isRunning?: boolean;
}> = ({ workflow, existingTask, onRunNow, isRunning = false }) => {
  const isEnabled = !!existingTask?.enabled;
  
  // Parse schedule properties from task parameters
  const scheduleProperties = existingTask?.parameters?.scheduleProperties || {};
  const { scheduleType = 'daily', time = '09:00', days = [], dayOfMonth = 1, timezone = 'local' } = scheduleProperties;
  
  const formatScheduleDescription = () => {
    if (!isEnabled) return 'Not scheduled';
    
    const [hours, minutes] = time.split(':').map(Number);
    const formattedTime = `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
    
    switch (scheduleType) {
      case 'daily':
        return `Daily at ${formattedTime}`;
      case 'weekly':
        if (days.length === 0) return 'Weekly (no days selected)';
        const dayNames = days.map((d: string) => {
          const dayMap: Record<string, string> = {
            'mon': 'Mon', 'tue': 'Tue', 'wed': 'Wed', 'thu': 'Thu',
            'fri': 'Fri', 'sat': 'Sat', 'sun': 'Sun'
          };
          return dayMap[d];
        }).join(', ');
        return `${dayNames} at ${formattedTime}`;
      case 'monthly':
        const suffix = dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th';
        return `Monthly on the ${dayOfMonth}${suffix} at ${formattedTime}`;
      case 'custom':
        return `Custom: ${existingTask?.cronExpression || 'No cron expression'}`;
      default:
        return 'Unknown schedule';
    }
  };
  
  return (
    <Card className={cn(
      "transition-colors", 
      isEnabled ? "border-primary/30" : "opacity-90"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-1.5 rounded-md", 
              isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              <Settings className="h-4 w-4" />
            </div>
            <CardTitle className="text-lg">{workflow.name}</CardTitle>
          </div>
          <Badge variant={isEnabled ? "default" : "secondary"}>
            {isEnabled ? "Scheduled" : "Not Scheduled"}
          </Badge>
        </div>
        <CardDescription>
          {workflow.description || `Workflow: ${workflow.name}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Schedule information */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Schedule</span>
            </div>
            <div className="text-sm">
              {formatScheduleDescription()}
            </div>
            
            {isEnabled && timezone && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span>Timezone</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {timezone === 'local' ? 'Local System Time' : timezone}
                </div>
              </>
            )}
            
            {existingTask?.lastRun && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Last run</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(existingTask.lastRun)}
                </div>
              </>
            )}
            
            {existingTask?.nextRun && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Next run</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm">{formatDate(existingTask.nextRun)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(existingTask.nextRun)}
                  </span>
                </div>
              </>
            )}
          </div>
          
          {!isEnabled && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground">
                To schedule this workflow, edit it in the Workflows page and configure the scheduled trigger node properties.
              </p>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-end pt-0">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onRunNow}
          disabled={!isEnabled || isRunning}
        >
          {isRunning ? (
            <>
              <div className="h-3.5 w-3.5 mr-2 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
              Running...
            </>
          ) : (
            <>
              <Play className="mr-2 h-3.5 w-3.5" />
              Run Now
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Preset Task Card component
const PresetTaskCard: React.FC<{
  preset: PresetTask;
  existingTask?: ScheduledTask;
  onToggle: (enabled: boolean) => void;
  onTimeChange: (hour: number, minute: number) => void;
  onRunNow: () => void;
  isRunning?: boolean;
}> = ({ preset, existingTask, onToggle, onTimeChange, onRunNow, isRunning = false }) => {
  const isEnabled = !!existingTask?.enabled;
  const { hour = preset.defaultHour, minute = preset.defaultMinute } = existingTask?.parameters || {};
  
  return (
    <Card className={cn(
      "transition-colors", 
      isEnabled ? "border-primary/30" : "opacity-90"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-1.5 rounded-md", 
              isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {preset.icon}
            </div>
            <CardTitle className="text-lg">{preset.name}</CardTitle>
          </div>
          <Switch 
            checked={isEnabled}
            onCheckedChange={onToggle}
            aria-label={`Toggle ${preset.name}`}
            className="data-[state=checked]:bg-primary"
          />
        </div>
        <CardDescription>{preset.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Task details */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Run at</span>
            </div>
            <div>
              <TimePickerSimple
                hour={hour}
                minute={minute}
                onChange={onTimeChange}
                disabled={false}
              />
            </div>
            
            {existingTask?.parameters?.timezone && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span>Timezone</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {existingTask.parameters.timezone}
                </div>
              </>
            )}
            
            {existingTask?.lastRun && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Last run</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(existingTask.lastRun)}
                </div>
              </>
            )}
            
            {existingTask?.nextRun && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Next run</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm">{formatDate(existingTask.nextRun)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(existingTask.nextRun)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end pt-0">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onRunNow}
          disabled={!isEnabled || isRunning}
        >
          {isRunning ? (
            <>
              <div className="h-3.5 w-3.5 mr-2 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
              Running...
            </>
          ) : (
            <>
              <Play className="mr-2 h-3.5 w-3.5" />
              Run Now
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Main component
const ScheduledTasks: React.FC = () => {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [taskIdToDelete, setTaskIdToDelete] = useState<string | null>(null);
  const [taskRunningId, setTaskRunningId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  
  // Get access to Electron API with type casting
  const electronAPI = window.electron as unknown as ElectronAPI;
  
  // Load workflows for scheduling
  const loadWorkflows = async () => {
    try {
      setIsLoadingWorkflows(true);
      const workflowList = await electronAPI.getWorkflows();
      setWorkflows(workflowList);
    } catch (error) {
      console.error('Error loading workflows:', error);
      setWorkflows([]);
    } finally {
      setIsLoadingWorkflows(false);
    }
  };
  
  // Preset tasks definitions
  const presetTasks: PresetTask[] = [
    {
      id: 'nightly-scan',
      name: 'Nightly Library Scan',
      description: 'Scans your media library for new, updated, or deleted files every night',
      type: 'scan',
      defaultHour: 2, // 2 AM by default
      defaultMinute: 0,
      icon: <HardDrive className="h-4 w-4" />,
      cronTemplate: '0 {minute} {hour} * * *', // Every day at the specified hour
    },
    {
      id: 'weekly-cleanup',
      name: 'Weekly Database Cleanup',
      description: 'Removes orphaned entries and optimizes database performance weekly',
      type: 'cleanup',
      defaultHour: 3, // 3 AM by default
      defaultMinute: 0,
      icon: <Database className="h-4 w-4" />,
      cronTemplate: '0 {minute} {hour} * * 0', // Every Sunday at the specified hour
    }
  ];

  // Generate workflow preset tasks dynamically
  const workflowPresetTasks: PresetTask[] = workflows.map(workflow => ({
    id: `workflow-${workflow.id}`,
    name: `Schedule: ${workflow.name}`,
    description: workflow.description || `Automatically run the "${workflow.name}" workflow`,
    type: 'workflow',
    defaultHour: 6, // 6 AM by default for workflows
    defaultMinute: 0,
    icon: <Settings className="h-4 w-4" />,
    cronTemplate: '0 {minute} {hour} * * *', // Every day at the specified hour
    isWorkflowTask: true,
  }));

  // Combine preset tasks
  const allPresetTasks = [...presetTasks, ...workflowPresetTasks];
  
  // Load timezone preference from config
  const loadTimezonePreference = async () => {
    try {
      const savedTimezone = await electronAPI.getConfigValue('scheduler.timezone');
      if (savedTimezone) {
        setTimezone(savedTimezone);
      }
    } catch (error) {
      console.error('Error loading timezone preference:', error);
    }
  };
  
  // Save timezone preference to config
  const saveTimezonePreference = async (newTimezone: string) => {
    try {
      await electronAPI.setConfigValue('scheduler.timezone', newTimezone);
      setTimezone(newTimezone);
      
      // Reload tasks to update next run times with new timezone
      await loadTasks();
    } catch (error) {
      console.error('Error saving timezone preference:', error);
    }
  };
  
  // Load tasks from database
  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const loadedTasks = await electronAPI.getAllScheduledTasks();
      
      console.log('Tasks from API:', loadedTasks);
      
      // Process the dates that come through IPC (they'll be strings from JSON or Luxon DateTime objects)
      const processedTasks = loadedTasks.map(task => {
        // console.log(`Processing task ${task.id}, nextRun raw:`, task.nextRun, typeof task.nextRun);
        
        const processLuxonOrDate = (dateValue: any): Date | undefined => {
          if (dateValue === null || dateValue === undefined || dateValue === "") {
            // console.log('processLuxonOrDate received null/undefined/empty string for dateValue:', dateValue);
            return undefined;
          }

          if (typeof dateValue === 'string' && dateValue.toLowerCase() === 'undefined') {
            console.warn('processLuxonOrDate received string "undefined", treating as invalid. Returning undefined.');
            return undefined;
          }

          if (dateValue && typeof dateValue === 'object' && 'isLuxonDateTime' in dateValue && dateValue.isLuxonDateTime) {
            if ('ts' in dateValue && typeof dateValue.ts === 'number') {
              const luxonDate = new Date(dateValue.ts);
              if (isNaN(luxonDate.getTime())) {
                console.warn('processLuxonOrDate: Luxon .ts property resulted in Invalid Date. Input .ts:', dateValue.ts, 'Returning undefined.');
                return undefined;
              }
              return luxonDate;
            } else {
              console.warn('processLuxonOrDate: Luxon object without valid .ts property. Input:', dateValue, 'Returning undefined.');
              return undefined; 
            }
          }
          
          const d = new Date(dateValue);
          if (isNaN(d.getTime())) {
            console.warn('processLuxonOrDate: new Date() resulted in Invalid Date. Input:', dateValue, 'Returning undefined.');
            return undefined;
          }
          return d; 
        };
        
        const processedNextRun = processLuxonOrDate(task.nextRun);
        // console.log(`Processed task ${task.id}, nextRun processed:`, processedNextRun, typeof processedNextRun);

        return {
          ...task,
          lastRun: processLuxonOrDate(task.lastRun),
          nextRun: processedNextRun,
          createdAt: processLuxonOrDate(task.createdAt) || new Date(), // Should always be valid
          updatedAt: processLuxonOrDate(task.updatedAt) || new Date()  // Should always be valid
        };
      });
      
      // console.log('Processed tasks with new date logic:', processedTasks);
      setTasks(processedTasks);
    } catch (error) {
      console.error('Error loading scheduled tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Run on component mount
  useEffect(() => {
    // Check if the Electron API is properly connected
    if (!window.electron) {
      console.error('Electron API is not available on window object');
      alert('Error: Electron API is not available. Task scheduling functionality will not work.');
    } else {
      console.log('Electron API methods available:', Object.keys(window.electron));
      
      // Verify specific methods we need
      const requiredMethods = [
        'getAllScheduledTasks', 
        'addScheduledTask', 
        'updateScheduledTask', 
        'toggleScheduledTask',
        'deleteScheduledTask',
        'runScheduledTaskNow',
        'getConfigValue',
        'setConfigValue',
        'getWorkflows'
      ];
      
      const missingMethods = requiredMethods.filter(
        method => !(method in window.electron)
      );
      
      if (missingMethods.length > 0) {
        console.error('Missing required Electron API methods:', missingMethods);
        alert(`Error: Missing required Electron API methods: ${missingMethods.join(', ')}`);
      }
    }
    
    const init = async () => {
      await loadTimezonePreference();
      await loadWorkflows(); // Load workflows first
      await loadTasks();
    };
    
    init();
  }, []);
  
  // Find a task by preset ID
  const findTaskByPresetId = (presetId: string): ScheduledTask | undefined => {
    return tasks.find(task => task.parameters?.presetId === presetId);
  };

  // Find a workflow task by workflow ID
  const findWorkflowTask = (workflowId: string): ScheduledTask | undefined => {
    return tasks.find(task => task.parameters?.workflowId === workflowId);
  };
  
  // Handle enabling/disabling a preset task
  const handleTogglePresetTask = async (preset: PresetTask, enabled: boolean) => {
    const existingTask = findTaskByPresetId(preset.id);
    
    try {
      console.log(`Toggling task ${preset.id} to ${enabled ? 'enabled' : 'disabled'}`);
      
      if (existingTask) {
        // Update existing task
        console.log(`Existing task found with ID: ${existingTask.id}, calling toggleScheduledTask`);
        await electronAPI.toggleScheduledTask(existingTask.id, enabled);
      } else if (enabled) {
        // Create new task if enabling
        console.log(`No existing task found, creating new task for ${preset.id}`);
        const hour = preset.defaultHour;
        const minute = preset.defaultMinute;
        
        const taskParameters: Record<string, any> = {
          presetId: preset.id,
          hour,
          minute,
          timezone, // Use the current global timezone
        };
        
        const newTask = {
          name: preset.name,
          description: preset.description,
          type: preset.type,
          frequency: 'custom' as const,
          enabled: true,
          cronExpression: preset.cronTemplate
            .replace('{hour}', hour.toString())
            .replace('{minute}', minute.toString()),
          parameters: taskParameters
        };
        
        console.log('Creating new task with data:', newTask);
        try {
          const createdTask = await electronAPI.addScheduledTask(newTask);
          console.log('Task created successfully:', createdTask);
        } catch (createError: unknown) {
          console.error('Error creating task:', createError);
          // Display error to user
          alert(`Failed to create task: ${createError instanceof Error ? createError.message : 'Unknown error'}`);
        }
      } else {
        console.log('Task does not exist and disable requested - no action needed');
      }
      
      // Reload tasks
      console.log('Reloading tasks after toggle operation');
      await loadTasks();
    } catch (error: unknown) {
      console.error(`Error toggling preset task ${preset.id}:`, error);
      // Display error to user
      alert(`Failed to toggle task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  // Handle changing the time for a preset task
  const handleChangePresetTaskTime = async (preset: PresetTask, hour: number, minute: number) => {
    const existingTask = findTaskByPresetId(preset.id);
    
    if (!existingTask) return;
    
    try {
      // Update the task with new time
      const cronExpression = preset.cronTemplate
        .replace('{hour}', hour.toString())
        .replace('{minute}', minute.toString());
      
      const updatedParameters: Record<string, any> = {
        ...existingTask.parameters,
        hour,
        minute
      };

      // Ensure workflow tasks retain their workflowId
      if (preset.isWorkflowTask && !updatedParameters['workflowId']) {
        const workflowId = preset.id.replace('workflow-', '');
        updatedParameters['workflowId'] = workflowId;
      }
      
      await electronAPI.updateScheduledTask(existingTask.id, {
        cronExpression,
        parameters: updatedParameters
      });
      
      // Reload tasks
      await loadTasks();
    } catch (error) {
      console.error(`Error updating preset task ${preset.id} time:`, error);
    }
  };
  
  // Handle running a task now
  const handleRunTaskNow = async (taskId: string) => {
    try {
      setTaskRunningId(taskId);
      await electronAPI.runScheduledTaskNow(taskId);
      setTimeout(() => loadTasks(), 1500);
    } catch (error) {
      console.error(`Error running task ${taskId}:`, error);
    } finally {
      setTaskRunningId(null);
    }
  };
  
  // Handle changing the global timezone
  const handleChangeTimezone = async (newTimezone: string) => {
    // Save the timezone preference
    await saveTimezonePreference(newTimezone);
    
    // Update the timezone for all existing preset tasks
    for (const preset of presetTasks) {
      const existingTask = findTaskByPresetId(preset.id);
      
      if (existingTask && existingTask.enabled) {
        try {
          await electronAPI.updateScheduledTask(existingTask.id, {
            parameters: {
              ...existingTask.parameters,
              timezone: newTimezone
            }
          });
        } catch (error) {
          console.error(`Error updating timezone for task ${existingTask.id}:`, error);
        }
      }
    }
    
    // Reload tasks to reflect timezone changes
    await loadTasks();
  };
  
  // Handle deleting a task
  const handleDeleteTask = async () => {
    if (!taskIdToDelete) return;
    
    try {
      await electronAPI.deleteScheduledTask(taskIdToDelete);
      setTaskIdToDelete(null);
      setIsDeleteDialogOpen(false);
      await loadTasks();
    } catch (error) {
      console.error(`Error deleting task ${taskIdToDelete}:`, error);
    }
  };
  
  // Render the component
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Scheduled Tasks</h2>
          <p className="text-sm text-muted-foreground">
            Automate media scanning and database maintenance
          </p>
        </div>
        
        {/* Timezone selector */}
        <div className="flex items-center gap-2">
          <TimezoneSelector 
            value={timezone}
            onChange={handleChangeTimezone}
          />
        </div>
      </div>
      
      {/* Loading state */}
      {isLoading || isLoadingWorkflows ? (
        <div className="flex justify-center items-center py-16 border rounded-md">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full"></div>
            <span>{isLoading ? 'Loading tasks...' : 'Loading workflows...'}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Workflow scheduling info */}
          {workflows.length > 0 && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="font-medium text-blue-900 dark:text-blue-100">Workflow Scheduling</h3>
              </div>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Found {workflows.length} workflow{workflows.length !== 1 ? 's' : ''} with scheduled triggers. 
                Workflow schedules are configured in the workflow editor using the scheduled trigger node properties.
                The cards below show the current scheduling status for each workflow.
              </p>
            </div>
          )}
          
          {/* Workflow Task Cards */}
          {workflows.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Workflow Tasks</h3>
              <div className="grid gap-6 md:grid-cols-2">
                {workflows.map(workflow => {
                  const existingTask = findWorkflowTask(workflow.id);
                  const isRunning = existingTask && taskRunningId === existingTask.id;
                  
                  return (
                    <WorkflowTaskCard
                      key={workflow.id}
                      workflow={workflow}
                      existingTask={existingTask}
                      onRunNow={() => existingTask && handleRunTaskNow(existingTask.id)}
                      isRunning={isRunning}
                    />
                  );
                })}
              </div>
            </div>
          )}
          
          {/* System Task Cards */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">System Tasks</h3>
            <div className="grid gap-6 md:grid-cols-2">
              {allPresetTasks.filter(preset => !preset.isWorkflowTask).map(preset => {
                const existingTask = findTaskByPresetId(preset.id);
                const isRunning = existingTask && taskRunningId === existingTask.id;
                
                return (
                  <PresetTaskCard
                    key={preset.id}
                    preset={preset}
                    existingTask={existingTask}
                    onToggle={(enabled) => handleTogglePresetTask(preset, enabled)}
                    onTimeChange={(hour, minute) => handleChangePresetTaskTime(preset, hour, minute)}
                    onRunNow={() => existingTask && handleRunTaskNow(existingTask.id)}
                    isRunning={isRunning}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {/* Delete confirmation dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this scheduled task? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTask}>
              Delete Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScheduledTasks;
