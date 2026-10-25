"use client";

import { SourceSearchDialog } from "../../precision/components/source-search-dialog";
import type { SourceLocationSchema } from "../../precision/schemas";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import type { PreviewFileSchema } from "@senslop/contracts";
import { FileIcon } from "@/components/file-icon";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { GroupingSchema } from "../../agents/schemas";

type FileSearchDialogProps = {
  review?: ReviewIdentitySchema | null;
  onSource?: (location: SourceLocationSchema) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: PreviewFileSchema[];
  grouping?: GroupingSchema | null;
  selectedPath?: string;
  onSelect: (path: string) => void;
};

export const FileSearchDialog = ({
  review,
  onSource,
  open,
  onOpenChange,
  files,
  grouping,
  selectedPath,
  onSelect,
}: FileSearchDialogProps) => {
  if (review && onSource)
    return (
      <SourceSearchDialog
        open={open}
        onOpenChange={onOpenChange}
        review={review}
        files={files}
        onSelect={onSelect}
        onSource={onSource}
      />
    );
  const renderFile = (file: PreviewFileSchema, groupTitle?: string) => (
    // cmdk emits data-selected for both states; override the primitive's presence selector.
    <CommandItem
      key={file.path}
      value={file.path}
      keywords={groupTitle ? [groupTitle] : []}
      data-checked={file.path === selectedPath}
      className="gap-3 bg-transparent! py-3 text-base data-[selected=true]:bg-muted!"
      onSelect={() => {
        onSelect(file.path);
        onOpenChange(false);
      }}
    >
      <FileIcon fileName={file.path} />
      <span className="min-w-0 flex-1 break-all font-mono">{file.path}</span>
    </CommandItem>
  );
  return (
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
          {grouping
            ? grouping.groups.map((group, index) => (
                <CommandGroup
                  key={`${index}:${group.title}`}
                  heading={group.title}
                  className="**:[[cmdk-group-heading]]:text-base"
                >
                  {group.files.map((member) => {
                    const file = files.find(
                      (file) => file.path === member.path,
                    );
                    return file ? renderFile(file, group.title) : null;
                  })}
                </CommandGroup>
              ))
            : files.map((file) => renderFile(file))}
        </CommandList>
        <p className="border-t px-3 py-2 text-base text-muted-foreground">
          ↑ ↓ to browse, Enter to open, Esc to close
        </p>
      </Command>
    </CommandDialog>
  );
};
