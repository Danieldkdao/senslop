"use client";

import { CircleOff, Folder, ScrollText } from "lucide-react";
import type { ReviewInstructionsSchema } from "@senslop/contracts";
import { FileIcon } from "@/components/file-icon";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import { formatReviewProfile } from "../lib/formatters";

type EffectiveReviewRulesProps = { instructions: ReviewInstructionsSchema };

export const EffectiveReviewRules = ({
  instructions,
}: EffectiveReviewRulesProps) => (
  <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap gap-2" aria-label="Review dimensions">
      {instructions.profiles.map((profile) => {
        const display = formatReviewProfile(profile);
        return (
          <span
            key={profile}
            className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5"
          >
            <display.Icon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            {display.label}
          </span>
        );
      })}
    </div>
    {instructions.profileScopes
      ?.filter((scope) => scope.scope)
      .map((scope, index) => (
        <div key={`${scope.source}:${index}`} className="flex flex-col gap-2">
          <span className="flex items-start gap-2 text-muted-foreground">
            <Folder aria-hidden="true" className="h-lh w-4 shrink-0" />
            <span className="min-w-0 break-all font-mono">{scope.scope}</span>
          </span>
          <div className="flex flex-wrap gap-3">
            {scope.profiles.map((profile) => {
              const display = formatReviewProfile(profile);
              return (
                <TooltipWrapper key={profile} content={scope.source}>
                  <span tabIndex={0} className="flex items-center gap-2">
                    <display.Icon aria-hidden="true" className="size-4" />
                    {display.label}
                  </span>
                </TooltipWrapper>
              );
            })}
          </div>
        </div>
      ))}
    {instructions.rules.length > 0 && (
      <ul className="flex flex-col gap-3" aria-label="Effective review rules">
        {instructions.rules.map((rule, index) => {
          const Icon = rule.enabled ? ScrollText : CircleOff;
          return (
            <li
              key={`${rule.source}:${rule.id}:${index}`}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3",
                !rule.enabled && "text-muted-foreground",
              )}
            >
              <TooltipWrapper
                content={rule.enabled ? "Enabled rule" : "Disabled rule"}
              >
                <span tabIndex={0} className="flex h-lh shrink-0 items-center">
                  <Icon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                </span>
              </TooltipWrapper>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="break-all font-medium">{rule.id}</span>
                <p className="whitespace-pre-wrap wrap-break-word">
                  {rule.text}
                </p>
                <TooltipWrapper
                  content={`${rule.source}; ${rule.scope || "Entire repository"}; ${rule.paths.join(", ")}`}
                >
                  <span
                    tabIndex={0}
                    className="flex items-start gap-2 text-muted-foreground"
                  >
                    <FileIcon
                      fileName={rule.source}
                      className="mt-1 shrink-0"
                    />
                    <span className="min-w-0 break-all font-mono">
                      {rule.source}
                    </span>
                  </span>
                </TooltipWrapper>
              </div>
            </li>
          );
        })}
      </ul>
    )}
    {instructions.sources.length > 0 && (
      <div className="flex flex-col gap-2" aria-label="Instruction documents">
        {instructions.sources.map((source) => (
          <TooltipWrapper
            key={source.path}
            content={source.scope || "Entire repository"}
          >
            <span
              tabIndex={0}
              className="flex items-start gap-2 text-muted-foreground"
            >
              <span className="flex h-lh shrink-0 items-center">
                <FileIcon fileName={source.path} />
              </span>
              <span className="min-w-0 break-all font-mono">{source.path}</span>
            </span>
          </TooltipWrapper>
        ))}
      </div>
    )}
    {!instructions.rules.length && !instructions.sources.length && (
      <p className="text-muted-foreground">No additional repository rules.</p>
    )}
    {instructions.limitations.map((limitation) => (
      <p key={limitation} className="text-muted-foreground">
        {limitation}
      </p>
    ))}
  </div>
);
