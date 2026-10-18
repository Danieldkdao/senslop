"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockLine,
} from "@/components/ui/code-block";
import { useHighlightedCode } from "@senslop/ui/hooks/use-highlighted-code";

const PromptContent = ({ prompt }: { prompt: string }) => {
  const lines = useHighlightedCode(prompt, "markdown");
  return (
    <CodeBlock className="rounded-t-none border-0 bg-transparent text-base dark:bg-transparent">
      <CodeBlockActions>
        <CodeBlockCopyButton value={prompt} />
      </CodeBlockActions>
      <CodeBlockContent
        wrap
        className="max-h-96 pr-14 [&>code]:grid-cols-[minmax(0,1fr)]"
      >
        {lines.map((line, index) => (
          <CodeBlockLine key={index} className="min-w-0 wrap-anywhere">
            {line}
          </CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  );
};

export const FixPrompt = ({
  prompt,
  secondary = false,
}: {
  prompt: string;
  secondary?: boolean;
}) => (
  <Collapsible
    className={cn(
      "min-w-0 overflow-hidden rounded-md border",
      secondary
        ? "border-transparent bg-secondary text-secondary-foreground"
        : "bg-background text-foreground",
    )}
  >
    <CollapsibleTrigger className="group/fix flex w-full items-center justify-between gap-2 px-4 py-2 text-base font-medium outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
      <span>Fix with agent prompt</span>
      <ChevronDown
        aria-hidden="true"
        className="size-4 shrink-0 transition-transform group-data-panel-open/fix:rotate-180 motion-reduce:transition-none"
      />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <PromptContent prompt={prompt} />
    </CollapsibleContent>
  </Collapsible>
);
