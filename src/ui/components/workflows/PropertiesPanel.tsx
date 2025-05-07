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
      return (
        <div className="text-center text-muted-foreground py-8">
          <p>No configurable properties for this node</p>
        </div>
      );
    }
    
    return Object.entries(properties).map(([key, value]) => {
      const propertyKey = key as string;
      const propertyValue = value;
      const propertyType = typeof propertyValue;
      
      // Common label props
      const commonLabelProps = { className: "text-sm font-medium mb-1.5" };
      
      // Infer field type from property value
      switch (propertyType) {
        case 'string':
          // Special case for multi-line strings
          if (propertyKey.includes('message') || propertyKey.includes('description')) {
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
          
          // Path field
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
                      // In a real app, this would open a folder selection dialog
                      alert('This would open a folder selection dialog in the full version');
                    }}
                  >
                    ...
                  </Button>
                </div>
              </div>
            );
          }
          
          // Regular text field
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
          // Handle arrays specifically
          if (Array.isArray(propertyValue)) {
            // For arrays of strings (simple list)
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
          
          // For other objects or complex arrays, provide a read-only JSON view
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
