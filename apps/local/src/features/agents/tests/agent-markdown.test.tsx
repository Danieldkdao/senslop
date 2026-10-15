// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AgentMarkdown } from "../components/agent-markdown";
const scrollToDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo",
);
beforeEach(() =>
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  }),
);
afterEach(() => {
  cleanup();
  if (scrollToDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollTo",
      scrollToDescriptor,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});
test("generated Markdown keeps text while blocking raw HTML, images and local links", async () => {
  const { container } = render(
    <AgentMarkdown>{`# Result
<script>alert(1)</script>

<img src="http://localhost/secret">

![remote](https://example.com/tracking.png)
[local](https://127.0.0.1/private)
[docs](https://example.com/docs)`}</AgentMarkdown>,
  );
  await screen.findByRole("link", { name: "docs" });
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector('a[href*="127.0.0.1"]')).toBeNull();
  expect(
    container.querySelector('a[href="https://example.com/docs"]'),
  ).toBeTruthy();
});

test("fenced code highlights syntax with light and dark colors while streaming", async () => {
  const { container, rerender } = render(
    <AgentMarkdown streaming>
      {"```tsx\nexport const answer = 42;\n"}
    </AgentMarkdown>,
  );
  await waitFor(() => {
    const styles = [...container.querySelectorAll("code span[style]")].map(
      (token) => token.getAttribute("style"),
    );
    expect(new Set(styles).size).toBeGreaterThan(1);
    expect(styles.some((style) => style?.includes("--shiki-dark"))).toBe(true);
  });
  rerender(
    <AgentMarkdown>{"```tsx\nexport const answer = 42;\n```"}</AgentMarkdown>,
  );
  await waitFor(() =>
    expect(container.querySelector("code")?.textContent).toContain(
      "export const answer = 42;",
    ),
  );
});
