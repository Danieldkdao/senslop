"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Play, ShieldAlert } from "lucide-react";
import type { CheckRunSchema, TrackedFindingSchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { WorkflowActionSchema } from "../schemas";

const checkFormSchema = z.object({
  command: z.string().trim().min(1, "Choose a command.").max(5000),
  artifacts: z.string(),
  cwd: z.string(),
  timeoutSeconds: z.number().int().min(1).max(3600),
  reuseCheckId: z.string(),
  compareWithBase: z.boolean(),
  findingIds: z.array(z.string()),
});
export type CheckFormSchema = z.infer<typeof checkFormSchema>;
export const CheckForm = ({
  onAction,
  checks,
  suggestedCommands = [],
  findingIds: initialFindingIds = [],
  findings = [],
  defaultTimeout = 600,
}: {
  onAction: (operation: WorkflowActionSchema) => Promise<unknown>;
  checks: CheckRunSchema[];
  suggestedCommands?: string[];
  findingIds?: string[];
  findings?: TrackedFindingSchema[];
  defaultTimeout?: number;
}) => {
  const form = useForm<CheckFormSchema>({
    resolver: zodResolver(checkFormSchema),
    defaultValues: {
      command: "",
      artifacts: "",
      cwd: ".",
      timeoutSeconds: defaultTimeout,
      reuseCheckId: "",
      compareWithBase: false,
      findingIds: initialFindingIds,
    },
  });
  const findingIds = useWatch({ control: form.control, name: "findingIds" });
  const reuseCheckId = useWatch({
    control: form.control,
    name: "reuseCheckId",
  });
  const compareWithBase = useWatch({
    control: form.control,
    name: "compareWithBase",
  });
  const reusable = checks.filter(
    (check) =>
      check.sourceSide === "changed" &&
      check.ownerPid === null &&
      check.manifestId &&
      !["queued", "running"].includes(check.status),
  );
  return (
    <form
      noValidate
      className="flex w-full min-w-0 flex-col gap-3"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await onAction({
            action: "start-check",
            command: values.command,
            artifactPaths: values.artifacts
              .split(",")
              .map((path) => path.trim())
              .filter(Boolean),
            cwd: values.cwd,
            timeoutSeconds: values.timeoutSeconds,
            findingIds: values.findingIds,
            compareWithBase: values.compareWithBase,
            ...(values.reuseCheckId
              ? { reuseCheckId: values.reuseCheckId }
              : {}),
          });
        } catch {}
      })}
    >
      {!!findings.length && (
        <fieldset className="flex w-full flex-col gap-2">
          <legend className="pb-2">Related findings, optional</legend>
          {findings
            .filter((finding) => !finding.duplicateOf)
            .map((finding) => (
              <label key={finding.id} className="flex items-start gap-2">
                <Checkbox
                  className="mt-1"
                  checked={findingIds.includes(finding.id)}
                  onCheckedChange={(checked) =>
                    form.setValue(
                      "findingIds",
                      checked
                        ? [...form.getValues("findingIds"), finding.id]
                        : form
                            .getValues("findingIds")
                            .filter((id) => id !== finding.id),
                    )
                  }
                />
                <span className="min-w-0 wrap-break-word">
                  {finding.observations.at(-1)?.evidence.title}
                </span>
              </label>
            ))}
        </fieldset>
      )}
      {!!suggestedCommands.length && (
        <Select
          value={null}
          onValueChange={(value) =>
            value && form.setValue("command", value, { shouldValidate: true })
          }
        >
          <SelectTrigger
            aria-label="Suggested project check"
            className="w-full text-base"
          >
            <SelectValue placeholder="Choose a project script" />
          </SelectTrigger>
          <SelectContent>
            {suggestedCommands.map((command) => (
              <SelectItem
                key={command}
                value={command}
                className="font-mono text-base"
              >
                {command}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <label className="flex w-full flex-col gap-2">
        Command
        <Input
          {...form.register("command")}
          aria-label="Command"
          placeholder="pnpm test"
          className="w-full font-mono text-base"
          aria-invalid={!!form.formState.errors.command}
        />
      </label>
      {form.formState.errors.command && (
        <span role="alert" className="text-destructive">
          {form.formState.errors.command.message}
        </span>
      )}
      <label className="flex w-full flex-col gap-2">
        Working directory
        <Input
          {...form.register("cwd")}
          className="w-full font-mono text-base"
        />
      </label>
      <label className="flex w-full flex-col gap-2">
        Timeout in seconds
        <Input
          {...form.register("timeoutSeconds", { valueAsNumber: true })}
          type="number"
          className="w-full text-base"
        />
      </label>
      <label className="flex w-full flex-col gap-2">
        Execution workspace
        <Select
          value={reuseCheckId || "new"}
          onValueChange={(value) =>
            form.setValue("reuseCheckId", value === "new" ? "" : (value ?? ""))
          }
        >
          <SelectTrigger className="w-full text-base">
            <SelectValue>
              {reuseCheckId
                ? "Reuse prepared dependencies"
                : "New exact source copy"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new" className="text-base">
              New exact source copy
            </SelectItem>
            {reusable.map((check) => (
              <SelectItem key={check.id} value={check.id} className="text-base">
                {check.command}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex w-full flex-col gap-2">
        Generated artifact paths, optional
        <Input
          {...form.register("artifacts")}
          placeholder="report.txt, coverage/summary.json"
          className="w-full font-mono text-base"
        />
      </label>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={compareWithBase}
          onCheckedChange={(checked) =>
            form.setValue("compareWithBase", !!checked)
          }
        />
        Compare with base
      </label>
      {Object.entries(form.formState.errors)
        .filter(([key]) => key !== "command")
        .map(([key, error]) => (
          <span key={key} role="alert" className="text-destructive">
            {error.message}
          </span>
        ))}
      <div className="flex items-center gap-2">
        <TooltipWrapper content="Runs locally with host permissions. Dependency installation is a separate command you explicitly run in this workspace.">
          <span tabIndex={0} aria-label="Local execution policy">
            <ShieldAlert
              aria-hidden="true"
              className="size-5 text-muted-foreground"
            />
          </span>
        </TooltipWrapper>
        <Button
          type="submit"
          className="flex-1"
          disabled={form.formState.isSubmitting}
        >
          <LoadingSwap
            isLoading={form.formState.isSubmitting}
            className="flex items-center gap-2"
          >
            <Play aria-hidden="true" className="size-4" />
            Run check
          </LoadingSwap>
        </Button>
      </div>
    </form>
  );
};
