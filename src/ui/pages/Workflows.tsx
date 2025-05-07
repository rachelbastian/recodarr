import React, { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import NodePalette from '@/ui/components/workflows/NodePalette';
import WorkflowCanvas from '@/ui/components/workflows/WorkflowCanvas';
import PropertiesPanel from '@/ui/components/workflows/PropertiesPanel';
import { WorkflowNode, NodeData } from '@/ui/components/workflows/types';
import { 
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from 'sonner';

const Workflows: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [showProperties, setShowProperties] = useState(true);
  const [showTriggerDialog, setShowTriggerDialog] = useState(false);

  // Update selected node's data
  const handleNodeChange = (nodeId: string, data: NodeData) => {
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode({
        ...selectedNode,
        data,
      });
    }
  };

  // Handle closing properties panel
  const handleClosePanel = () => {
    setShowProperties(false);
  };

  // Handle node selection - also ensures properties panel is open
  const handleNodeSelect = (node: WorkflowNode | null) => {
    setSelectedNode(node);
    if (node && !showProperties) {
      setShowProperties(true);
    }
  };

  // Handler for opening the trigger dialog from the NodePalette
  const handleAddTrigger = useCallback(() => {
    setShowTriggerDialog(true);
  }, []);

  // Handler for custom events from node buttons (for adding nodes)
  useEffect(() => {
    const handleOpenNodeDialog = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { nodeId, handleId } = customEvent.detail;
      
      // Dispatch event to the WorkflowCanvas component
      // This will be picked up by the canvas to open the appropriate dialog
      window.dispatchEvent(new CustomEvent('openNodeDialogFromWorkflow', {
        detail: { nodeId, handleId }
      }));
    };

    // Listen for events from the nodes
    window.addEventListener('openNodeDialog', handleOpenNodeDialog);
    
    return () => {
      window.removeEventListener('openNodeDialog', handleOpenNodeDialog);
    };
  }, []);

  // Forward the trigger dialog state to the WorkflowCanvas
  useEffect(() => {
    if (showTriggerDialog) {
      window.dispatchEvent(new CustomEvent('openTriggerDialog'));
      setShowTriggerDialog(false);
    }
  }, [showTriggerDialog]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h1 className="text-2xl font-semibold">Workflow Editor</h1>
        <p className="text-muted-foreground">Create automated encoding workflows</p>
      </div>

      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Canvas */}
            <ResizablePanel defaultSize={showProperties ? 80 : 100} minSize={showProperties ? 70 : 100}>
              <WorkflowCanvas
                onNodeSelect={handleNodeSelect}
                selectedNode={selectedNode}
              />
            </ResizablePanel>
            
            {/* Properties panel - conditionally rendered */}
            {showProperties && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
                  <PropertiesPanel 
                    selectedNode={selectedNode}
                    onNodeChange={handleNodeChange}
                    onClosePanel={handleClosePanel}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </ReactFlowProvider>
      </div>
      
      <Toaster position="bottom-right" />
    </div>
  );
};

export default Workflows;
