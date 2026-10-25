"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import type { PreviewFileSchema } from "@senslop/contracts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { FileIcon } from "@/components/file-icon";
import { PreviewDiff } from "../../review/components/preview-diff";
import { useUiPreferences } from "../../settings/hooks/use-ui-preferences";

export const ChangeInspector = ({
  open,
  onOpenChange,
  title,
  description,
  files,
  children,
  initialPath,
  evidence,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  files: PreviewFileSchema[];
  children?: ReactNode;
  initialPath?: string;
  evidence?: { side: "before" | "after"; start: number; end: number };
}) => {
  const [path, setPath] = useState<string | undefined>(initialPath);
  const ui = useUiPreferences();
  const selected = files.find((file) => file.path === path) ?? files[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[95vw] max-w-[95vw]! min-w-0 flex-col gap-3 overflow-hidden p-4 text-base">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {selected ? (
          <>
            <Select
              value={selected.path}
              onValueChange={(value) => value && setPath(value)}
            >
              <SelectTrigger
                aria-label="Comparison file"
                className="w-full font-mono text-base"
              >
                <SelectValue>
                  <FileIcon fileName={selected.path} />
                  {selected.path}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {files.map((file) => (
                  <SelectItem
                    key={file.path}
                    value={file.path}
                    className="font-mono text-base"
                  >
                    {file.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div data-review-scroll className="min-h-0 flex-1 overflow-auto">
              <PreviewDiff
                key={selected.path}
                file={selected}
                view={ui.values.view}
                settings={ui.values.editor}
                notes={[]}
                onAddComment={() => {}}
                onDeleteNote={() => {}}
                evidence={selected.path === initialPath ? evidence : undefined}
                readOnly
              />
            </div>
          </>
        ) : (
          <span role="status" className="p-4 text-muted-foreground">
            No changed files between these sources.
          </span>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
};
