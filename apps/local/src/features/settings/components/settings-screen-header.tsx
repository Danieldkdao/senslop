import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SettingsScreenHeaderProps = ComponentProps<"h2"> & {
  actions?: ReactNode;
};

export const SettingsScreenHeader = ({
  actions,
  className,
  ...props
}: SettingsScreenHeaderProps) => (
  <div className={cn("flex items-center gap-2 min-w-0", className)}>
    <div className="flex-1 min-w-0">
      <h2
        className="text-xl font-medium outline-none wrap-break-word"
        {...props}
      />
    </div>
    {actions && <div className="shrink-0">{actions}</div>}
  </div>
);
