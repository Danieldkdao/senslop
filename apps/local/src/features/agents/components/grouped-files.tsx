"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { GroupingSchema } from "../schemas";
import type { LivePreview } from "../../review/types";
import { PreviewFileItem } from "../../review/components/preview-file-item";

export const GroupedFiles = ({
  grouping,
  preview,
  selectedPath,
  search,
  onSelect,
}: {
  grouping: GroupingSchema;
  preview: LivePreview;
  selectedPath?: string;
  search: string;
  onSelect: (path: string) => void;
}) => {
  return grouping.groups.map((group, index) => (
    <ReviewFileGroup
      key={JSON.stringify([
        preview.id,
        index,
        group.title,
        group.files.map((file) => file.path),
      ])}
      group={group}
      preview={preview}
      selectedPath={selectedPath}
      search={search}
      onSelect={onSelect}
    />
  ));
};

const ReviewFileGroup = ({
  group,
  preview,
  selectedPath,
  search,
  onSelect,
}: {
  group: GroupingSchema["groups"][number];
  preview: LivePreview;
  selectedPath?: string;
  search: string;
  onSelect: (path: string) => void;
}) => {
  const query = search.toLowerCase();
  const reviewed = group.files.filter((file) =>
    preview.completedPaths?.includes(file.path),
  ).length;
  const complete = reviewed === group.files.length;
  const files = group.files.filter(
    (file) =>
      !query ||
      group.title.toLowerCase().includes(query) ||
      file.path.toLowerCase().includes(query),
  );
  const selected = group.files.some((file) => file.path === selectedPath);
  const [state, setState] = useState({
    complete,
    selectedPath,
    open: !complete && selected,
  });
  let open = state.open;
  if (state.complete !== complete || state.selectedPath !== selectedPath) {
    // Completion wins over selection so finishing the active file closes its group.
    open =
      state.complete !== complete ? !complete : selected ? true : state.open;
    setState({ complete, selectedPath, open });
  }
  if (!files.length) return null;
  return (
    <Collapsible
      open={!!query || open}
      onOpenChange={(open) => setState({ complete, selectedPath, open })}
      className="flex flex-col gap-1"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-base hover:bg-sidebar-accent",
          complete && "bg-success/10 text-success",
        )}
      >
        {complete ? (
          <Check aria-hidden="true" className="size-4 shrink-0" />
        ) : (
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{group.title}</span>
          {complete && <span className="sr-only">Group reviewed</span>}
        </span>
        <span>
          {reviewed}/{group.files.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-2">
        {files.map((member) => {
          const file = preview.files.find((file) => file.path === member.path);
          return file ? (
            <PreviewFileItem
              key={member.path}
              file={file}
              completed={!!preview.completedPaths?.includes(file.path)}
              selected={file.path === selectedPath}
              onSelect={onSelect}
            />
          ) : null;
        })}
      </CollapsibleContent>
    </Collapsible>
  );
};
