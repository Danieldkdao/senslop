"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { useProviderModels } from "../hooks/use-provider-models";
import { formatProvider } from "../lib/formatters";

type ProviderModelStatusProps = {
  entry: ReturnType<typeof useProviderModels>["entries"][number];
};

export const ProviderModelStatus = ({ entry }: ProviderModelStatusProps) => {
  const message = entry.error?.message ?? entry.catalog?.message;
  return (
    <div className="flex flex-col gap-2 text-base">
      <p className="font-medium">Model discovery</p>
      {entry.pending ? (
        <p role="status" className="text-muted-foreground">
          Loading models…
        </p>
      ) : (
        <>
          <p
            role={entry.error ? "alert" : "status"}
            className={cn(
              entry.error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {message ??
              `${entry.catalog?.models.length ?? 0} models available.`}
          </p>
          <Button
            variant="outline"
            className="self-start text-base"
            onClick={() => void entry.refetch()}
          >
            {message ? "Retry" : "Refresh"}{" "}
            {formatProvider(entry.connection.provider).label} models
          </Button>
        </>
      )}
    </div>
  );
};
