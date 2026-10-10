// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ProviderIcon } from "../src/components/provider-icon";

afterEach(cleanup);
test("registry names and variant-specific props render without assuming every icon has a color variant", () => {
  const mono = render(
    <ProviderIcon
      name="Anthropic"
      size={32}
      title="Anthropic provider"
      className="text-primary"
    />,
  );
  expect(mono.container.querySelector("svg")?.getAttribute("width")).toBe("32");
  expect(mono.container.querySelector("svg")?.getAttribute("title")).toBe(
    "Anthropic provider",
  );
  mono.unmount();
  const colored = render(
    <ProviderIcon
      name="Google"
      variant="Color"
      size={40}
      aria-label="Google"
    />,
  );
  expect(colored.container.querySelector("svg")?.getAttribute("width")).toBe(
    "40",
  );
  colored.unmount();
  const combined = render(
    <ProviderIcon name="Mistral" variant="Combine" size={24} type="color" />,
  );
  expect(combined.container.querySelector("svg")).toBeTruthy();
});
test("invalid runtime registry names and unavailable variants report explicit errors", () => {
  expect(() =>
    render(
      <ProviderIcon
        {...({ name: "Missing" } as unknown as { name: "Anthropic" })}
      />,
    ),
  ).toThrow(/registry/i);
  expect(() =>
    render(
      <ProviderIcon
        {...({ name: "Anthropic", variant: "Color" } as unknown as {
          name: "Anthropic";
        })}
      />,
    ),
  ).toThrow(/variant/i);
});
