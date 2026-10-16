import {
  ToolLoopAgent,
  Output,
  isStepCount,
  type ToolSet,
  type ToolLoopAgentSettings,
  type PrepareStepFunction,
} from "ai";
import { z } from "zod";
import { groupingSchema } from "../../features/agents/schemas";
import { reviewBatchSchema } from "./analysis-repair-schemas";

type StructuredAnalysisCall = {
  schema: z.ZodType;
  maxSteps: number;
  maxOutputTokens: number;
  toolsEnabled: boolean;
  providerOptions?: ToolLoopAgentSettings["providerOptions"];
  prepareStep?: PrepareStepFunction<ToolSet>;
};
type AnalysisAgentSettings = ToolLoopAgentSettings<
  StructuredAnalysisCall,
  ToolSet,
  Record<string, unknown>,
  ReturnType<typeof Output.object>
>;
type AnalysisAgentConfiguration = Pick<
  AnalysisAgentSettings,
  "model" | "instructions" | "tools" | "providerOptions" | "maxRetries"
>;

const createAnalysisAgent = (
  id: string,
  schema: z.ZodType,
  settings: AnalysisAgentConfiguration,
) =>
  new ToolLoopAgent<
    StructuredAnalysisCall,
    ToolSet,
    Record<string, unknown>,
    ReturnType<typeof Output.object>
  >({
    ...settings,
    id,
    output: Output.object({ schema }),
    prepareCall: ({ options, ...call }) => ({
      ...call,
      // JSON-mode adapters may omit the schema on the wire; keep the contract visible to the model.
      instructions: [
        ...(typeof call.instructions === "string"
          ? [{ role: "system" as const, content: call.instructions }]
          : Array.isArray(call.instructions)
            ? call.instructions
            : call.instructions
              ? [call.instructions]
              : []),
        {
          role: "system" as const,
          content: `Required final JSON schema:\n${JSON.stringify(z.toJSONSchema(options?.schema ?? schema))}`,
        },
      ],
      output: Output.object({ schema: options?.schema ?? schema }),
      maxOutputTokens: options?.maxOutputTokens ?? 8000,
      providerOptions: options?.providerOptions ?? call.providerOptions,
      stopWhen: isStepCount(options?.maxSteps ?? 1),
      tools: options?.toolsEnabled ? settings.tools : {},
      prepareStep: async (step) => ({
        ...(await options?.prepareStep?.(step)),
        ...(!options?.toolsEnabled || step.stepNumber === options.maxSteps - 1
          ? {
              activeTools: [],
              toolChoice: "none" as const,
              reasoning: "none" as const,
            }
          : {}),
      }),
    }),
  });

export const createGroupingAgent = (settings: AnalysisAgentConfiguration) =>
  createAnalysisAgent("senslop-grouping", groupingSchema, settings);

export const createReviewAgent = (settings: AnalysisAgentConfiguration) =>
  createAnalysisAgent("senslop-review", reviewBatchSchema, settings);
