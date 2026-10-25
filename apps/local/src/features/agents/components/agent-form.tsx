"use client";

import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCcwIcon, SendIcon, Square } from "lucide-react";
import { useId } from "react";
import { useController, useForm } from "react-hook-form";
import { ModelPicker } from "../../providers/components/model-picker";
import type { ModelSelection } from "../../providers/model-schemas";
import { agentFormSchema, type AgentFormSchema } from "../schemas";

type AgentFormProps = {
  initialContent?: string;
  model: ModelSelection | null;
  onModelChange: (model: ModelSelection | null) => void;
  busy: boolean;
  retry?: boolean;
  onSend: (content: string) => void | Promise<unknown>;
  onStop: () => void | Promise<void>;
};

export const AgentForm = ({
  initialContent = "",
  model,
  onModelChange,
  busy,
  retry = false,
  onSend,
  onStop,
}: AgentFormProps) => {
  const id = useId();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AgentFormSchema>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: { content: initialContent },
  });
  const { field } = useController({ control, name: "content" });
  const submit = async ({ content }: AgentFormSchema) => {
    if (!model || busy) return;
    try {
      await onSend(content);
      reset({ content: "" });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not send your message. Your draft is retained.",
      );
    }
  };
  const stop = async () => {
    try {
      await onStop();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not stop the response.",
      );
    }
  };
  return (
    <form
      noValidate
      aria-label="Agent message"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        // Model configuration dialogs render portals whose submit events can bubble here.
        if (event.target === event.currentTarget)
          void handleSubmit(submit, ({ content }) => {
            if (content?.type === "too_big" && content.message)
              toast.error(content.message);
          })(event);
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-content`} className="sr-only">
          Message
        </label>
        <Textarea
          id={`${id}-content`}
          {...field}
          disabled={busy || isSubmitting || !model}
          className="min-h-32 bg-transparent! border-none shadow-none text-base md:text-base focus-visible:outline-0 focus-visible:ring-0 aria-invalid:ring-0"
          placeholder={
            model
              ? "Ask about these changes…"
              : "Choose a chat model to start a conversation."
          }
          aria-invalid={errors.content?.type === "too_big"}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!busy && !isSubmitting && model && field.value.trim())
                event.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </div>
      <div className="flex items-center gap-2 justify-between">
        <ModelPicker
          value={model}
          onChange={onModelChange}
          disabled={busy || isSubmitting}
          preserveSelection
          autoSelect={false}
          buttonProps={{
            variant: "ghost",
          }}
        />
        <Button
          type={busy ? "button" : "submit"}
          className="text-base"
          variant="ghost"
          disabled={!busy && (isSubmitting || !model || !field.value.trim())}
          onClick={busy ? stop : undefined}
          size="icon"
          aria-label={
            busy ? "Stop response" : retry ? "Retry message" : "Send message"
          }
        >
          <LoadingSwap isLoading={isSubmitting && !busy}>
            {busy ? (
              <Square aria-hidden="true" className="size-4" />
            ) : retry ? (
              <RefreshCcwIcon />
            ) : (
              <SendIcon />
            )}
          </LoadingSwap>
        </Button>
      </div>
    </form>
  );
};
