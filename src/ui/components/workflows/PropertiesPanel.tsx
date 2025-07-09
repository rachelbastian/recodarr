import React, { useState } from 'react';
import { WorkflowNode, NodeData } from './types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatInTimeZone } from 'date-fns-tz';
import { Toggle } from '@/components/ui/toggle';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

interface PropertiesPanelProps {
  selectedNode: WorkflowNode | null;
  onNodeChange: (nodeId: string, data: NodeData) => void;
  onClosePanel: () => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
  selectedNode, 
  onNodeChange,
  onClosePanel 
}) => {
  const [activeTab, setActiveTab] = useState('properties');
  const userTimeZone = 'America/Chicago'; // Define user's timezone

  const daysOfWeek = [
    { id: 'mon', label: 'Monday', short: 'Mon' },
    { id: 'tue', label: 'Tuesday', short: 'Tue' },
    { id: 'wed', label: 'Wednesday', short: 'Wed' },
    { id: 'thu', label: 'Thursday', short: 'Thu' },
    { id: 'fri', label: 'Friday', short: 'Fri' },
    { id: 'sat', label: 'Saturday', short: 'Sat' },
    { id: 'sun', label: 'Sunday', short: 'Sun' },
  ];
  
  const hoursArray = Array.from({ length: 12 }, (_, i) => String(i + 1)); // 1-12
  const minutesArray = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const amPmArray = ['AM', 'PM'];
  
  if (!selectedNode) {
    return (
      <div className="h-full border-l border-border flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <p>Select a node to view and edit its properties</p>
        </div>
      </div>
    );
  }

  const { data } = selectedNode;
  const { icon, label, type, description, properties } = data;
  
  const handlePropertyChange = (name: string, value: any) => {
    const updatedData = {
      ...data,
      properties: {
        ...data.properties,
        [name]: value
      }
    };
    
    onNodeChange(selectedNode.id, updatedData);
  };
  
  // Dynamic rendering of properties based on the node type and its properties
  const renderProperties = () => {
    if (!properties || Object.keys(properties).length === 0) {
      // If the node itself has no properties defined (e.g. scheduled-trigger might be one initially)
      // We still want to render our custom UI if it's the scheduled-trigger.
      if (data.id === 'scheduled') {
        // Fall through to custom 'scheduled-trigger' UI below
      } else {
        return (
          <div className="text-center text-muted-foreground py-8">
            <p>No configurable properties for this node</p>
          </div>
        );
      }
    }

    if (data.id === 'scheduled') {
      const currentScheduleType = (properties?.scheduleType || 'daily') as string;
      const currentTime = (properties?.time || '09:00') as string;
      const currentDays = (properties?.days || []) as string[];
      const currentDayOfMonth = (properties?.dayOfMonth || 1) as number;
      const currentCronExpression = (properties?.cronExpression || '') as string;
      const currentTimezone = (properties?.timezone || 'local') as string;
      const currentEnabled = (properties?.enabled !== false) as boolean;

      const handleScheduleTypeChange = (scheduleType: string) => {
        handlePropertyChange('scheduleType', scheduleType);
        
        // Reset relevant fields when schedule type changes
        if (scheduleType === 'daily') {
          handlePropertyChange('days', []);
          handlePropertyChange('dayOfMonth', 1);
          handlePropertyChange('cronExpression', '');
        } else if (scheduleType === 'weekly') {
          handlePropertyChange('dayOfMonth', 1);
          handlePropertyChange('cronExpression', '');
          if (currentDays.length === 0) {
            handlePropertyChange('days', ['mon']); // Default to Monday
          }
        } else if (scheduleType === 'monthly') {
          handlePropertyChange('days', []);
          handlePropertyChange('cronExpression', '');
        } else if (scheduleType === 'custom') {
          handlePropertyChange('days', []);
          handlePropertyChange('dayOfMonth', 1);
        }
      };

      const handleTimeChange = (time: string) => {
        handlePropertyChange('time', time);
      };

      const handleDayToggle = (dayId: string, checked: boolean) => {
        let newDays = [...currentDays];
        if (checked) {
          if (!newDays.includes(dayId)) {
            newDays.push(dayId);
            // Sort days for consistency
            const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
            newDays.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
          }
        } else {
          newDays = newDays.filter(d => d !== dayId);
        }
        handlePropertyChange('days', newDays);
      };

      const formatTimeForDisplay = (timeString: string) => {
        if (!timeString || !timeString.includes(':')) return 'Invalid time';
        try {
          const [hours, minutes] = timeString.split(':').map(Number);
          if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return "Invalid time format";
          }
          const h12 = hours % 12 || 12;
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const mStr = minutes < 10 ? '0' + minutes : String(minutes);
          return `${h12}:${mStr} ${ampm}`;
        } catch (e) {
          return "Invalid time";
        }
      };

      const generateCronPreview = () => {
        if (currentScheduleType === 'custom') {
          return currentCronExpression || 'Enter custom cron expression';
        }
        
        const [hours, minutes] = currentTime.split(':').map(Number);
        
        if (currentScheduleType === 'daily') {
          return `${minutes} ${hours} * * *`;
        } else if (currentScheduleType === 'weekly') {
          if (currentDays.length === 0) return 'Select at least one day';
          const cronDays = currentDays.map(day => {
            const dayMap: Record<string, string> = {
              'sun': '0', 'mon': '1', 'tue': '2', 'wed': '3', 
              'thu': '4', 'fri': '5', 'sat': '6'
            };
            return dayMap[day];
          }).join(',');
          return `${minutes} ${hours} * * ${cronDays}`;
        } else if (currentScheduleType === 'monthly') {
          return `${minutes} ${hours} ${currentDayOfMonth} * *`;
        }
        
        return '';
      };

      return (
        <div className="space-y-6">
          {/* Schedule Enabled Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Schedule Enabled</Label>
              <p className="text-xs text-muted-foreground">Enable or disable this schedule</p>
            </div>
            <Switch
              checked={currentEnabled}
              onCheckedChange={(checked) => handlePropertyChange('enabled', checked)}
            />
          </div>

          <Separator />

          {/* Schedule Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Schedule Type</Label>
            <Select value={currentScheduleType} onValueChange={handleScheduleTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select schedule type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="custom">Custom (Cron)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time Selection */}
          {currentScheduleType !== 'custom' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Time</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="time"
                  value={currentTime}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  ({formatTimeForDisplay(currentTime)})
                </span>
              </div>
            </div>
          )}

          {/* Weekly Days Selection */}
          {currentScheduleType === 'weekly' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Days of Week</Label>
              <div className="flex flex-wrap gap-2">
                {daysOfWeek.map(day => (
                  <Toggle
                    key={day.id}
                    variant="outline"
                    pressed={currentDays.includes(day.id)}
                    onPressedChange={(pressed) => handleDayToggle(day.id, pressed)}
                    aria-label={day.label}
                    className="data-[state=on]:bg-indigo-600 data-[state=on]:text-indigo-50"
                  >
                    {day.short}
                  </Toggle>
                ))}
              </div>
              {currentDays.length === 0 && (
                <p className="text-xs text-red-500">Please select at least one day</p>
              )}
            </div>
          )}

          {/* Monthly Day Selection */}
          {currentScheduleType === 'monthly' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Day of Month</Label>
              <Select 
                value={String(currentDayOfMonth)} 
                onValueChange={(val) => handlePropertyChange('dayOfMonth', parseInt(val, 10))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                    <SelectItem key={day} value={String(day)}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Note: If the selected day doesn't exist in a month (e.g., Feb 31), it will run on the last day of that month.
              </p>
            </div>
          )}

          {/* Custom Cron Expression */}
          {currentScheduleType === 'custom' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cron Expression</Label>
              <Input
                value={currentCronExpression}
                onChange={(e) => handlePropertyChange('cronExpression', e.target.value)}
                placeholder="0 9 * * *"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Format: minute hour day month day-of-week<br />
                Example: "0 9 * * *" = Every day at 9:00 AM
              </p>
            </div>
          )}

          {/* Timezone Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Timezone</Label>
            <Select value={currentTimezone} onValueChange={(val) => handlePropertyChange('timezone', val)}>
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local System Time</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="America/New_York">Eastern Time</SelectItem>
                <SelectItem value="America/Chicago">Central Time</SelectItem>
                <SelectItem value="America/Denver">Mountain Time</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                <SelectItem value="Europe/London">London</SelectItem>
                <SelectItem value="Europe/Paris">Paris</SelectItem>
                <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Schedule Preview */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Schedule Preview</Label>
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-mono">{generateCronPreview()}</p>
              {currentScheduleType === 'daily' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Runs every day at {formatTimeForDisplay(currentTime)}
                </p>
              )}
              {currentScheduleType === 'weekly' && currentDays.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Runs on {currentDays.map(d => daysOfWeek.find(day => day.id === d)?.label).join(', ')} at {formatTimeForDisplay(currentTime)}
                </p>
              )}
              {currentScheduleType === 'monthly' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Runs on the {currentDayOfMonth}{currentDayOfMonth === 1 ? 'st' : currentDayOfMonth === 2 ? 'nd' : currentDayOfMonth === 3 ? 'rd' : 'th'} of each month at {formatTimeForDisplay(currentTime)}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }
    
    // Fallback for other node types (existing logic)
    if (data.id !== 'scheduled') { 
      const propertyEntries = Object.entries(properties || {});
      if (propertyEntries.length === 0) {
          return (
              <div className="text-center text-muted-foreground py-8">
                  <p>No configurable properties for this node</p>
              </div>
          );
      }
      // Moved the map inside this block
      return propertyEntries.map(([key, value]) => {
        const propertyKey = key as string;
        const propertyValue = value;
        const propertyType = typeof propertyValue;
        
        const commonLabelProps = { className: "text-sm font-medium mb-1.5" };
        
        switch (propertyType) {
          case 'string':
            // Special handling for 'type' and 'deliveryMethod' properties of the 'send-notification' node type
            if (data.id === 'send-notification') {
              if (propertyKey === 'type') {
                return (
                  <div className="space-y-1" key={propertyKey}>
                    <Label htmlFor={`node-prop-${propertyKey}`} {...commonLabelProps}>Notification Type</Label>
                    <Select 
                      value={propertyValue as string || 'info'} 
                      onValueChange={(val) => handlePropertyChange(propertyKey, val)}
                    >
                      <SelectTrigger id={`node-prop-${propertyKey}`}>
                        <SelectValue placeholder="Select notification type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Controls the appearance of in-app notifications.</p>
                  </div>
                );
              } else if (propertyKey === 'deliveryMethod') {
                return (
                  <div className="space-y-1" key={propertyKey}>
                    <Label htmlFor={`node-prop-${propertyKey}`} {...commonLabelProps}>Delivery Method</Label>
                    <Select 
                      value={propertyValue as string || 'in-app'} 
                      onValueChange={(val) => handlePropertyChange(propertyKey, val)}
                    >
                      <SelectTrigger id={`node-prop-${propertyKey}`}>
                        <SelectValue placeholder="Select delivery method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in-app">In-app Notification</SelectItem>
                        <SelectItem value="native-electron">Native Electron Toast</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Choose how the notification is delivered.</p>
                  </div>
                );
              } 
            }
            
            if (propertyKey.includes('message') || propertyKey.includes('description') || propertyKey === 'title') {
              return (
                <div className="space-y-1" key={propertyKey}>
                  <Label htmlFor={propertyKey} {...commonLabelProps}>
                    {propertyKey.charAt(0).toUpperCase() + propertyKey.slice(1).replace(/([A-Z])/g, ' $1')}
                  </Label>
                  <Textarea
                    id={propertyKey}
                    value={propertyValue as string}
                    onChange={(e) => handlePropertyChange(propertyKey, e.target.value)}
                    className="w-full min-h-[80px]"
                    placeholder={`Enter ${propertyKey}...`}
                  />
                </div>
              );
            }
            
            if (propertyKey.includes('path') || propertyKey.includes('folder') || propertyKey.includes('directory')) {
              return (
                <div className="space-y-1" key={propertyKey}>
                  <Label htmlFor={propertyKey} {...commonLabelProps}>
                    {propertyKey.charAt(0).toUpperCase() + propertyKey.slice(1).replace(/([A-Z])/g, ' $1')}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={propertyKey}
                      value={propertyValue as string}
                      onChange={(e) => handlePropertyChange(propertyKey, e.target.value)}
                      placeholder={`Select ${propertyKey}...`}
                      className="w-full"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => {
                        alert('This would open a folder selection dialog in the full version');
                      }}
                    >
                      ...
                    </Button>
                  </div>
                </div>
              );
            }
            
            return (
              <div className="space-y-1" key={propertyKey}>
                <Label htmlFor={propertyKey} {...commonLabelProps}>
                  {propertyKey.charAt(0).toUpperCase() + propertyKey.slice(1).replace(/([A-Z])/g, ' $1')}
                </Label>
                <Input
                  id={propertyKey}
                  value={propertyValue as string}
                  onChange={(e) => handlePropertyChange(propertyKey, e.target.value)}
                  className="w-full"
                  placeholder={`Enter ${propertyKey}...`}
                />
              </div>
            );
            
          case 'number':
            return (
              <div className="space-y-1" key={propertyKey}>
                <Label htmlFor={propertyKey} {...commonLabelProps}>
                  {propertyKey.charAt(0).toUpperCase() + propertyKey.slice(1).replace(/([A-Z])/g, ' $1')}
                </Label>
                <Input
                  id={propertyKey}
                  type="number"
                  value={propertyValue as number}
                  onChange={(e) => handlePropertyChange(propertyKey, Number(e.target.value))}
                  className="w-full"
                />
              </div>
            );
            
          case 'boolean':
            return (
              <div className="flex items-start space-x-3" key={propertyKey}>
                <Checkbox
                  id={propertyKey}
                  checked={propertyValue as boolean}
                  onCheckedChange={(checked) => handlePropertyChange(propertyKey, checked)}
                />
                <div>
                  <Label htmlFor={propertyKey} className="text-sm font-medium">
                    {propertyKey.charAt(0).toUpperCase() + propertyKey.slice(1).replace(/([A-Z])/g, ' $1')}
                  </Label>
                </div>
              </div>
            );
            
          case 'object':
            if (Array.isArray(propertyValue)) {
              if (propertyValue.every(item => typeof item === 'string')) {
                return (
                  <div className="space-y-1" key={propertyKey}>
                    <Label htmlFor={propertyKey} {...commonLabelProps}>
                      {propertyKey.charAt(0).toUpperCase() + propertyKey.slice(1).replace(/([A-Z])/g, ' $1')}
                    </Label>
                    <Textarea
                      id={propertyKey}
                      value={(propertyValue as string[]).join('\n')}
                      onChange={(e) => {
                        const newArray = e.target.value.split('\n').filter(item => item.trim() !== '');
                        handlePropertyChange(propertyKey, newArray);
                      }}
                      className="w-full min-h-[80px]"
                      placeholder={`Enter one ${propertyKey} per line`}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Enter one item per line</p>
                  </div>
                );
              }
            }
            
            return (
              <div className="space-y-1" key={propertyKey}>
                <Label htmlFor={propertyKey} {...commonLabelProps}>
                  {propertyKey.charAt(0).toUpperCase() + propertyKey.slice(1).replace(/([A-Z])/g, ' $1')}
                </Label>
                <Textarea
                  id={propertyKey}
                  value={JSON.stringify(propertyValue, null, 2)}
                  readOnly
                  className="w-full min-h-[120px] font-mono text-xs bg-muted"
                />
                <p className="text-xs text-muted-foreground mt-1">Complex object (read-only)</p>
              </div>
            );
            
          default:
            return null;
        }
      });
    }
    return null; // Explicitly return null if data.id === 'scheduled' and already handled
  };

  const nodeTypeColor = {
    trigger: "text-indigo-500 bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300",
    action: "text-emerald-500 bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300",
    condition: "text-amber-500 bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300",
  };
  
  return (
    <div className="h-full flex flex-col border-l border-border bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-md",
            nodeTypeColor[type as keyof typeof nodeTypeColor],
          )}>
            <span className="text-xl">{icon}</span>
          </div>
          <div>
            <h3 className="font-medium">{label}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="icon"
          onClick={onClosePanel}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <div className="border-b px-4">
          <TabsList className="bg-transparent">
            <TabsTrigger value="properties">Properties</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          <TabsContent value="properties" className="mt-0 space-y-6">
            {renderProperties()}
          </TabsContent>
          
          <TabsContent value="settings" className="mt-0 space-y-4">
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="node-id" className="text-sm font-medium">Node ID</Label>
                <Input 
                  id="node-id" 
                  value={selectedNode.id} 
                  readOnly 
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Unique identifier for this node</p>
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="node-type" className="text-sm font-medium">Node Type</Label>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-3 w-3 rounded-full",
                    type === 'trigger' && "bg-indigo-500",
                    type === 'action' && "bg-emerald-500",
                    type === 'condition' && "bg-amber-500",
                  )} />
                  <Input 
                    id="node-type" 
                    value={type.charAt(0).toUpperCase() + type.slice(1)} 
                    readOnly 
                    className="bg-muted"
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="node-position" className="text-sm font-medium">Position</Label>
                <div className="flex gap-2">
                  <Input 
                    id="node-position-x" 
                    value={`X: ${Math.round(selectedNode.position.x)}`} 
                    readOnly 
                    className="bg-muted flex-1"
                  />
                  <Input 
                    id="node-position-y" 
                    value={`Y: ${Math.round(selectedNode.position.y)}`} 
                    readOnly 
                    className="bg-muted flex-1"
                  />
                </div>
              </div>
              
              <Separator className="my-4" />
              
              <div>
                <h3 className="text-sm font-medium mb-3">Connected Nodes</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedNode.type === 'trigger' 
                    ? 'This trigger starts the workflow' 
                    : 'This node processes data from upstream nodes'}
                </p>
              </div>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};

export default PropertiesPanel;
