"use client";

import { useState } from "react";
import { Braces, Files, Search } from "lucide-react";
import type {
  PreviewFileSchema,
  ReviewIdentitySchema,
} from "@senslop/contracts";
import {
  ExpandingTabs,
  ExpandingTabsPanel,
} from "@senslop/ui/components/expanding-tabs";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FileIcon } from "@/components/file-icon";
import {
  useSourceExplorer,
  useSourceSearch,
} from "../hooks/use-source-explorer";
import type { SourceLocationSchema } from "../schemas";

export const SourceSearchDialog = ({
  open,
  onOpenChange,
  review,
  files,
  onSelect,
  onSource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: ReviewIdentitySchema;
  files: PreviewFileSchema[];
  onSelect: (path: string) => void;
  onSource: (location: SourceLocationSchema) => void;
}) => {
  const [mode, setMode] = useState("files");
  const [query, setQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(true);
  const [side, setSide] = useState<"before" | "after">("after");
  const explorer = useSourceExplorer(open ? review : null, side);
  const search = useSourceSearch(
    review,
    query,
    open && mode === "content",
    side,
  );
  const changedPaths = new Set(files.map((file) => file.path));
  const paths = (
    changedOnly
      ? files.map((file) => file.path)
      : (explorer.data?.files ?? files.map((file) => file.path))
  ).filter((path) => path.toLowerCase().includes(query.toLowerCase()));
  const symbols =
    explorer.data?.symbols.filter(
      (symbol) =>
        (!changedOnly || changedPaths.has(symbol.path)) &&
        `${symbol.name} ${symbol.path}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];
  const matches =
    search.data?.filter(
      (match) => !changedOnly || changedPaths.has(match.path),
    ) ?? [];
  const select = (location: SourceLocationSchema) => {
    if (mode === "files" && side === "after" && changedPaths.has(location.path))
      onSelect(location.path);
    else onSource(location);
    onOpenChange(false);
  };
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Find a file"
      description="Search paths, symbols, and source in this frozen review."
      className="text-base sm:max-w-2xl"
    >
      <Command shouldFilter={false} label="Search frozen review">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search frozen files, symbols, or source…"
          className="text-base"
        />
        <ExpandingTabs
          value={mode}
          variant="transparent"
          onValueChange={setMode}
          aria-label="Search mode"
          items={[
            {
              value: "files",
              label: "Files",
              icon: <Files />,
              detail: paths.length,
            },
            {
              value: "symbols",
              label: "Symbols",
              icon: <Braces />,
              detail: symbols.length,
            },
            {
              value: "content",
              label: "Content",
              icon: <Search />,
              detail: matches.length,
            },
          ]}
          listClassName="mx-2 my-2 w-auto"
          className="gap-0"
        >
          <div className="flex items-center gap-3 px-3 pb-2">
            <label className="flex flex-1 items-center gap-2">
              <Checkbox
                checked={changedOnly}
                onCheckedChange={(value) => setChangedOnly(value === true)}
              />
              Changed files only
            </label>
            <Select
              value={side}
              onValueChange={(value) => {
                if (value === "before" || value === "after") setSide(value);
              }}
            >
              <SelectTrigger
                aria-label="Source side"
                className="w-full max-w-40 text-base bg-background! border-none! shadow-none!"
              >
                <SelectValue>
                  {side === "after" ? "After" : "Before"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="after">After</SelectItem>
                <SelectItem value="before">Before</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ExpandingTabsPanel value="files">
            <CommandList className="max-h-96">
              <CommandEmpty>No files found.</CommandEmpty>
              {paths.slice(0, 200).map((path) => (
                <CommandItem
                  value={path}
                  key={path}
                  className="gap-3 py-3 text-base"
                  onSelect={() => select({ path, side })}
                >
                  <FileIcon fileName={path} />
                  <span className="break-all font-mono">{path}</span>
                </CommandItem>
              ))}
            </CommandList>
          </ExpandingTabsPanel>
          <ExpandingTabsPanel value="symbols">
            <CommandList className="max-h-96">
              <CommandEmpty>
                {explorer.isPending
                  ? "Loading captured symbols…"
                  : "No captured symbols found."}
              </CommandEmpty>
              {symbols.slice(0, 200).map((symbol) => (
                <CommandItem
                  key={`${symbol.path}:${symbol.start}:${symbol.name}`}
                  value={`${symbol.path}:${symbol.start}:${symbol.name}`}
                  className="flex flex-col items-start gap-1 py-3 text-base"
                  onSelect={() =>
                    select({
                      path: symbol.path,
                      side,
                      start: symbol.start,
                      end: symbol.end,
                    })
                  }
                >
                  <span className="font-mono">{symbol.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {symbol.path}:{symbol.start}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </ExpandingTabsPanel>
          <ExpandingTabsPanel value="content">
            <CommandList className="max-h-96">
              <CommandEmpty>
                {search.isFetching
                  ? "Searching frozen source…"
                  : query.trim()
                    ? "No captured source matches."
                    : "Enter source text to search."}
              </CommandEmpty>
              {matches.map((match) => (
                <CommandItem
                  value={`${match.path}:${match.start}`}
                  key={`${match.path}:${match.start}`}
                  className="flex flex-col items-start gap-1 py-3 text-base"
                  onSelect={() => select(match)}
                >
                  <span className="font-mono">
                    {match.path}:{match.start}
                  </span>
                  <span className="max-w-full truncate font-mono text-muted-foreground">
                    {match.code}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </ExpandingTabsPanel>
        </ExpandingTabs>
        {(explorer.error || search.error) && (
          <p role="alert" className="px-3 py-2 text-muted-foreground">
            {explorer.error?.message ?? search.error?.message}
          </p>
        )}
      </Command>
    </CommandDialog>
  );
};
