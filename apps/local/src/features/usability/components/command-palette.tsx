"use client";

import { useState } from "react";
import {
  Command as CommandIcon,
  Search,
  Settings,
  History,
  Plus,
  Focus,
  GitBranch,
  FileText,
  Bot,
  Info,
} from "lucide-react";
import { useKeyboardShortcuts } from "@senslop/ui/hooks/use-keyboard-shortcuts";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";

export const CommandPalette = ({
  onSearch,
  onFocus,
  hasReview,
}: {
  onSearch: () => void;
  onFocus: () => void;
  hasReview: boolean;
}) => {
  const [open, setOpen] = useState(false);
  useKeyboardShortcuts([{ hotkey: "Mod+K", callback: () => setOpen(true) }], {
    enabled: !open,
  });
  const emit = (name: string) => window.dispatchEvent(new Event(name));
  const commands = [
    { label: "Find a file", Icon: Search, run: onSearch, disabled: !hasReview },
    {
      label: "Create a review",
      Icon: Plus,
      run: () => emit("senslop-new-review"),
    },
    {
      label: "Open saved reviews",
      Icon: History,
      run: () => emit("senslop-history"),
    },
    {
      label: "Toggle focused reading",
      Icon: Focus,
      run: onFocus,
      disabled: !hasReview,
    },
    { label: "Open Git", Icon: GitBranch, run: () => emit("senslop-git") },
    {
      label: "Open review report",
      Icon: FileText,
      run: () => emit("senslop-report"),
      disabled: !hasReview,
    },
    {
      label: "AI settings",
      Icon: Bot,
      run: () =>
        window.dispatchEvent(
          new CustomEvent("senslop-open-settings", { detail: "ai" }),
        ),
    },
    {
      label: "Settings",
      Icon: Settings,
      run: () =>
        window.dispatchEvent(
          new CustomEvent("senslop-open-settings", { detail: "appearance" }),
        ),
    },
    {
      label: "About and diagnostics",
      Icon: Info,
      run: () =>
        window.dispatchEvent(
          new CustomEvent("senslop-open-settings", { detail: "about" }),
        ),
    },
    { label: "Setup guide", Icon: Info, run: () => emit("senslop-setup") },
  ];
  return (
    <>
      <TooltipWrapper content="Commands (⌘/Ctrl+K)">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Commands"
          onClick={() => setOpen(true)}
        >
          <CommandIcon className="size-5" />
        </Button>
      </TooltipWrapper>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Commands"
        description="Search workspace actions."
      >
        <Command>
          <CommandInput placeholder="Search commands" />
          <CommandList>
            <CommandEmpty>No matching commands.</CommandEmpty>
            {commands.map((item) => (
              <CommandItem
                key={item.label}
                disabled={item.disabled}
                onSelect={() => {
                  setOpen(false);
                  requestAnimationFrame(item.run);
                }}
              >
                <item.Icon />
                {item.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
};
