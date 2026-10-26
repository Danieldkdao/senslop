"use client";

import { useEffect } from "react";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { toast } from "@/components/ui/toast";
import { useAppInfo } from "../hooks/use-app-info";

export const UpdateNotice = () => {
  const info = useAppInfo();
  const version = info.data?.update.available ? info.data.update.latest : null;
  useEffect(() => {
    if (!version || sessionStorage.getItem("senslop:update-notice") === version)
      return;
    sessionStorage.setItem("senslop:update-notice", version);
    toast.info(`Senslop ${version} is available in Settings → About.`);
  }, [version]);
  return version ? (
    <TooltipWrapper content={`Update to Senslop ${version} (U)`}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Update available"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("senslop-open-settings", { detail: "about" }),
          )
        }
      >
        <PackagePlus className="size-5" />
      </Button>
    </TooltipWrapper>
  ) : null;
};
