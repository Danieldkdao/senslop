"use client";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { FileIcon } from "@/components/file-icon";
import { ChevronDown } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  languageSettingsSchema,
  type ReviewIdentitySchema,
} from "@senslop/contracts";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSettingsAutosave } from "../../settings/hooks/use-settings-autosave";
import {
  useLanguageSettings,
  useSourceExplorer,
} from "../hooks/use-source-explorer";
import { formatLanguageLevel } from "../lib/formatters";

export type LanguageSupportFormSchema = z.infer<typeof languageSettingsSchema>;

export const LanguageSupportSettings = ({
  review,
}: {
  review?: ReviewIdentitySchema | null;
}) => {
  const explorer = useSourceExplorer(review);
  const save = useLanguageSettings(review);
  const form = useForm<
    z.input<typeof languageSettingsSchema>,
    unknown,
    LanguageSupportFormSchema
  >({
    resolver: zodResolver(languageSettingsSchema),
    mode: "onChange",
    values: explorer.data?.languageSettings ?? languageSettingsSchema.parse({}),
    resetOptions: { keepDirtyValues: true },
  });
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const autosave = useSettingsAutosave({
    form,
    schema: languageSettingsSchema,
    enabled: !!review && !!explorer.data && !explorer.isPending,
    save: save.mutateAsync,
  });
  if (!review)
    return (
      <p className="text-base text-muted-foreground">
        Open a saved review to configure this project’s language support.
      </p>
    );
  return (
    <form
      noValidate
      className="flex flex-col gap-5 text-base"
      onSubmit={(event) => {
        event.preventDefault();
        void autosave.flush();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          void autosave.flush();
      }}
    >
      <p className="text-muted-foreground">
        TypeScript and JavaScript use captured compiler context, while Python
        and Go support parsing and optional local semantic tooling.
      </p>
      {explorer.error && <p role="alert">{explorer.error.message}</p>}
      {(["python", "go"] as const).map((language) => (
        <fieldset
          key={language}
          className="flex flex-col gap-3 rounded-lg border p-4"
        >
          <legend className="px-1 font-medium">
            {language === "python" ? "Python" : "Go"}
          </legend>
          <Controller
            control={control}
            name={`${language}.enabled`}
            render={({ field }) => (
              <label className="flex items-center justify-between gap-3">
                Use configured semantic tooling
                <Switch
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
              </label>
            )}
          />
          <label className="flex flex-col gap-1">
            Executable
            <Input
              {...register(`${language}.command`)}
              className="w-full font-mono text-base"
              aria-invalid={!!errors[language]?.command}
            />
          </label>
          {errors[language]?.command && (
            <p role="alert">{errors[language]?.command?.message}</p>
          )}
          <label className="flex flex-col gap-1">
            Startup argument
            <Input
              {...register(`${language}.args.0`)}
              className="w-full font-mono text-base"
            />
          </label>
          <p className="text-muted-foreground">
            {language === "python"
              ? "Default: pyright-langserver --stdio"
              : "Default: gopls serve"}
            . Configure an installed executable; enabling this can start local
            analysis processes.
          </p>
        </fieldset>
      ))}
      <Collapsible>
        <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer font-medium">
          Captured capability coverage
          <ChevronDown
            aria-hidden="true"
            className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
          <div className="flex max-h-80 flex-col gap-3 overflow-y-auto overscroll-contain scroll-fade-y py-3">
            {Object.entries(explorer.data?.capabilities ?? {}).map(
              ([path, capability]) => {
                const display = formatLanguageLevel(capability.level);
                return (
                  <Collapsible key={path}>
                    <CollapsibleTrigger className="group flex w-full min-w-0 cursor-pointer items-start gap-2 text-left leading-6">
                      <span className="flex h-lh shrink-0 items-center">
                        <FileIcon fileName={path} />
                      </span>
                      <span className="min-w-0 flex-1 break-all font-mono">
                        {path}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="h-lh w-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                      <div className="flex items-start gap-2 py-2">
                        <display.Icon
                          aria-hidden="true"
                          className="h-lh w-4 shrink-0"
                        />
                        <div className="flex min-w-0 flex-col gap-1">
                          <span>{display.label}</span>
                          <span className="text-muted-foreground">
                            {capability.tool ?? "Text"}
                          </span>
                        </div>
                      </div>
                      {capability.limitations.map((limitation) => (
                        <p key={limitation} className="text-muted-foreground">
                          {limitation}
                        </p>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              },
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </form>
  );
};
