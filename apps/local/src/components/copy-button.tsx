"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { toast } from "@/components/ui/toast";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";

export const CopyButton = ({
  text,
  label = "Copy response",
}: {
  text: string;
  label?: string;
}) => {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  const copied = copiedText === text;
  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      if (timeout.current) clearTimeout(timeout.current);
      setCopiedText(text);
      timeout.current = setTimeout(() => setCopiedText(null), 2000);
    } catch {
      toast.error("Could not copy. Allow clipboard access and retry.");
    } finally {
      setCopying(false);
    }
  };
  return (
    <TooltipWrapper content={copied ? "Copied" : label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={copying || !text}
        aria-label={copied ? "Copied response" : label}
        onClick={copy}
      >
        <LoadingSwap isLoading={copying}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </LoadingSwap>
      </Button>
    </TooltipWrapper>
  );
};
