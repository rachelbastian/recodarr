import { Node, Edge } from 'reactflow';
import { ReactNode } from 'react';

export interface Workflow {
  id: number;
  name: string;
  description: string;
}

export interface WorkflowDetails extends Workflow {
  nodes: Node[];
  edges: Edge[];
}

export interface WorkflowFormData {
  name: string;
  description: string;
}

// Trigger Configuration Types
export interface BaseTriggerConfig {
  type: string;
  label: string;
  description?: string;
}

export interface SystemUsageTriggerConfig extends BaseTriggerConfig {
  type: 'system-usage';
  resourceType: 'cpu' | 'gpu' | 'memory';
  threshold: number;
  operator: 'below' | 'above';
  duration: number; // seconds threshold must be met before triggering
}

export interface TimeTriggerConfig extends BaseTriggerConfig {
  type: 'time';
  schedule: 'once' | 'daily' | 'weekly';
  time: string; // HH:MM format
  days?: string[]; // for weekly schedule: ['monday', 'wednesday', etc.]
  date?: string; // for once schedule: ISO date string
}

export interface OnDemandTriggerConfig extends BaseTriggerConfig {
  type: 'on-demand';
  requireConfirmation: boolean;
}

export type TriggerConfig = SystemUsageTriggerConfig | TimeTriggerConfig | OnDemandTriggerConfig;

// Node Data Types
export interface NodeData {
  label: string;
  description?: string;
  icon?: ReactNode;
  iconName?: string;
  triggerConfig?: TriggerConfig;
}

// Empty nodes & edges for new workflows
export const emptyNodes: Node[] = [];
export const emptyEdges: Edge[] = []; 