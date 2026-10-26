"use client";

import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { gitActionSchema, type GitStateSchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { toast } from "@/components/ui/toast";
import { useFormDraft } from "../../usability/hooks/use-form-draft";
import { useGitWorkflow, useCommitCoverage } from "../hooks/use-git-workflow";

const commitFormSchema = gitActionSchema.options[2].pick({
  subject: true,
  body: true,
});
export type CommitFormSchema = z.infer<typeof commitFormSchema>;

export const CommitForm = ({ state }: { state: GitStateSchema }) => {
  const git = useGitWorkflow();
  const candidate = useCommitCoverage(state.identity, !state.conflicts.length);
  const form = useForm<
    z.input<typeof commitFormSchema>,
    unknown,
    CommitFormSchema
  >({
    resolver: zodResolver(commitFormSchema),
    defaultValues: { subject: "", body: "" },
  });
  const draft = useFormDraft(form, "git-commit");
  const subject = useController({ control: form.control, name: "subject" });
  const body = useController({ control: form.control, name: "body" });
  return (
    <form
      noValidate
      className="flex flex-col gap-3 border-t pt-4"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          const result = await git.act({
            action: "commit",
            ...values,
            expected: state.identity,
          });
          form.reset();
          draft.clear();
          toast.success(
            `Created commit ${String(result.commit).slice(0, 12)}.`,
          );
        } catch {}
      })}
    >
      <label className="flex flex-col gap-1">
        Commit subject
        <Input
          className="w-full text-base"
          {...subject.field}
          aria-invalid={!!form.formState.errors.subject}
          placeholder="fix: describe the change"
        />
      </label>
      {form.formState.errors.subject && (
        <p role="alert">{form.formState.errors.subject.message}</p>
      )}
      <label className="flex flex-col gap-1">
        Description
        <Textarea className="w-full text-base" {...body.field} />
      </label>
      {candidate.data && (
        <p className="text-muted-foreground">
          {candidate.data.coverage.reduce(
            (total, entry) => total + entry.paths.length,
            0,
          )}{" "}
          / {candidate.data.total} staged file versions covered by completed
          review.
        </p>
      )}
      <p className="text-muted-foreground">
        Commits the complete staged preview using your configured hooks and
        signing.
      </p>
      <Button
        type="submit"
        disabled={
          git.pending ||
          !state.files.some(
            (file) => file.index !== " " && file.index !== "?",
          ) ||
          !!state.conflicts.length
        }
      >
        <LoadingSwap isLoading={git.pending}>Commit staged changes</LoadingSwap>
      </Button>
    </form>
  );
};
