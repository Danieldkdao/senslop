"use client";

import { z } from "zod";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { History, Trash2, ExternalLink } from "lucide-react";
import {
  memoryGuidanceSchema,
  type MemoryGuidanceSchema,
  type ProjectMemorySchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useConfirm } from "@/hooks/use-confirm";
import { useSettingsAutosave } from "../../settings/hooks/use-settings-autosave";
import { useProjectMemory } from "../hooks/use-project-memory";

const MemoryEntry = ({ entry }: { entry: ProjectMemorySchema }) => {
  const memory = useProjectMemory();
  const form = useForm<
    z.input<typeof memoryGuidanceSchema>,
    unknown,
    MemoryGuidanceSchema
  >({
    resolver: zodResolver(memoryGuidanceSchema),
    values: entry,
    resetOptions: { keepDirtyValues: true },
  });
  useSettingsAutosave({
    form,
    schema: memoryGuidanceSchema,
    save: (guidance) =>
      memory.act({
        action: "update",
        id: entry.id,
        version: entry.version,
        guidance,
      }),
  });
  const { confirm, ConfirmationDialog } = useConfirm(
    "Remove this guidance?",
    "Future reviews will stop using this remembered decision.",
  );
  return (
    <div className="flex flex-col gap-3 border-b pb-4">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-2">
          <span className="flex-1">Project guidance</span>
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <Switch
                aria-label="Enable project guidance"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <TooltipWrapper content="View original review">
            <Button
              variant="ghost"
              size="icon"
              aria-label="View original review"
              onClick={() =>
                window.open(
                  `/?review=${entry.review.id}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <ExternalLink />
            </Button>
          </TooltipWrapper>
          <TooltipWrapper content="Remove guidance">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove guidance"
              onClick={async () => {
                if (await confirm())
                  await memory.act({
                    action: "remove",
                    id: entry.id,
                    version: entry.version,
                  });
              }}
            >
              <Trash2 />
            </Button>
          </TooltipWrapper>
        </div>
        <label className="flex flex-col gap-1">
          Guidance
          <Textarea className="w-full text-base" {...form.register("text")} />
        </label>
        {form.formState.errors.text && (
          <p role="alert">{form.formState.errors.text.message}</p>
        )}
        <label className="flex flex-col gap-1">
          Applies to
          <Input
            className="w-full font-mono text-base"
            {...form.register("paths.0")}
          />
        </label>
        <label className="flex flex-col gap-1">
          Assumption
          <Textarea
            className="w-full text-base"
            {...form.register("assumption")}
          />
        </label>
      </form>
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-2">
          <History className="size-4" />
          History and origin
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 pt-2">
          <p>
            Round {entry.review.round}{" "}
            <span className="font-mono">{entry.review.hash.slice(0, 12)}</span>
          </p>
          {entry.history.map((item, index) => (
            <p key={index}>
              {item.text}
              <br />
              <time>{item.updatedAt}</time>
            </p>
          ))}
        </CollapsibleContent>
      </Collapsible>
      {ConfirmationDialog}
    </div>
  );
};

export const ProjectMemorySettings = () => {
  const memory = useProjectMemory();
  const [search, setSearch] = useState("");
  return (
    <div className="flex flex-col gap-4 text-base">
      <p className="text-muted-foreground">
        Remembered decisions guide future reviews without automatically
        dismissing findings.
      </p>
      <div className="-mx-6">
        <Input
          variant="search"
          className="h-10 w-full px-6"
          aria-label="Search project memory"
          placeholder="Search project memory"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {memory.state.error && <p role="alert">{memory.state.error.message}</p>}
      {memory.state.data
        ?.filter((entry) =>
          `${entry.text} ${entry.paths.join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map((entry) => (
          <MemoryEntry key={entry.id} entry={entry} />
        ))}
      {memory.state.data?.length === 0 && (
        <p className="text-muted-foreground">
          Remember a finding decision or note to add project guidance.
        </p>
      )}
    </div>
  );
};
