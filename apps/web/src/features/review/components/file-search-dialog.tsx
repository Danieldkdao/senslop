"use client";

import type { PreviewFileSchema } from "@senslop/contracts";
import { FileIcon } from "@/components/file-icon";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type FileSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: PreviewFileSchema[];
  selectedPath?: string;
  onSelect: (path: string) => void;
};

export const FileSearchDialog = ({
  open,
  onOpenChange,
  files,
  selectedPath,
  onSelect,
}: FileSearchDialogProps) => (
  <CommandDialog
    open={open}
    onOpenChange={onOpenChange}
    title="Find a file"
    description="Search changed files and press Enter to open one."
    className="text-base sm:max-w-xl"
  >
    <Command label="Search files">
      <CommandInput
        autoFocus
        placeholder="Type a file name or path…"
        className="text-base"
      />
      <CommandList aria-label="Changed files" className="max-h-96">
        <CommandEmpty className="text-base">No files found.</CommandEmpty>
        {files.map((file) => (
          // cmdk emits data-selected for both states; override the primitive's presence selector.
          <CommandItem
            key={file.path}
            value={file.path}
            data-checked={file.path === selectedPath}
            className="gap-3 bg-transparent! py-3 text-base data-[selected=true]:bg-muted!"
            onSelect={() => {
              onSelect(file.path);
              onOpenChange(false);
            }}
          >
            <FileIcon fileName={file.path} />
            <span className="min-w-0 flex-1 break-all">{file.path}</span>
          </CommandItem>
        ))}
      </CommandList>
      <p className="border-t px-3 py-2 text-base text-muted-foreground">
        ↑ ↓ to browse · Enter to open · Esc to close
      </p>
    </Command>
  </CommandDialog>
);
