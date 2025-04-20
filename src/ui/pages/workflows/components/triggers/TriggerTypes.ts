import { Activity, Clock, Play } from 'lucide-react';
import { SystemUsageTriggerConfig, TimeTriggerConfig, OnDemandTriggerConfig } from '../../types';

export const triggerTypes = [
  {
    id: 'system-usage',
    label: 'System Usage',
    description: 'Trigger on resource thresholds',
    icon: Activity,
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
    icon: Clock,
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
    icon: Play,
    defaultConfig: {
      type: 'on-demand',
      requireConfirmation: false
    } as OnDemandTriggerConfig,
  },
];

// Helper to guess trigger type from label
export const getTriggerTypeFromLabel = (label: string): string => {
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