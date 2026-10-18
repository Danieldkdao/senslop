"use client";

import { createCodePlugin } from "@streamdown/code";
import pierreLight from "@pierre/theme/pierre-light";
import pierreDark from "@pierre/theme/pierre-dark";
import { Streamdown } from "streamdown";

const codeTheme = (theme: typeof pierreLight) => ({
  name: theme.name,
  type: theme.type,
  colors: theme.colors,
  tokenColors: [...theme.tokenColors],
});

const code = createCodePlugin({
  themes: [codeTheme(pierreLight), codeTheme(pierreDark)],
});

export const AgentMarkdown = ({
  children,
  streaming = false,
}: {
  children: string;
  streaming?: boolean;
}) => (
  <Streamdown
    isAnimating={streaming}
    mode={streaming ? "streaming" : "static"}
    plugins={{ code }}
    skipHtml
    controls={false}
    className="w-full min-w-0 max-w-full wrap-anywhere text-base [&_pre]:text-base [&_table]:wrap-normal"
    components={{
      img: () => null,
      a: ({ href, children }) => {
        let allowed = false;
        try {
          const url = new URL(href ?? "");
          allowed =
            url.protocol === "https:" &&
            !/^(localhost|127\.|\[|0\.)/.test(url.hostname);
        } catch {}
        return allowed ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            {children}
          </a>
        ) : (
          <span>{children}</span>
        );
      },
    }}
  >
    {children}
  </Streamdown>
);
