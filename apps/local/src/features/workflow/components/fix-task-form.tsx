"use client";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { workspaceKinds, type SavedReviewSchema } from "@senslop/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSwap } from "@/components/ui/loading-swap";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatWorkspaceKind } from "../lib/formatters";
import type { WorkflowActionSchema } from "../schemas";

const taskFormSchema = z.object({
  title: z.string().trim().min(1).max(200),
  constraints: z.string().max(5000),
  checks: z.string(),
  noteIds: z.array(z.string()),
  workspaceKind: z.enum(workspaceKinds),
});
export type TaskFormSchema = z.infer<typeof taskFormSchema>;
export const FixTaskForm = ({
  review,
  findingIds,
  onAction,
  onClose,
}: {
  review: SavedReviewSchema;
  findingIds: string[];
  onAction: (operation: WorkflowActionSchema) => Promise<unknown>;
  onClose: () => void;
}) => {
  const form = useForm<TaskFormSchema>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "Fix selected findings",
      constraints: "",
      checks: "",
      noteIds: [],
      workspaceKind: "managed",
    },
  });
  const noteIds = useWatch({ control: form.control, name: "noteIds" });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto text-base">
        <DialogHeader>
          <DialogTitle>Create fix task</DialogTitle>
          <DialogDescription>
            {findingIds.length} selected findings from round {review.round}.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex w-full min-w-0 flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await onAction({
                action: "create-task",
                ...values,
                findingIds,
                checks: values.checks
                  .split("\n")
                  .map((command) => command.trim())
                  .filter(Boolean),
              });
              onClose();
            } catch {}
          })}
        >
          <label className="flex w-full flex-col gap-2">
            Title
            <Input {...form.register("title")} className="w-full text-base" />
          </label>
          <label className="flex w-full flex-col gap-2">
            Workspace
            <Controller
              control={form.control}
              name="workspaceKind"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => value && field.onChange(value)}
                >
                  <SelectTrigger className="w-full text-base">
                    <SelectValue>
                      {(() => {
                        const display = formatWorkspaceKind(field.value);
                        return (
                          <>
                            <display.Icon
                              aria-hidden="true"
                              className="size-4"
                            />
                            {display.label}
                          </>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="managed" className="text-base">
                      Managed worktree
                    </SelectItem>
                    <SelectItem value="current" className="text-base">
                      Current worktree
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </label>
          <label className="flex w-full flex-col gap-2">
            Constraints
            <Textarea
              {...form.register("constraints")}
              className="w-full text-base"
              placeholder="Optional constraints"
            />
          </label>
          <label className="flex w-full flex-col gap-2">
            Suggested checks
            <Textarea
              {...form.register("checks")}
              className="w-full font-mono text-base"
              placeholder="One command per line; suggestions only"
            />
          </label>
          {!!review.notes.length && (
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend>Include notes</legend>
              {review.notes.map((note) => (
                <label
                  key={note.id}
                  className="flex items-start gap-2 wrap-break-word"
                >
                  <Checkbox
                    checked={noteIds.includes(note.id)}
                    onCheckedChange={(checked) =>
                      form.setValue(
                        "noteIds",
                        checked
                          ? [...form.getValues("noteIds"), note.id]
                          : form
                              .getValues("noteIds")
                              .filter((id) => id !== note.id),
                      )
                    }
                  />
                  <span className="min-w-0">{note.body}</span>
                </label>
              ))}
            </fieldset>
          )}
          {Object.keys(form.formState.errors).length > 0 && (
            <span role="alert" className="text-destructive">
              Check the task title and constraints.
            </span>
          )}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            <LoadingSwap isLoading={form.formState.isSubmitting}>
              Create fix task
            </LoadingSwap>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
