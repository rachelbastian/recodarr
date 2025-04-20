import React from 'react';
import { Activity, Clock, Play } from 'lucide-react';
import { Node } from 'reactflow';

export interface TriggerConfig {
  type: string;
  label: string;
  description?: string;
}

export interface SystemUsageTriggerConfig extends TriggerConfig {
  type: 'system-usage';
  resourceType: 'cpu' | 'gpu' | 'memory';
  threshold: number;
  operator: 'below' | 'above';
  duration: number;
}

export interface TimeTriggerConfig extends TriggerConfig {
  type: 'time';
  schedule: 'once' | 'daily' | 'weekly';
  time: string;
  days?: string[];
  date?: string;
}

export interface OnDemandTriggerConfig extends TriggerConfig {
  type: 'on-demand';
  requireConfirmation: boolean;
}

export type TriggerType = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultConfig: SystemUsageTriggerConfig | TimeTriggerConfig | OnDemandTriggerConfig;
};

export const triggerTypes: TriggerType[] = [
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