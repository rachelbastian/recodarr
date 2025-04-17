import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import { Label } from "../components/label";
import { Switch } from "../components/switch";

const Settings: React.FC = () => {
  const [availableGpus, setAvailableGpus] = useState<GpuInfo[]>([]);
  const [selectedGpu, setSelectedGpu] = useState<string | null>(null);
  const [psMonEnabled, setPsMonEnabled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [gpus, currentSelection, currentPsMonSetting] = await Promise.all([
          window.electron.getAvailableGpus(),
          window.electron.getSelectedGpu(),
          window.electron.getPsGpuMonitoringEnabled()
        ]);
        setAvailableGpus(gpus);
        setSelectedGpu(currentSelection ?? 'default');
        setPsMonEnabled(currentPsMonSetting);
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleGpuChange = async (newModel: string) => {
    const valueToSave = newModel === 'default' ? null : newModel;
    setSelectedGpu(newModel);
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
                  value={selectedGpu ?? 'default'} 
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
          
          {/* Other settings sections can be added here */}

        </div>
      </div>
    </div>
  );
};

export default Settings; 