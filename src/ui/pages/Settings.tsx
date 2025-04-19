import React, { useState, useEffect, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../@/components/ui/select";
import { Label } from "../../../@/components/ui/label";
import { Switch } from "../../../@/components/ui/switch";
import { Input } from "../../../@/components/ui/input";
import { Button } from "../../../@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../../@/components/ui/alert";
import { Terminal, GripVertical, ArrowUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../@/components/ui/table";
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableTableRowProps {
  id: string;
  children: React.ReactNode;
}

const SortableTableRow = ({ id, children }: SortableTableRowProps) => {
  const {
    attributes,
    listeners,
    transform,
    transition,
    setNodeRef,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="hover:bg-muted/50">
      <TableCell>
        <div {...attributes} {...listeners} className="cursor-grab">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      {children}
    </TableRow>
  );
};

const Settings: React.FC = () => {
  const [availableGpus, setAvailableGpus] = useState<GpuInfo[]>([]);
  const [selectedGpuModel, setSelectedGpuModel] = useState<string>('default');
  const [psMonEnabled, setPsMonEnabled] = useState<boolean>(false);
  const [manualVramInput, setManualVramInput] = useState<string>("");
  const [currentManualVram, setCurrentManualVram] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingVram, setIsSavingVram] = useState(false);
  const [hardwareDevices, setHardwareDevices] = useState<HardwareInfo[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [gpus, currentSelection, currentPsMonSetting, manualVram, devices] = await Promise.all([
          window.electron.getAvailableGpus(),
          window.electron.getSelectedGpu(),
          window.electron.getPsGpuMonitoringEnabled(),
          window.electron.getManualGpuVram(),
          window.electron.getHardwareInfo()
        ]);
        setAvailableGpus(gpus);
        setSelectedGpuModel(currentSelection ?? 'default');
        setPsMonEnabled(currentPsMonSetting);
        setCurrentManualVram(manualVram);
        setManualVramInput(manualVram?.toString() ?? "");
        // Sort devices by priority in descending order (higher priority first)
        setHardwareDevices(devices.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)));
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setHardwareDevices((items) => {
        const oldIndex = items.findIndex(item => item.id.toString() === active.id);
        const newIndex = items.findIndex(item => item.id.toString() === over.id);
        
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // Update priorities based on new order
        const updatedItems = newItems.map((item: HardwareInfo, index: number) => ({
          ...item,
          priority: newItems.length - index // Higher index = higher priority
        }));

        // Update priorities in the database
        Promise.all(
          updatedItems.map((device: HardwareInfo) =>
            window.electron.updateHardwarePriority(device.id, device.priority)
          )
        ).catch(error => {
          console.error("Error updating priorities:", error);
        });

        return updatedItems;
      });
    }
  };

  const handleDeviceToggle = async (deviceId: number, isEnabled: boolean) => {
    try {
      await window.electron.updateHardwareEnabled(deviceId, isEnabled);
      setHardwareDevices(devices =>
        devices.map(device =>
          device.id === deviceId ? { ...device, is_enabled: isEnabled } : device
        )
      );
    } catch (error) {
      console.error("Error toggling device:", error);
    }
  };

  const refreshHardwareInfo = async () => {
    try {
      const updatedDevices = await window.electron.refreshHardwareInfo();
      // Sort devices by priority in descending order (higher priority first)
      setHardwareDevices(updatedDevices.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)));
    } catch (error) {
      console.error("Error refreshing hardware info:", error);
    }
  };

  const selectedGpuDetails = useMemo(() => {
    if (selectedGpuModel === 'default') {
        return availableGpus.find(gpu => !gpu.vendor?.includes('Microsoft')) || availableGpus[0] || null;
    }
    return availableGpus.find(gpu => gpu.model === selectedGpuModel);
  }, [selectedGpuModel, availableGpus]);

  const handleGpuChange = async (newModel: string) => {
    const valueToSave = newModel === 'default' ? null : newModel;
    setSelectedGpuModel(newModel);
    try {
      await window.electron.setSelectedGpu(valueToSave);
    } catch (error) {
      console.error("Error saving GPU preference:", error);
    }
  };

  const handlePsMonChange = async (checked: boolean) => {
    setPsMonEnabled(checked);
    try {
      await window.electron.setPsGpuMonitoringEnabled(checked);
    } catch (error) {
      console.error("Error saving PS Monitoring preference:", error);
    }
  };

  const handleSaveManualVram = async () => {
      const vramValue = manualVramInput.trim();
      let vramToSave: number | null = null;

      if (vramValue !== "") {
          const parsedVram = parseInt(vramValue, 10);
          if (isNaN(parsedVram) || parsedVram <= 0) {
              alert("Please enter a valid positive number for VRAM in MB, or leave it blank to use auto-detection.");
              return;
          }
          vramToSave = parsedVram;
      } 
      // If vramValue is empty, vramToSave remains null

      setIsSavingVram(true);
      try {
          await window.electron.setManualGpuVram(vramToSave); // Pass null or the valid number
          setCurrentManualVram(vramToSave); // Update local state on success
          console.log("Manual VRAM saved:", vramToSave);
      } catch (error) {
          console.error("Error saving manual VRAM:", error);
          alert("Failed to save manual VRAM setting."); // Provide user feedback
      } finally {
          setIsSavingVram(false);
      }
  };

  const handleClearManualVram = async () => {
      setIsSavingVram(true);
      try {
          await window.electron.setManualGpuVram(null);
          setCurrentManualVram(null);
          setManualVramInput("");
          console.log("Manual VRAM cleared.");
      } catch (error) {
          console.error("Error clearing manual VRAM:", error);
          alert("Failed to clear manual VRAM setting.");
      } finally {
          setIsSavingVram(false);
      }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto p-6">
        <div className="grid gap-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          
          <div className="rounded-lg border bg-card p-6 text-card-foreground">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Transcoding Priority</h2>
              <Button onClick={refreshHardwareInfo} variant="outline" size="sm">
                Refresh Hardware
              </Button>
            </div>
            
            <div className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="w-[100px]">Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={hardwareDevices.map(d => d.id.toString())}
                      strategy={verticalListSortingStrategy}
                    >
                      <TableBody>
                        {hardwareDevices.map((device) => (
                          <SortableTableRow key={device.id} id={device.id.toString()}>
                            <TableCell className="font-medium">{device.device_type}</TableCell>
                            <TableCell>
                              {device.vendor} {device.model}
                            </TableCell>
                            <TableCell>
                              {device.device_type === 'CPU'
                                ? `${device.cores_threads ?? 'Unknown'} Threads @ ${device.base_clock_mhz ? `${device.base_clock_mhz} MHz` : 'Unknown'}`
                                : device.memory_mb ? `${device.memory_mb} MB VRAM` : 'Unknown'}
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={device.is_enabled}
                                onCheckedChange={(checked) => handleDeviceToggle(device.id, checked)}
                              />
                            </TableCell>
                          </SortableTableRow>
                        ))}
                      </TableBody>
                    </SortableContext>
                  </DndContext>
                </Table>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Drag and drop devices to set transcoding priority. Higher items have higher priority.
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6 text-card-foreground">
            <h2 className="text-xl font-semibold mb-4">System Monitoring</h2>
            <div className="grid gap-6">
              <div className="grid gap-2">
                <Label htmlFor="gpu-select">Monitored GPU</Label>
                <Select 
                  value={selectedGpuModel} 
                  onValueChange={handleGpuChange}
                  disabled={isLoading}
                >
                  <SelectTrigger id="gpu-select" className="w-full max-w-sm">
                    <SelectValue placeholder="Select GPU..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (Auto-detect)</SelectItem>
                    {availableGpus.map((gpu) => (
                      <SelectItem key={gpu.model} value={gpu.model}>
                        {`${gpu.vendor} - ${gpu.model}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedGpuDetails && (
                    <div className="mt-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-md border border-border">
                        <p><strong>Vendor:</strong> {selectedGpuDetails.vendor}</p>
                        <p><strong>Model:</strong> {selectedGpuDetails.model}</p>
                        <p><strong>Detected VRAM:</strong> {selectedGpuDetails.memoryTotal ? `${selectedGpuDetails.memoryTotal} MB` : 'N/A'}</p>
                    </div>
                )}
              </div>

              <div className="grid gap-2">
                  <Label htmlFor="manual-vram">Manual Total VRAM (MB)</Label>
                  <div className="flex items-center gap-2 max-w-sm">
                    <Input
                        id="manual-vram"
                        type="number"
                        placeholder="Leave blank for auto-detect"
                        value={manualVramInput}
                        onChange={(e) => setManualVramInput(e.target.value)}
                        disabled={isLoading || isSavingVram}
                        min="1"
                        step="1"
                    />
                    <Button 
                        onClick={handleSaveManualVram}
                        disabled={isLoading || isSavingVram || manualVramInput === (currentManualVram?.toString() ?? "")}
                        size="sm"
                    >
                       {isSavingVram ? 'Saving...' : 'Save'}
                    </Button>
                    {currentManualVram !== null && (
                         <Button 
                            variant="outline"
                            onClick={handleClearManualVram}
                            disabled={isLoading || isSavingVram}
                            size="sm"
                        >
                           Clear
                        </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Override the detected total VRAM if incorrect. Used for VRAM usage percentage calculation.
                  </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ps-mon-switch">Enable PowerShell GPU Monitoring</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="ps-mon-switch" 
                      checked={psMonEnabled}
                      onCheckedChange={handlePsMonChange}
                      disabled={isLoading}
                    />
                    <Label htmlFor="ps-mon-switch" className="font-normal">Recommended for Intel GPUs</Label>
                  </div>
                  <div className="rounded-md bg-yellow-950/50 border border-yellow-900/50 px-3 py-2 text-sm text-yellow-500">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                      </svg>
                      <span>Uses PowerShell commands for monitoring which may trigger antivirus alerts</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings; 