import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PlusCircle, Edit, Trash2, Loader2, Check, ChevronsUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IElectronAPI, EncodingPreset } from '../../types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { defaultPresetValues, getPresetSummary, loadPresets as loadPresetsUtil } from '@/utils/presetUtil.js';

// --- Constants from ManualEncode (adjust as needed) ---
const VIDEO_CODECS = ['hevc_qsv', 'h264_qsv', 'av1_qsv', 'libx265', 'libx264', 'copy'] as const;
type VideoCodec = typeof VIDEO_CODECS[number];
const VIDEO_PRESETS = ['veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'ultrafast'] as const;
type VideoPreset = typeof VIDEO_PRESETS[number];
const VIDEO_RESOLUTIONS = ['original', '480p', '720p', '1080p', '1440p', '2160p'] as const;
type VideoResolution = typeof VIDEO_RESOLUTIONS[number];
const AUDIO_CODECS_CONVERT = ['libopus', 'aac', 'eac3'] as const;
type AudioCodecConvert = typeof AUDIO_CODECS_CONVERT[number];
const SUBTITLE_CODECS_CONVERT = ['srt', 'mov_text'] as const;
type SubtitleCodecConvert = typeof SUBTITLE_CODECS_CONVERT[number];
const HW_ACCEL_OPTIONS = ['auto', 'qsv', 'nvenc', 'cuda', 'none'] as const;
type HwAccel = typeof HW_ACCEL_OPTIONS[number];
const AUDIO_LAYOUT_OPTIONS = ['stereo', 'mono', 'surround5_1'] as const;
type AudioLayout = typeof AUDIO_LAYOUT_OPTIONS[number];

// Add subtitle type options
const SUBTITLE_TYPES = ['forced', 'sdh', 'cc', 'hi', 'normal', 'signs', 'song'] as const;
type SubtitleType = typeof SUBTITLE_TYPES[number];

// Language options for audio tracks
const COMMON_LANGUAGES = [
  { value: 'original', label: 'Original Language (Track 0)' },
  { value: 'eng', label: 'English' },
  { value: 'jpn', label: 'Japanese' },
  { value: 'fre', label: 'French' }, // or 'fra'
  { value: 'ger', label: 'German' }, // or 'deu'
  { value: 'spa', label: 'Spanish' },
  { value: 'ita', label: 'Italian' },
  { value: 'rus', label: 'Russian' },
  { value: 'kor', label: 'Korean' },
  { value: 'chi', label: 'Chinese' }, // or 'zho'
];

// Extended language list (ISO 639-2 codes)
const EXTENDED_LANGUAGES = [
  ...COMMON_LANGUAGES,
  { value: 'ara', label: 'Arabic' },
  { value: 'ces', label: 'Czech' },
  { value: 'dan', label: 'Danish' },
  { value: 'dut', label: 'Dutch' }, // or 'nld'
  { value: 'fin', label: 'Finnish' },
  { value: 'gre', label: 'Greek' }, // or 'ell'
  { value: 'heb', label: 'Hebrew' },
  { value: 'hun', label: 'Hungarian' },
  { value: 'nor', label: 'Norwegian' },
  { value: 'pol', label: 'Polish' },
  { value: 'por', label: 'Portuguese' },
  { value: 'swe', label: 'Swedish' },
  { value: 'tha', label: 'Thai' },
  { value: 'tur', label: 'Turkish' },
  { value: 'vie', label: 'Vietnamese' },
].sort((a, b) => a.label.localeCompare(b.label));

// Simplify to just a string type for language codes
type LanguageCode = string;

// Cast window.electron to the imported type
const electronAPI = window.electron as IElectronAPI;

// --- NEW Audio Order Selector Component ---
interface AudioOrderSelectorProps {
    orderedLanguages: string[]; // Current order (e.g., ['eng', 'original'])
    onChange: (newOrder: string[]) => void;
}

const AudioOrderSelector: React.FC<AudioOrderSelectorProps> = ({ orderedLanguages, onChange }) => {
    const [addLangOpen, setAddLangOpen] = useState(false);

    const getLanguageLabel = useCallback((code: string) => {
        return EXTENDED_LANGUAGES.find(l => l.value === code)?.label || code;
    }, []);

    const handleAddLanguage = (langCode: string) => {
        if (langCode && !orderedLanguages.includes(langCode)) {
            onChange([...orderedLanguages, langCode]);
        }
        setAddLangOpen(false);
    };

    const handleRemoveLanguage = (langCode: string) => {
        onChange(orderedLanguages.filter(l => l !== langCode));
    };

    const moveItem = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...orderedLanguages];
        const item = newOrder[index];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;

        if (swapIndex >= 0 && swapIndex < newOrder.length) {
            newOrder.splice(index, 1);
            newOrder.splice(swapIndex, 0, item);
            onChange(newOrder);
        }
    };

    return (
        <div className="space-y-3">
            {orderedLanguages.length > 0 && (
                <Card className="bg-background/30 p-3 border border-border/50">
                    <div className="space-y-2">
                        {orderedLanguages.map((langCode, index) => (
                            <div key={langCode} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50">
                                <span className="font-medium text-sm">
                                    <span className="text-xs text-muted-foreground mr-2">{index + 1}.</span> 
                                    {getLanguageLabel(langCode)}
                                </span>
                                <div className="flex items-center">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => moveItem(index, 'up')} 
                                        disabled={index === 0}
                                        className="h-6 w-6"
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => moveItem(index, 'down')} 
                                        disabled={index === orderedLanguages.length - 1}
                                        className="h-6 w-6"
                                    >
                                        <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleRemoveLanguage(langCode)}
                                        className="h-6 w-6 text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <Popover open={addLangOpen} onOpenChange={setAddLangOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Language Preference
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                    <Command>
                        <CommandInput placeholder="Search languages..." />
                        <CommandList>
                            <CommandEmpty>No language found.</CommandEmpty>
                            <ScrollArea className="h-[300px]">
                                <CommandGroup>
                                    {EXTENDED_LANGUAGES
                                        .filter(lang => !orderedLanguages.includes(lang.value)) // Only show unselected languages
                                        .map((language) => (
                                        <CommandItem
                                            key={language.value}
                                            value={language.label} // Search by label
                                            onSelect={() => handleAddLanguage(language.value)}
                                        >
                                            {language.label}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </ScrollArea>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground mt-1">
                Define the preferred order of audio tracks. Track 0 will be the first language in this list. Other tracks will follow this order. Missing languages are ignored.
            </p>
        </div>
    );
};
// --- END Audio Order Selector Component ---

// --- NEW Subtitle Order Selector Component ---
interface SubtitleOrderSelectorProps {
    orderedLanguages: string[]; // Current order (e.g., ['eng', 'original'])
    onChange: (newOrder: string[]) => void;
}

const SubtitleOrderSelector: React.FC<SubtitleOrderSelectorProps> = ({ orderedLanguages, onChange }) => {
    const [addLangOpen, setAddLangOpen] = useState(false);

    const getLanguageLabel = useCallback((code: string) => {
        return EXTENDED_LANGUAGES.find(l => l.value === code)?.label || code;
    }, []);

    const handleAddLanguage = (langCode: string) => {
        if (langCode && !orderedLanguages.includes(langCode)) {
            onChange([...orderedLanguages, langCode]);
        }
        setAddLangOpen(false);
    };

    const handleRemoveLanguage = (langCode: string) => {
        onChange(orderedLanguages.filter(l => l !== langCode));
    };

    const moveItem = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...orderedLanguages];
        const item = newOrder[index];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;

        if (swapIndex >= 0 && swapIndex < newOrder.length) {
            newOrder.splice(index, 1);
            newOrder.splice(swapIndex, 0, item);
            onChange(newOrder);
        }
    };

    return (
        <div className="space-y-3">
            {orderedLanguages.length > 0 && (
                <Card className="bg-background/30 p-3 border border-border/50">
                    <div className="space-y-2">
                        {orderedLanguages.map((langCode, index) => (
                            <div key={langCode} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50">
                                <span className="font-medium text-sm">
                                    <span className="text-xs text-muted-foreground mr-2">{index + 1}.</span> 
                                    {getLanguageLabel(langCode)}
                                </span>
                                <div className="flex items-center">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => moveItem(index, 'up')} 
                                        disabled={index === 0}
                                        className="h-6 w-6"
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => moveItem(index, 'down')} 
                                        disabled={index === orderedLanguages.length - 1}
                                        className="h-6 w-6"
                                    >
                                        <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleRemoveLanguage(langCode)}
                                        className="h-6 w-6 text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <Popover open={addLangOpen} onOpenChange={setAddLangOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Subtitle Language
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                    <Command>
                        <CommandInput placeholder="Search languages..." />
                        <CommandList>
                            <CommandEmpty>No language found.</CommandEmpty>
                            <ScrollArea className="h-[300px]">
                                <CommandGroup>
                                    {EXTENDED_LANGUAGES
                                        .filter(lang => !orderedLanguages.includes(lang.value)) // Only show unselected languages
                                        .map((language) => (
                                        <CommandItem
                                            key={language.value}
                                            value={language.label} // Search by label
                                            onSelect={() => handleAddLanguage(language.value)}
                                        >
                                            {language.label}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </ScrollArea>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground mt-1">
                Define the preferred order of subtitle languages. Subtitles will be selected according to this order. Missing languages are ignored.
            </p>
        </div>
    );
};
// --- END Subtitle Order Selector Component ---

// --- NEW Subtitle Type Order Selector Component ---
interface SubtitleTypeOrderSelectorProps {
    orderedTypes: string[]; // Current order of subtitle types
    onChange: (newOrder: string[]) => void;
}

const SubtitleTypeOrderSelector: React.FC<SubtitleTypeOrderSelectorProps> = ({ orderedTypes, onChange }) => {
    const [addTypeOpen, setAddTypeOpen] = useState(false);

    // Map of subtitle types to display names
    const subtitleTypeLabels: Record<string, string> = {
        'forced': 'Forced Subtitles',
        'sdh': 'SDH (Deaf/Hard of Hearing)',
        'cc': 'Closed Captions',
        'hi': 'Hearing Impaired',
        'normal': 'Normal Subtitles',
        'signs': 'Signs & Text',
        'song': 'Song/Lyrics'
    };
    
    const getTypeLabel = useCallback((type: string) => {
        return subtitleTypeLabels[type] || type;
    }, []);

    const handleAddType = (type: string) => {
        if (type && !orderedTypes.includes(type)) {
            onChange([...orderedTypes, type]);
        }
        setAddTypeOpen(false);
    };

    const handleRemoveType = (type: string) => {
        onChange(orderedTypes.filter(t => t !== type));
    };

    const moveItem = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...orderedTypes];
        const item = newOrder[index];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;

        if (swapIndex >= 0 && swapIndex < newOrder.length) {
            newOrder.splice(index, 1);
            newOrder.splice(swapIndex, 0, item);
            onChange(newOrder);
        }
    };

    return (
        <div className="space-y-3">
            {orderedTypes.length > 0 && (
                <Card className="bg-background/30 p-3 border border-border/50">
                    <div className="space-y-2">
                        {orderedTypes.map((type, index) => (
                            <div key={type} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50">
                                <span className="font-medium text-sm">
                                    <span className="text-xs text-muted-foreground mr-2">{index + 1}.</span> 
                                    {getTypeLabel(type)}
                                </span>
                                <div className="flex items-center">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => moveItem(index, 'up')} 
                                        disabled={index === 0}
                                        className="h-6 w-6"
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => moveItem(index, 'down')} 
                                        disabled={index === orderedTypes.length - 1}
                                        className="h-6 w-6"
                                    >
                                        <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleRemoveType(type)}
                                        className="h-6 w-6 text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <Popover open={addTypeOpen} onOpenChange={setAddTypeOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Subtitle Type
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                    <Command>
                        <CommandInput placeholder="Search subtitle types..." />
                        <CommandList>
                            <CommandEmpty>No subtitle type found.</CommandEmpty>
                            <ScrollArea className="h-[300px]">
                                <CommandGroup>
                                    {SUBTITLE_TYPES
                                        .filter(type => !orderedTypes.includes(type)) // Only show unselected types
                                        .map((type) => (
                                        <CommandItem
                                            key={type}
                                            value={getTypeLabel(type)} // Search by label
                                            onSelect={() => handleAddType(type)}
                                        >
                                            {getTypeLabel(type)}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </ScrollArea>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground mt-1">
                Define the preferred order of subtitle types. For each language, subtitles will be prioritized according to this order.
            </p>
        </div>
    );
};
// --- END Subtitle Type Order Selector Component ---

const Presets: React.FC = () => {
    const [presets, setPresets] = useState<EncodingPreset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State for Dialog and Form
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPreset, setEditingPreset] = useState<EncodingPreset | null>(null);
    const [formData, setFormData] = useState<Partial<Omit<EncodingPreset, 'id'>>>(defaultPresetValues);
    const [formError, setFormError] = useState<string | null>(null);

    // Load presets on mount
    useEffect(() => {
        const loadPresets = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const loadedPresets = await loadPresetsUtil(electronAPI);
                setPresets(loadedPresets);
            } catch (err) {
                console.error("Error loading presets:", err);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setIsLoading(false);
            }
        };
        loadPresets();
    }, []);

    const handleInputChange = (field: keyof Omit<EncodingPreset, 'id'>, value: any) => {
        const processedValue = value === '' ? undefined : value;
        setFormData(prev => ({
            ...prev,
            [field]: processedValue
        }));
        setFormError(null);
    };

    const handleSliderChange = (field: keyof Omit<EncodingPreset, 'id'>, value: number[]) => {
        handleInputChange(field, value[0]);
    };

    const openCreateDialog = () => {
        setEditingPreset(null);
        setFormData({ ...defaultPresetValues, audioLanguageOrder: defaultPresetValues.audioLanguageOrder ?? [] });
        setFormError(null);
        setIsDialogOpen(true);
    };

    const openEditDialog = (preset: EncodingPreset) => {
        setEditingPreset(preset);
        setFormData({ 
            ...defaultPresetValues, // Start with defaults
            ...preset, // Override with actual preset values
            audioLanguageOrder: preset.audioLanguageOrder ?? [] // Ensure it's an array
        }); 
        setFormError(null);
        setIsDialogOpen(true);
    };

    const handleSavePreset = async () => {
        setFormError(null);
        if (!formData.name?.trim()) {
            setFormError("Preset name cannot be empty.");
            return; 
        }

        try {
            // Ensure audioLanguageOrder is defined before saving
            const presetToSave: EncodingPreset = {
                ...(editingPreset ? { ...editingPreset, ...formData } : { ...formData, id: Date.now().toString() }),
                audioLanguageOrder: formData.audioLanguageOrder ?? [], // Ensure it's an array
            } as EncodingPreset;

            const savedPreset = await electronAPI.savePreset(presetToSave);

            // Ensure the preset returned from save has the array format
            const sanitizedSavedPreset = { ...savedPreset, audioLanguageOrder: savedPreset.audioLanguageOrder ?? [] };

            if (editingPreset) {
                setPresets(prev => prev.map(p => p.id === sanitizedSavedPreset.id ? sanitizedSavedPreset : p));
            } else {
                setPresets(prev => [...prev, sanitizedSavedPreset]);
            }
            setIsDialogOpen(false);
        } catch (err) {
            console.error("Error saving preset:", err);
            setFormError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleDeletePreset = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the preset "${name}"?`)) {
            return;
        }

        try {
            await electronAPI.deletePreset(id);
            setPresets(prev => prev.filter(p => p.id !== id));
        } catch (err) {
            console.error("Error deleting preset:", err);
            setError(`Failed to delete preset "${name}": ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold tracking-tight mb-1">Encoding Presets</h1>
                <p className="text-muted-foreground">Manage your custom FFMPEG encoding presets</p>
            </div>

            {/* Loading/Error State */}
            {isLoading && (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading presets...</span>
                </div>
            )}
            {error && (
                 <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Preset List Card - Conditionally rendered after loading */}
            {!isLoading && !error && (
                <Card className="border-none shadow-sm bg-card/50">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-xl">Your Presets</CardTitle>
                            <CardDescription>View, edit, or delete your saved presets</CardDescription>
                        </div>
                        <Button onClick={openCreateDialog} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            <PlusCircle className="mr-2 h-4 w-4" /> Create Preset
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {presets.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">No presets created yet.</p>
                        ) : (
                            <div className="space-y-4">
                                {presets.map((preset) => (
                                    <div key={preset.id} className="flex items-center justify-between p-4 bg-background/50 rounded-lg">
                                        <div>
                                            <p className="font-medium">{preset.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {getPresetSummary(preset)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(preset)} title="Edit Preset">
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDeletePreset(preset.id, preset.name)} className="text-destructive hover:text-destructive" title="Delete Preset">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Dialog Form */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingPreset ? 'Edit Preset' : 'Create New Preset'}</DialogTitle>
                    </DialogHeader>
                    {formError && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertTitle>Save Error</AlertTitle>
                            <AlertDescription>{formError}</AlertDescription>
                         </Alert>
                    )}
                    <div className="grid gap-6 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Name</Label>
                            <Input 
                                id="name" 
                                value={formData.name || ''} 
                                onChange={(e) => handleInputChange('name', e.target.value)}
                                className="col-span-3"
                                placeholder="e.g., Fast 1080p H.265"
                            />
                        </div>

                        <Separator />

                        <h4 className="font-medium text-lg -mb-2">Video</h4>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="videoCodec" className="text-right">Codec</Label>
                            <Select value={formData.videoCodec} onValueChange={(v: VideoCodec) => handleInputChange('videoCodec', v)} >
                                <SelectTrigger className="col-span-3"><SelectValue placeholder="Select video codec..." /></SelectTrigger>
                                <SelectContent>{VIDEO_CODECS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="videoPreset" className="text-right">Preset</Label>
                            <Select value={formData.videoPreset} onValueChange={(v: VideoPreset) => handleInputChange('videoPreset', v)} disabled={formData.videoCodec === 'copy'}>
                                <SelectTrigger className="col-span-3"><SelectValue placeholder="Select preset..." /></SelectTrigger>
                                <SelectContent>{VIDEO_PRESETS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="videoQuality" className="text-right">Quality</Label>
                            <div className="col-span-3 flex items-center gap-4">
                                <Slider 
                                    id="videoQuality"
                                    value={[Number(formData.videoQuality ?? defaultPresetValues.videoQuality)]} 
                                    min={18} 
                                    max={38} 
                                    step={1} 
                                    onValueChange={(v) => handleSliderChange('videoQuality', v)} 
                                    disabled={formData.videoCodec === 'copy'}
                                    className="flex-1 [&>span]:bg-indigo-600"
                                />
                                <span className="text-sm w-8 text-right">{formData.videoQuality ?? defaultPresetValues.videoQuality}</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="videoResolution" className="text-right">Resolution</Label>
                            <Select value={formData.videoResolution} onValueChange={(v: VideoResolution) => handleInputChange('videoResolution', v)} disabled={formData.videoCodec === 'copy'}>
                                <SelectTrigger className="col-span-3"><SelectValue placeholder="Select resolution..." /></SelectTrigger>
                                <SelectContent>
                                    {VIDEO_RESOLUTIONS.map(r => <SelectItem key={r} value={r}>{r === 'original' ? 'Original' : r.toUpperCase()}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="hwAccel" className="text-right">HW Accel</Label>
                            <Select value={formData.hwAccel} onValueChange={(v: HwAccel) => handleInputChange('hwAccel', v)}>
                                <SelectTrigger className="col-span-3"><SelectValue placeholder="Select HW Accel..." /></SelectTrigger>
                                <SelectContent>{HW_ACCEL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>

                        <Separator />

                        <h4 className="font-medium text-lg -mb-2">Audio (Conversion)</h4>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="audioCodecConvert" className="text-right">Codec</Label>
                            <Select value={formData.audioCodecConvert} onValueChange={(v: AudioCodecConvert) => handleInputChange('audioCodecConvert', v)}>
                                <SelectTrigger className="col-span-3"><SelectValue placeholder="Select audio codec..." /></SelectTrigger>
                                <SelectContent>{AUDIO_CODECS_CONVERT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="audioBitrate" className="text-right">Bitrate</Label>
                            <Select value={formData.audioBitrate} onValueChange={(v: string) => handleInputChange('audioBitrate', v)}>
                                <SelectTrigger className="col-span-3"><SelectValue placeholder="Select bitrate..." /></SelectTrigger>
                                <SelectContent>
                                    {['64k', '96k', '128k', '192k', '256k', '320k', '384k', '448k', '640k'].map(r => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="selectedAudioLayout" className="text-right">Layout</Label>
                            <Select value={formData.selectedAudioLayout} onValueChange={(v: AudioLayout) => handleInputChange('selectedAudioLayout', v)}>
                                <SelectTrigger className="col-span-3"><SelectValue placeholder="Select layout..." /></SelectTrigger>
                                <SelectContent>{AUDIO_LAYOUT_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        
                        <Separator />
                        
                        <h4 className="font-medium text-lg -mb-2">Audio Language Order</h4>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label className="text-right pt-2">Track Preference</Label>
                            <div className="col-span-3">
                                <AudioOrderSelector 
                                    orderedLanguages={formData.audioLanguageOrder || []} 
                                    onChange={(newOrder) => handleInputChange('audioLanguageOrder', newOrder)} 
                                />
                            </div>
                        </div>
                        
                        <Separator />

                        <h4 className="font-medium text-lg -mb-2">Subtitles (Conversion)</h4>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="subtitleCodecConvert" className="text-right">Format</Label>
                            <Select value={formData.subtitleCodecConvert} onValueChange={(v: SubtitleCodecConvert) => handleInputChange('subtitleCodecConvert', v)}>
                                <SelectTrigger className="col-span-3"><SelectValue placeholder="Select format..." /></SelectTrigger>
                                <SelectContent>{SUBTITLE_CODECS_CONVERT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>

                        <Separator />
                        
                        <h4 className="font-medium text-lg -mb-2">Subtitle Language Order</h4>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label className="text-right pt-2">Language Preference</Label>
                            <div className="col-span-3">
                                <SubtitleOrderSelector 
                                    orderedLanguages={formData.subtitleLanguageOrder || []} 
                                    onChange={(newOrder) => handleInputChange('subtitleLanguageOrder', newOrder)} 
                                />
                            </div>
                        </div>
                        
                        <h4 className="font-medium text-lg -mb-2 mt-4">Subtitle Type Order</h4>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label className="text-right pt-2">Type Preference</Label>
                            <div className="col-span-3">
                                <SubtitleTypeOrderSelector 
                                    orderedTypes={formData.subtitleTypeOrder || []} 
                                    onChange={(newOrder) => handleInputChange('subtitleTypeOrder', newOrder)} 
                                />
                                <p className="text-xs text-muted-foreground mt-2">
                                    For multiple subtitles of the same language, prioritize according to this type order.
                                </p>
                            </div>
                        </div>

                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                             <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button type="button" onClick={handleSavePreset} className="bg-indigo-600 hover:bg-indigo-700 text-white">Save Preset</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default Presets; 