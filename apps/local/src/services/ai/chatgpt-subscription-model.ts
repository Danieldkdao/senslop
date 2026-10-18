import { createOpenAI } from "@ai-sdk/openai";
import { wrapLanguageModel } from "ai";
import {
  collectModelStream,
  requireCompletedModelStream,
} from "./model-stream";

export const createChatGptSubscriptionModel = (
  accessToken: string,
  modelId: string,
  fetcher: typeof fetch,
) => {
  const provider = createOpenAI({
    apiKey: accessToken,
    baseURL: "https://api.openai.com/v1",
    fetch: fetcher,
  });
  return wrapLanguageModel({
    model: provider.responses(modelId),
    middleware: {
      specificationVersion: "v4",
      transformParams: async ({ params }) => ({
        ...params,
        maxOutputTokens: undefined,
        temperature: undefined,
        topP: undefined,
        providerOptions: {
          ...params.providerOptions,
          openai: {
            ...params.providerOptions?.openai,
            store: false,
            systemMessageMode: "developer",
          },
        },
        tools: params.tools?.map((tool) =>
          tool.type === "function"
            ? {
                ...tool,
                providerOptions: {
                  ...tool.providerOptions,
                  openai: {
                    ...tool.providerOptions?.openai,
                    namespace: {
                      name: "senslop",
                      description:
                        "Read-only tools for the selected frozen review snapshot.",
                    },
                  },
                },
              }
            : tool,
        ),
      }),
      wrapGenerate: async ({ doStream }) =>
        collectModelStream(await doStream()),
      wrapStream: async ({ doStream }) =>
        requireCompletedModelStream(await doStream()),
    },
  });
};
