"use client";

import type { ReactNode } from "react";
import { BookOpenText, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const FileOverview = ({ children }: { children: ReactNode }) => (
  <section aria-label="File overview" className="shrink-0 border-b text-base">
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-base font-medium text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <BookOpenText
          aria-hidden="true"
          className="size-5 shrink-0 text-primary"
        />
        File overview
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]/collapsible-trigger:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  </section>
);
