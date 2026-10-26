"use client";

import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  checkpointPolicySchema,
  workflowSeverities,
  type CheckpointPolicySchema,
} from "@senslop/contracts";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsAutosave } from "../../settings/hooks/use-settings-autosave";
import { useGitWorkflow } from "../hooks/use-git-workflow";

export const PushCheckpointSettings = () => {
  const git = useGitWorkflow();
  return git.state.data ? (
    <CheckpointForm
      policy={git.state.data.policy}
      installed={git.state.data.hook.installed}
    />
  ) : (
    <p role="status">{git.state.error?.message ?? "Loading Git settings…"}</p>
  );
};

const CheckpointForm = ({
  policy,
  installed,
}: {
  policy: CheckpointPolicySchema;
  installed: boolean;
}) => {
  const git = useGitWorkflow();
  const form = useForm<
    z.input<typeof checkpointPolicySchema>,
    unknown,
    CheckpointPolicySchema
  >({
    resolver: zodResolver(checkpointPolicySchema),
    values: policy,
    resetOptions: { keepDirtyValues: true },
  });
  useSettingsAutosave({
    form,
    schema: checkpointPolicySchema,
    save: (policy) => git.act({ action: "save-checkpoint", policy }),
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4 text-base"
      onSubmit={(event) => event.preventDefault()}
    >
      <p className="text-muted-foreground">
        Check the exact outgoing versions before app or protected terminal
        pushes.
      </p>
      {(
        [
          { name: "enabled", label: "Enable push checkpoint" },
          {
            name: "requireReviewed",
            label: "Require completed review coverage",
          },
          {
            name: "requireHistory",
            label: "Include intermediate outgoing versions",
          },
        ] as const
      ).map((item) => (
        <Controller
          key={item.name}
          control={form.control}
          name={item.name}
          render={({ field }) => (
            <label className="flex items-center gap-3">
              <span className="flex-1">{item.label}</span>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />
      ))}
      <label className="flex flex-col gap-2">
        Block unresolved findings at or above
        <Controller
          control={form.control}
          name="blockingSeverity"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workflowSeverities.map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    {severity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </label>
      <Controller
        control={form.control}
        name="requiredChecks"
        render={({ field }) => (
          <label className="flex flex-col gap-2">
            Required commands, one per line
            <Textarea
              className="w-full font-mono text-base"
              value={field.value?.join("\n") ?? ""}
              onChange={(event) =>
                field.onChange(
                  event.target.value.split("\n").filter((line) => line.trim()),
                )
              }
            />
          </label>
        )}
      />
      <div className="flex items-center gap-3">
        <span className="flex-1">Protect terminal pushes</span>
        <Switch
          aria-label="Protect terminal pushes"
          checked={installed}
          disabled={git.pending}
          onCheckedChange={(checked) => {
            void git
              .act({ action: checked ? "install-hook" : "remove-hook" })
              .catch(() => {});
          }}
        />
      </div>
      <p className="text-muted-foreground">
        Existing hooks remain active; disabling the checkpoint restores ordinary
        pushes.
      </p>
    </form>
  );
};
