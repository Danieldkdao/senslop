"use client";

import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type TooltipWrapperProps = {
  children: ReactElement<{ disabled?: boolean }>;
  content: string;
  className?: string;
};

export const TooltipWrapper = ({
  children,
  content,
  className,
}: TooltipWrapperProps) => (
  <Tooltip>
    {/* Keep the hover target stable when loading enables or replaces the button. */}
    <TooltipTrigger
      render={
        <span
          className={cn("inline-flex shrink-0", className)}
          tabIndex={children.props.disabled ? 0 : undefined}
          aria-label={children.props.disabled ? content : undefined}
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent className="text-base">{content}</TooltipContent>
  </Tooltip>
);
