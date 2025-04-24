import React, { useCallback, useEffect, useState } from 'react';
import { useReactFlow } from 'reactflow';
import { Cpu, Clock, Play } from 'lucide-react';
import { Label } from "src/components/ui/label";
import { Input } from "src/components/ui/input";
import { Slider } from "src/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import { 
  TriggerConfig, 
  SystemUsageTriggerConfig, 
  TimeTriggerConfig, 
  OnDemandTriggerConfig, 
  BaseTriggerConfig 
} from '../../types';
import { triggerTypes } from './TriggerTypes';

interface TriggerConfigPanelProps {
  nodeId: string;
  triggerType: string;
}

export const TriggerConfigPanel = ({ nodeId, triggerType }: TriggerConfigPanelProps) => {
  const { getNodes, setNodes } = useReactFlow();
  const [config, setConfig] = useState<TriggerConfig | null>(null);
  
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
  
  // Type-safe update functions for specific trigger configs
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
        <div className="p-4 space-y-4 max-w-full">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Cpu className="w-4 h-4" />
            System Usage Trigger
          </h3>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Resource</Label>
              <Select 
                value={(config as SystemUsageTriggerConfig).resourceType}
                onValueChange={(value) => 
                  updateSystemUsageConfig('resourceType', value as SystemUsageTriggerConfig['resourceType'])
                }
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select resource" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpu">CPU</SelectItem>
                  <SelectItem value="memory">Memory</SelectItem>
                  <SelectItem value="gpu">GPU</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs">Condition</Label>
              <Select 
                value={(config as SystemUsageTriggerConfig).operator}
                onValueChange={(value) => 
                  updateSystemUsageConfig('operator', value as SystemUsageTriggerConfig['operator'])
                }
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Above threshold</SelectItem>
                  <SelectItem value="below">Below threshold</SelectItem>
                </SelectContent>
              </Select>
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
        <div className="p-4 space-y-4 max-w-full">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4" />
            Time Schedule Trigger
          </h3>
          
          <div className="space-y-2">
            <Label className="text-xs">Schedule Type</Label>
            <Select 
              value={(config as TimeTriggerConfig).schedule}
              onValueChange={(value) => 
                updateTimeConfig('schedule', value as TimeTriggerConfig['schedule'])
              }
            >
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="Select schedule type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Run once</SelectItem>
                <SelectItem value="daily">Run daily</SelectItem>
                <SelectItem value="weekly">Run weekly</SelectItem>
              </SelectContent>
            </Select>
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
        <div className="p-4 space-y-4 max-w-full">
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
        <div className="p-4 max-w-full">
          <h3 className="font-semibold text-sm">Unknown trigger type</h3>
          <p className="text-xs text-zinc-400">
            Trigger type "{(config as BaseTriggerConfig).type}" is not recognized.
          </p>
        </div>
      );
  }
}; 