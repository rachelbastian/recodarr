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
      const currentScheduledDays = (properties?.scheduledDays || []) as string[];
      const currentStartTime = (properties?.startTime || '09:00') as string;
      const currentEndTime = (properties?.endTime || '17:00') as string;

      const handleDayChange = (dayId: string, checked: boolean) => {
        let newScheduledDays = [...currentScheduledDays];
        if (checked) {
          if (!newScheduledDays.includes(dayId)) {
            newScheduledDays.push(dayId);
            // Sort days for consistency (optional)
            newScheduledDays.sort((a, b) => daysOfWeek.findIndex(d => d.id === a) - daysOfWeek.findIndex(d => d.id === b));
          }
        } else {
          newScheduledDays = newScheduledDays.filter(d => d !== dayId);
        }
        handlePropertyChange('scheduledDays', newScheduledDays);
      };
      
      const timeToMinutes = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };

      const handleTimePartChange = (
        timePropName: 'startTime' | 'endTime',
        part: 'hour' | 'minute' | 'ampm',
        value: string
      ) => {
        const currentTimeString = (properties?.[timePropName] || '00:00') as string;
        let [h24, m] = currentTimeString.split(':').map(Number);

        let newH12 = h24 % 12;
        if (newH12 === 0) newH12 = 12; // 0 and 12 become 12 for 12-hour format

        let currentAmPm = h24 >= 12 ? 'PM' : 'AM';
        
        let newH24: number;

        if (part === 'hour') {
          const selectedH12 = parseInt(value, 10);
          if (currentAmPm === 'AM') {
            newH24 = selectedH12 === 12 ? 0 : selectedH12; // 12 AM is 0 hours
          } else { // PM
            newH24 = selectedH12 === 12 ? 12 : selectedH12 + 12; // 12 PM is 12 hours
          }
        } else if (part === 'minute') {
          m = parseInt(value, 10);
          newH24 = h24; // Hour doesn't change directly
        } else { // ampm
          currentAmPm = value;
          // If AM/PM changes, adjust h24 based on the current 12-hour display
          if (currentAmPm === 'AM') {
            newH24 = newH12 === 12 ? 0 : newH12;
          } else { // PM
            newH24 = newH12 === 12 ? 12 : newH12 + 12;
          }
        }
        
        const newPotentialTimeString = `${String(newH24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        if (timePropName === 'startTime') {
          const existingEndTimeString = (properties?.endTime || '17:00') as string;
          if (timeToMinutes(newPotentialTimeString) >= timeToMinutes(existingEndTimeString)) {
            let [startH, startM] = newPotentialTimeString.split(':').map(Number);
            let adjustedEndH = startH + 1;
            let adjustedEndM = startM;
            if (adjustedEndH >= 24) {
              adjustedEndH = 23;
              adjustedEndM = 59;
            }
            const adjustedEndTimeString = `${String(adjustedEndH).padStart(2, '0')}:${String(adjustedEndM).padStart(2, '0')}`;
            handlePropertyChange('startTime', newPotentialTimeString);
            handlePropertyChange('endTime', adjustedEndTimeString);
            toast.warning('End time was automatically adjusted to be after start time.');
          } else {
            handlePropertyChange('startTime', newPotentialTimeString);
          }
        } else { // endTime
          const existingStartTimeString = (properties?.startTime || '09:00') as string;
          if (timeToMinutes(newPotentialTimeString) <= timeToMinutes(existingStartTimeString)) {
            toast.error('End time must be after start time. Please select a valid end time.');
            // Do not save the invalid end time
          } else {
            handlePropertyChange('endTime', newPotentialTimeString);
          }
        }
      };
      
      const formatLocalizedTime = (timeString: string) => {
        if (!timeString || !timeString.includes(':')) return 'Invalid time';
        try {
          // Simplified approach to avoid zonedTimeToUtc
          const [hours, minutes] = timeString.split(':').map(Number);
          if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return "Invalid time format";
          }

          // Create a date object representing a fixed date (e.g., Jan 1, 2000) with the given hours and minutes.
          // This date is created in the system's local timezone.
          const dateInSystemLocal = new Date(2000, 0, 1, hours, minutes);

          // Format this date as if it were in the userTimeZone.
          // If system timezone is UTC and userTimeZone is America/Chicago:
          // 10:00 input -> dateInSystemLocal is 10:00 UTC.
          // formatInTimeZone will convert 10:00 UTC to 05:00 Chicago time. This is NOT what we want.

          // We want to display the timeString (e.g., "10:00") as "10:00 AM (America/Chicago)"
          // So, we parse it into h, m and reformat to 12-hour with AM/PM.
          const h = parseInt(timeString.substring(0, 2), 10);
          const m = parseInt(timeString.substring(3, 5), 10);
          const ampm = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 || 12; // Convert 0 and 12 to 12
          const mStr = m < 10 ? '0' + m : String(m);
          
          // We can't easily get the abbreviation (CDT/CST) without a more robust solution like zonedTimeToUtc
          // or a library that can provide it based on userTimeZone and a date.
          // So, we'll display the full timezone name or a simplified version.
          return `${h12}:${mStr} ${ampm} (${userTimeZone.replace('_', ' ')})`;

        } catch (e) {
          console.error("Error formatting time (simplified):", e);
          return "Invalid time (manual parse)";
        }
      };

      return (
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-2 block">Scheduled Days</Label>
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map(day => (
                <Toggle
                  key={day.id}
                  variant="outline"
                  pressed={currentScheduledDays.includes(day.id)}
                  onPressedChange={(pressed) => handleDayChange(day.id, pressed)}
                  aria-label={day.label}
                  className="data-[state=on]:bg-indigo-600 data-[state=on]:text-indigo-50"
                >
                  {day.short}
                </Toggle>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <Label className="text-sm font-medium mb-1.5 block">Start Time</Label>
            <div className="flex gap-2 items-center">
              <Select
                value={String(parseInt(currentStartTime.split(':')[0], 10) % 12 || 12)}
                onValueChange={(val) => handleTimePartChange('startTime', 'hour', val)}
              >
                <SelectTrigger className="w-[70px]">
                  <SelectValue placeholder="HH" />
                </SelectTrigger>
                <SelectContent>
                  {hoursArray.map(hour => (
                    <SelectItem key={`start-h-${hour}`} value={hour}>{hour}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>:</span>
              <Select
                value={currentStartTime.split(':')[1]}
                onValueChange={(val) => handleTimePartChange('startTime', 'minute', val)}
              >
                <SelectTrigger className="w-[70px]">
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent>
                  {minutesArray.map(minute => (
                    <SelectItem key={`start-m-${minute}`} value={minute}>{minute}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={parseInt(currentStartTime.split(':')[0], 10) >= 12 ? 'PM' : 'AM'}
                onValueChange={(val) => handleTimePartChange('startTime', 'ampm', val)}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue placeholder="AM/PM" />
                </SelectTrigger>
                <SelectContent>
                  {amPmArray.map(ap => (
                    <SelectItem key={`start-ap-${ap}`} value={ap}>{ap}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {currentStartTime && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Selected: {formatLocalizedTime(currentStartTime)}
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium mb-1.5 block">End Time</Label>
            <div className="flex gap-2 items-center">
              <Select
                value={String(parseInt(currentEndTime.split(':')[0], 10) % 12 || 12)}
                onValueChange={(val) => handleTimePartChange('endTime', 'hour', val)}
              >
                <SelectTrigger className="w-[70px]">
                  <SelectValue placeholder="HH" />
                </SelectTrigger>
                <SelectContent>
                  {hoursArray.map(hour => (
                    <SelectItem key={`end-h-${hour}`} value={hour}>{hour}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>:</span>
              <Select
                value={currentEndTime.split(':')[1]}
                onValueChange={(val) => handleTimePartChange('endTime', 'minute', val)}
              >
                <SelectTrigger className="w-[70px]">
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent>
                  {minutesArray.map(minute => (
                    <SelectItem key={`end-m-${minute}`} value={minute}>{minute}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={parseInt(currentEndTime.split(':')[0], 10) >= 12 ? 'PM' : 'AM'}
                onValueChange={(val) => handleTimePartChange('endTime', 'ampm', val)}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue placeholder="AM/PM" />
                </SelectTrigger>
                <SelectContent>
                  {amPmArray.map(ap => (
                    <SelectItem key={`end-ap-${ap}`} value={ap}>{ap}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {currentEndTime && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Selected: {formatLocalizedTime(currentEndTime)}
              </p>
            )}
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
