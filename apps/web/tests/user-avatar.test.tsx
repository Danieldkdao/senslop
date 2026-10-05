// @vitest-environment jsdom

import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UserAvatar } from "@/components/user-avatar";

afterEach(cleanup);

test.each([
  ["Daniel Dao", "DD"],
  ["  Ada  Lovelace  ", "AL"],
  ["Prince", "P"],
  ["", "?"],
])("%s uses readable initials when no photo exists", (name, initials) => {
  render(<UserAvatar name={name} />);
  expect(screen.getByText(initials)).toBeTruthy();
});

test("a loaded photo replaces the fallback and a failed photo restores it", () => {
  const { container } = render(
    <UserAvatar name="Daniel Dao" image="/avatar-fixture.png" />,
  );
  const image = container.querySelector("img")!;
  expect(screen.getByText("DD")).toBeTruthy();
  fireEvent.load(image);
  expect(screen.queryByText("DD")).toBeNull();
  expect(image.getAttribute("aria-hidden")).not.toBe("true");
  fireEvent.error(image);
  expect(screen.getByText("DD")).toBeTruthy();
});
