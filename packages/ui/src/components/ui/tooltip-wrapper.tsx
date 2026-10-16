"use client";

import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type TooltipWrapperProps = {
  children: ReactElement<{ disabled?: boolean }>;
  content: string;
};

export const TooltipWrapper = ({ children, content }: TooltipWrapperProps) => (
  <Tooltip>
    {/* Keep the hover target stable when loading enables or replaces the button. */}
    <TooltipTrigger
      render={
        <span
          className="inline-flex shrink-0"
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
