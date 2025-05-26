import React, { useState, useEffect, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../src/components/ui/select";
import { Label } from "../../../src/components/ui/label";
import { Switch } from "../../../src/components/ui/switch";
import { Input } from "../../../src/components/ui/input";
import { Button } from "../../../src/components/ui/button";
import { GpuInfo } from '../../types';
import LogViewer from '../components/settings/LogViewer';
import ScheduledTasks from '../components/settings/ScheduledTasks';

const Settings: React.FC = () => {
  const [availableGpus, setAvailableGpus] = useState<GpuInfo[]>([]);
  const [selectedGpuModel, setSelectedGpuModel] = useState<string>('default');
  const [psMonEnabled, setPsMonEnabled] = useState<boolean>(false);
  const [runInBackground, setRunInBackground] = useState<boolean>(false);
  const [manualVramInput, setManualVramInput] = useState<string>("");
  const [currentManualVram, setCurrentManualVram] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingVram, setIsSavingVram] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [gpus, currentSelection, currentPsMonSetting, runInBackgroundSetting, manualVram] = await Promise.all([
          window.electron.getAvailableGpus(),
          window.electron.getSelectedGpu(),
          window.electron.getPsGpuMonitoringEnabled(),
          window.electron.getRunInBackground(),
          window.electron.getManualGpuVram()
        ]);
        setAvailableGpus(gpus);
        setSelectedGpuModel(currentSelection ?? 'default');
        setPsMonEnabled(currentPsMonSetting);
        setRunInBackground(runInBackgroundSetting);
        setCurrentManualVram(manualVram);
        setManualVramInput(manualVram?.toString() ?? "");
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

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

  const handleRunInBackgroundChange = async (checked: boolean) => {
    setRunInBackground(checked);
    try {
      await window.electron.setRunInBackground(checked);
    } catch (error) {
      console.error("Error saving run in background preference:", error);
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

          {/* Application Behavior Section */}
          <div className="rounded-lg border bg-card p-6 text-card-foreground">
            <h2 className="text-xl font-semibold mb-4">Application Behavior</h2>
            <div className="grid gap-6">
              <div className="grid gap-2">
                <Label htmlFor="run-background-switch">Run in Background</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="run-background-switch" 
                      checked={runInBackground}
                      onCheckedChange={handleRunInBackgroundChange}
                      disabled={isLoading}
                    />
                    <Label htmlFor="run-background-switch" className="font-normal">Minimize to system tray instead of closing</Label>
                  </div>
                  <div className="rounded-md bg-blue-950/50 border border-blue-900/50 px-3 py-2 text-sm text-blue-400">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                      </svg>
                      <span>When enabled, closing the window will minimize the app to the system tray and continue processing in the background</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scheduled Tasks Section */}
          <div className="rounded-lg border bg-card p-6 text-card-foreground">
            <ScheduledTasks />
          </div>

          {/* Log Viewer Section */}
          <LogViewer />
        </div>
      </div>
    </div>
  );
};

export default Settings; 