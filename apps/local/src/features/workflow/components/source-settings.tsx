"use client";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { inferencePolicies, projectPolicySchema } from "@senslop/contracts";
import { Shield, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useSettingsAutosave } from "../../settings/hooks/use-settings-autosave";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { formatInferencePolicy } from "../lib/formatters";
import { useProjectSettings } from "../hooks/use-project-settings";

const sourceFormSchema = z.object({
  include: z.string(),
  exclude: z.string(),
  inference: z.enum(inferencePolicies),
  checkTimeoutSeconds: z.number().int().min(1).max(3600),
  historyRetentionDays: z.number().int().min(0).max(3650),
  logRetentionDays: z.number().int().min(1).max(3650),
  workspaceRetentionDays: z.number().int().min(1).max(3650),
});
export type SourceFormSchema = z.infer<typeof sourceFormSchema>;
export const SourceSettings = () => {
  const settings = useProjectSettings();
  const policy = settings.state.data?.policy ?? projectPolicySchema.parse({});
  const [preview, setPreview] = useState<{
    included: string[];
    excluded: string[];
  } | null>(null);
  const form = useForm<SourceFormSchema>({
    resolver: zodResolver(sourceFormSchema),
    mode: "onChange",
    resetOptions: { keepDirtyValues: true },
    values: {
      include: policy.include.join("\n"),
      exclude: policy.exclude.join("\n"),
      inference: policy.inference,
      checkTimeoutSeconds: policy.checkTimeoutSeconds,
      historyRetentionDays: policy.historyRetentionDays ?? 0,
      logRetentionDays: policy.logRetentionDays ?? 30,
      workspaceRetentionDays: policy.workspaceRetentionDays,
    },
  });
  const build = (values: SourceFormSchema) => ({
    ...values,
    historyRetentionDays: values.historyRetentionDays || null,
    include: values.include
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
    exclude: values.exclude
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
  });
  const autosave = useSettingsAutosave({
    form,
    schema: sourceFormSchema,
    enabled: !!settings.state.data && !settings.state.isPending,
    save: async (values) => {
      await settings.save(build(values));
    },
  });
  return (
    <form
      noValidate
      className="flex w-full min-w-0 flex-col gap-4 text-base"
      onSubmit={(event) => {
        event.preventDefault();
        void autosave.flush();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          void autosave.flush();
      }}
    >
      <div className="flex items-center gap-2">
        <Shield aria-hidden="true" className="size-5 text-muted-foreground" />
        <span>Project source & execution policy</span>
      </div>
      <label className="flex w-full flex-col gap-2">
        Included paths
        <Textarea
          {...form.register("include")}
          className="w-full font-mono text-base"
          placeholder="All eligible source when blank; one path or glob per line"
        />
      </label>
      <label className="flex w-full flex-col gap-2">
        Excluded paths
        <Textarea
          {...form.register("exclude")}
          className="w-full font-mono text-base"
          placeholder="One path or glob per line; credential exclusions always apply"
        />
      </label>
      <label className="flex w-full flex-col gap-2">
        Inference routing
        <Controller
          control={form.control}
          name="inference"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger className="w-full text-base">
                <SelectValue>
                  {(() => {
                    const display = formatInferencePolicy(field.value);
                    return (
                      <>
                        <display.Icon aria-hidden="true" className="size-4" />
                        {display.label}
                      </>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="configured" className="text-base">
                  Configured providers
                </SelectItem>
                <SelectItem value="local-only" className="text-base">
                  Local inference only
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </label>
      {[
        {
          name: "historyRetentionDays" as const,
          label: "History retention in days, 0 keeps indefinitely",
        },
        {
          name: "checkTimeoutSeconds" as const,
          label: "Default check timeout in seconds",
        },
        {
          name: "logRetentionDays" as const,
          label: "Check log retention in days",
        },
        {
          name: "workspaceRetentionDays" as const,
          label: "Completed workspace retention in days",
        },
      ].map((field) => (
        <label key={field.name} className="flex w-full flex-col gap-2">
          {field.label}
          <Input
            type="number"
            {...form.register(field.name, { valueAsNumber: true })}
            className="w-full text-base"
          />
        </label>
      ))}
      {Object.values(form.formState.errors).map((error, index) => (
        <span key={index} role="alert" className="text-destructive">
          {error.message}
        </span>
      ))}
      <div className="flex w-full items-center gap-2">
        <TooltipWrapper content="Preview affected paths">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Preview affected paths"
            onClick={async () => {
              try {
                const response = await fetch("/api/project", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "preview",
                    policy: build(form.getValues()),
                  }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message);
                setPreview(data);
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <Eye aria-hidden="true" className="size-5" />
          </Button>
        </TooltipWrapper>
      </div>
      {preview && (
        <div className="flex min-w-0 flex-col gap-2">
          <span>
            {preview.included.length} included / {preview.excluded.length}{" "}
            excluded
          </span>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-base">
            {preview.excluded.join("\n") || "No additional paths excluded."}
          </pre>
        </div>
      )}
      <span className="text-muted-foreground">
        Stricter policies block incompatible analysis. Saved evidence remains
        local until you delete it. Local commands run with your host
        permissions.
      </span>
    </form>
  );
};
