"use client";

import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type TooltipWrapperProps = {
  children: ReactElement<{ disabled?: boolean }>;
  content: string;
};

export const TooltipWrapper = ({ children, content }: TooltipWrapperProps) => (
  <Tooltip>
    {children.props.disabled ? (
      // Disabled controls cannot receive hover/focus; keep their hint on a neutral wrapper.
      <TooltipTrigger
        render={
          <span
            className="inline-flex shrink-0"
            tabIndex={0}
            aria-label={content}
          />
        }
      >
        {children}
      </TooltipTrigger>
    ) : (
      <TooltipTrigger render={children} />
    )}
    <TooltipContent className="text-base">{content}</TooltipContent>
  </Tooltip>
);
