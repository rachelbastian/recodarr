import { Node } from 'reactflow';

export interface NodeData {
  id?: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  type: 'trigger' | 'action' | 'condition';
  properties?: Record<string, any>;
}

export type WorkflowNode = Node<NodeData>;

// Define sample nodes for each type
export const ALL_NODES = [
  // Trigger nodes
  {
    id: 'file-added',
    type: 'trigger',
    label: 'File Added',
    description: 'Triggered when a new file is added to a watched folder',
    icon: '📄',
    properties: {
      folderPath: '',
      filePattern: '*.*',
      includeSubfolders: false
    }
  },
  {
    id: 'manual-trigger',
    type: 'trigger',
    label: 'Manual Trigger',
    description: 'Manually run this workflow',
    icon: '👆',
    properties: {
      name: 'Manual Trigger'
    }
  },
  {
    id: 'scheduled',
    type: 'trigger',
    label: 'Scheduled',
    description: 'Run on a schedule',
    icon: '⏰',
    properties: {
      schedule: '0 0 * * *', // Default to midnight (cron syntax)
      timezone: 'UTC'
    }
  },
  
  // Action nodes
  {
    id: 'encode-file',
    type: 'action',
    label: 'Encode File',
    description: 'Convert media to a different format',
    icon: '🔄',
    properties: {
      preset: '',
      outputFormat: 'mp4',
      outputPath: ''
    }
  },
  {
    id: 'move-file',
    type: 'action',
    label: 'Move File',
    description: 'Move a file to a different location',
    icon: '📦',
    properties: {
      destination: '',
      overwrite: false
    }
  },
  {
    id: 'rename-file',
    type: 'action',
    label: 'Rename File',
    description: 'Rename a file',
    icon: '✏️',
    properties: {
      pattern: '{name}_{date}',
      overwrite: false
    }
  },
  {
    id: 'delete-file',
    type: 'action',
    label: 'Delete File',
    description: 'Delete a file',
    icon: '🗑️',
    properties: {
      permanent: false
    }
  },
  {
    id: 'send-notification',
    type: 'action',
    label: 'Send Notification',
    description: 'Send a notification',
    icon: '🔔',
    properties: {
      title: '',
      message: '',
      type: 'info' // info, success, warning, error
    }
  },
  
  // Condition nodes
  {
    id: 'file-size',
    type: 'condition',
    label: 'File Size',
    description: 'Check if file size meets condition',
    icon: '📏',
    properties: {
      operator: 'greater', // greater, less, equal
      size: 10,
      unit: 'MB' // KB, MB, GB
    }
  },
  {
    id: 'file-type',
    type: 'condition',
    label: 'File Type',
    description: 'Check file extension or media type',
    icon: '🎬',
    properties: {
      types: ['mp4', 'mkv', 'avi'],
      matchAny: true
    }
  },
  {
    id: 'file-name',
    type: 'condition',
    label: 'File Name',
    description: 'Check if filename matches pattern',
    icon: '🔤',
    properties: {
      pattern: '',
      caseSensitive: false,
      useRegex: false
    }
  }
];
