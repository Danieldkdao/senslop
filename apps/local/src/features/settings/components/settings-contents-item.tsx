"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { SettingsSection } from "../types";

type SettingsContentsItemProps = {
  section: SettingsSection;
  searching: boolean;
  onSelect: (id: string, anchor?: boolean) => void;
};

export const SettingsContentsItem = ({
  section,
  searching,
  onSelect,
}: SettingsContentsItemProps) =>
  section.links?.length ? (
    <Collapsible
      key={String(searching)}
      defaultOpen={searching}
      className="group/section flex shrink-0 flex-col gap-1"
    >
      <CollapsibleTrigger
        render={<Button variant="ghost" className="w-full min-w-0 text-base" />}
      >
        <span className="flex-1 min-w-0 shrink-0 text-start">
          {section.label}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 transition-transform group-data-open/section:rotate-90 shrink-0"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1">
        {section.links.map((link) => (
          <Button
            key={link.id}
            variant="ghost"
            className="w-full justify-start pl-7 text-base text-muted-foreground"
            onClick={link.onSelect ?? (() => onSelect(link.id, true))}
          >
            {link.label}
          </Button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  ) : (
    <Button
      variant="ghost"
      className="justify-start text-base"
      onClick={() => onSelect(section.id)}
    >
      {section.label}
    </Button>
  );
