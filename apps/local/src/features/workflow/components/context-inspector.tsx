"use client";

import { useState } from "react";
import { ShieldCheck, Check } from "lucide-react";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/components/file-icon";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useReviewContext } from "../hooks/use-review-context";
import { formatUsageMetric, formatModelRoute } from "../lib/formatters";

export const ContextInspector = ({
  review,
}: {
  review: ReviewIdentitySchema;
}) => {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const context = useReviewContext(review, open, path);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipWrapper content="Captured context & model routing">
        <PopoverTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Captured context and model routing"
            />
          }
        >
          <ShieldCheck aria-hidden="true" className="size-5" />
        </PopoverTrigger>
      </TooltipWrapper>
      <PopoverContent className="flex max-h-[75vh] w-[32rem] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto text-base">
        <PopoverTitle>Context & model routing</PopoverTitle>
        {context.isPending && (
          <span role="status">Loading captured context…</span>
        )}
        {context.error && (
          <span role="alert" className="text-destructive">
            {context.error.message}
          </span>
        )}
        {context.data && (
          <>
            <span className="text-muted-foreground">
              Stored locally. Configured inference can receive these files
              through source tools. Next requests use the routes below; saved
              runs retain their recorded model.
            </span>
            {context.data.routes.map((route) => {
              const display = formatModelRoute(route.local);
              return (
                <div
                  key={route.role}
                  className="flex min-w-0 items-center gap-2"
                >
                  <TooltipWrapper content={display.label}>
                    <display.Icon
                      aria-label={display.label}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </TooltipWrapper>
                  <span className="shrink-0">
                    {formatUsageMetric(route.role)}
                  </span>
                  <TooltipWrapper
                    content={route.endpoint ?? "No model assigned"}
                  >
                    <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">
                      {route.model ?? "Unassigned"}
                    </span>
                  </TooltipWrapper>
                </div>
              );
            })}
            <Select value={path} onValueChange={setPath}>
              <SelectTrigger
                className="w-full font-mono text-base"
                aria-label="Captured context file"
              >
                <SelectValue
                  placeholder={`${context.data.files.length} captured files`}
                />
              </SelectTrigger>
              <SelectContent>
                {context.data.files.map((file) => (
                  <SelectItem
                    key={file}
                    value={file}
                    className="font-mono text-base"
                  >
                    <FileIcon fileName={file} />
                    {file}
                    {context.data.selected.includes(file) && (
                      <Check aria-label="Selected change" className="size-4" />
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {context.data.source && (
              <div className="flex flex-col gap-2">
                {[
                  { label: "Before", contents: context.data.source.before },
                  { label: "After", contents: context.data.source.after },
                ]
                  .filter((side) => side.contents !== null)
                  .map((side) => (
                    <div key={side.label} className="flex flex-col gap-2">
                      <span className="font-medium">{side.label}</span>
                      <pre className="max-h-56 overflow-auto rounded-md bg-muted/30 p-3 font-mono text-base">
                        {side.contents}
                      </pre>
                    </div>
                  ))}
              </div>
            )}
            {!!context.data.limitations.length && (
              <ul className="flex list-disc flex-col gap-2 pl-4 text-muted-foreground">
                {[...new Set(context.data.limitations)].map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
