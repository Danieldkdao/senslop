"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Search, Settings } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SettingsContentsItem } from "./settings-contents-item";
import { cn } from "@/lib/utils";
import type {
  SettingsNavigation,
  SettingsScreen,
  SettingsSection,
} from "../types";

type SettingsDialogProps = {
  children: (
    navigation: SettingsNavigation,
    search: string,
  ) => SettingsSection[];
};

export const SettingsDialog = ({ children }: SettingsDialogProps) => {
  const id = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [screens, setScreens] = useState<SettingsScreen[]>([]);
  const [open, setOpen] = useState(false);
  const navigation: SettingsNavigation = {
    navigate: (screen) => setScreens((current) => [...current, screen]),
    back: () => setScreens((current) => current.slice(0, -1)),
  };
  const sections = children(navigation, search);
  const current = screens.at(-1);
  const jump = (sectionId: string, anchor = false) => {
    setScreens([]);
    requestAnimationFrame(() => {
      const target = document.getElementById(
        anchor ? sectionId : `${id}-${sectionId}`,
      );
      const content = contentRef.current;
      if (content && target)
        content.scrollTo({
          top:
            content.scrollTop +
            target.getBoundingClientRect().top -
            content.getBoundingClientRect().top -
            24,
          behavior: "smooth",
        });
    });
  };
  useEffect(() => {
    if (current)
      document
        .getElementById(`${id}-screen-title`)
        ?.focus({ preventScroll: true });
  }, [current, id]);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setScreens([]);
          setSearch("");
        }
      }}
    >
      <TooltipWrapper content="Settings">
        <DialogTrigger
          render={<Button variant="ghost" size="icon" aria-label="Settings" />}
        >
          <Settings aria-hidden="true" className="size-5" />
        </DialogTrigger>
      </TooltipWrapper>
      <DialogContent className="h-[85dvh] max-h-[55rem] w-[calc(100vw-2rem)] sm:max-w-5xl p-0 gap-0 overflow-hidden text-base">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Appearance, editor, and provider settings on this computer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 h-full flex-col sm:flex-row">
          <aside
            aria-label="Settings contents"
            className="shrink-0 border-b sm:border-b-0 sm:border-r sm:w-56 bg-sidebar p-4 flex flex-col gap-4 min-h-0"
          >
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-2 top-2.5 size-4 text-muted-foreground"
              />
              <Input
                aria-label="Search settings"
                placeholder="Search settings"
                className="pl-8 text-base"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setScreens([]);
                  if (contentRef.current) contentRef.current.scrollTop = 0;
                }}
              />
            </div>
            <nav
              aria-label="Settings sections"
              className="flex sm:flex-col gap-1 overflow-auto min-h-0 max-h-40 sm:max-h-none"
            >
              {sections
                .filter((section) => section.visible !== false)
                .map((section) => (
                  <SettingsContentsItem
                    key={section.id}
                    section={section}
                    searching={!!search.trim()}
                    onSelect={jump}
                  />
                ))}
            </nav>
          </aside>
          <div className="flex flex-1 min-w-0 min-h-0 flex-col">
            <nav
              aria-label="Settings breadcrumb"
              className="flex h-14 shrink-0 items-center gap-2 border-b px-6 pr-12 text-muted-foreground"
            >
              {current && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Back to settings"
                  onClick={navigation.back}
                >
                  <ArrowLeft aria-hidden="true" />
                </Button>
              )}
              <Button
                variant="ghost"
                className="text-base"
                onClick={() => setScreens([])}
              >
                Settings
              </Button>
              {screens.map((screen, index) => (
                <span
                  key={`${screen.id}:${index}`}
                  className="flex min-w-0 items-center gap-2"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                  <Button
                    variant="ghost"
                    className="text-base truncate"
                    onClick={() =>
                      setScreens((current) => current.slice(0, index + 1))
                    }
                  >
                    {screen.label}
                  </Button>
                </span>
              ))}
            </nav>
            <div
              ref={contentRef}
              className={cn(
                "flex-1 min-h-0 overflow-auto px-6 py-7 space-y-10",
                current && "hidden",
              )}
            >
              {sections.map((section) => (
                <section
                  key={section.id}
                  hidden={section.visible === false}
                  id={`${id}-${section.id}`}
                  className="space-y-5 scroll-mt-6"
                >
                  <h2 className="text-xl font-medium">{section.label}</h2>
                  {section.content}
                </section>
              ))}
              {sections.every((section) => section.visible === false) && (
                <p className="text-muted-foreground">No matching settings.</p>
              )}
            </div>
            {current && (
              <div
                key={current.id}
                className="flex-1 min-h-0 overflow-auto px-6 py-7"
              >
                <h2
                  id={`${id}-screen-title`}
                  tabIndex={-1}
                  className="text-xl mb-6 font-medium outline-none"
                >
                  {current.label}
                </h2>
                {current.content}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
