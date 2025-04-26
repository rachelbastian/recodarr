import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "src/components/ui/alert-dialog";
import { Badge } from "src/components/ui/badge";

interface ProcessedFileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  date: string;
  videoCodec: string;
  audioCodec: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  isReencode?: boolean; // Used for stronger warning when re-encoding
}

export function ProcessedFileDialog({
  isOpen,
  onOpenChange,
  title,
  message,
  date,
  videoCodec,
  audioCodec,
  onCancel,
  onConfirm,
  cancelLabel = "Cancel",
  confirmLabel = "Proceed",
  isReencode = false,
}: ProcessedFileDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="text-orange-500">⚠️</span> {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base text-gray-300">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-3 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Previously processed on:</span>
            <Badge variant="outline" className="font-mono">
              {date}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Video codec:</span>
            <Badge variant="secondary" className="bg-indigo-950/40">
              {videoCodec}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Audio codec:</span>
            <Badge variant="secondary" className="bg-indigo-950/40">
              {audioCodec}
            </Badge>
          </div>
          {isReencode && (
            <div className="mt-2 rounded-md bg-red-950/30 p-2.5 text-sm text-red-300">
              ⚠️ Re-encoding will cause quality degradation. Only proceed if necessary.
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={isReencode ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 