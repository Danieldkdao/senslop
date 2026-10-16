import { afterEach, expect, test, vi } from "vitest";
import { LocalStore } from "@senslop/review-core/storage";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, PATCH } from "../../../app/api/ui-preferences/route";

const state = vi.hoisted(() => ({
  store: null as unknown as LocalStore,
  allowed: true,
}));
vi.mock("../../workspace/lib/server-workspace", () => ({
  getWorkspace: () => ({ store: state.store }),
  protectLocalRoute: () => state.allowed,
  readLocalBody: (request: Request) => request.json(),
}));
let directory: string;
afterEach(() => {
  state.store?.database.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  state.allowed = true;
});
const request = () => new Request("http://localhost/api/ui-preferences");
const patch = (body: unknown) =>
  PATCH(
    new Request(request().url, { method: "PATCH", body: JSON.stringify(body) }),
  );
const open = () => {
  directory = mkdtempSync(join(tmpdir(), "senslop-ui-preferences-"));
  state.store = new LocalStore(join(directory, "preferences.db"));
};

test("UI preferences survive database restart and partial saves preserve unrelated settings", async () => {
  open();
  const initial = await (await GET(request())).json();
  expect(initial.editor.fontSize).toBe(16);
  expect(
    (
      await patch({
        editor: {
          theme: "nord",
          font: "fira-code",
          fontSize: 20,
          lineHeight: 28,
          indicators: "classic",
          inlineChanges: "char",
          backgrounds: false,
          wrapping: true,
          lineNumbers: false,
        },
        view: "unified",
      })
    ).status,
  ).toBe(200);
  await patch({
    applicationTheme: "sage-light",
    panels: { "review-files": 24, "review-canvas": 48, "review-agents": 28 },
  });
  await patch({ editor: { fontSize: 22 } });
  state.store.database.close();
  state.store = new LocalStore(join(directory, "preferences.db"));
  expect(await (await GET(request())).json()).toMatchObject({
    editor: {
      theme: "nord",
      font: "fira-code",
      fontSize: 22,
      lineHeight: 28,
      indicators: "classic",
      inlineChanges: "char",
      backgrounds: false,
      wrapping: true,
      lineNumbers: false,
    },
    applicationTheme: "sage-light",
    view: "unified",
    panels: { "review-files": 24, "review-canvas": 48, "review-agents": 28 },
  });
});

test("invalid, unauthorized, and unavailable writes do not report success", async () => {
  open();
  for (const body of [
    { editor: { fontSize: 33 } },
    { editor: { lineHeight: 15 } },
    { applicationTheme: "invalid" },
    { view: "invalid" },
    { panels: { "review-files": 60 } },
    { autoAdvance: true },
  ])
    expect((await patch(body)).status).toBe(400);
  state.allowed = false;
  expect((await GET(request())).status).toBe(403);
  expect((await patch({ view: "unified" })).status).toBe(403);
  state.allowed = true;
  state.store.database.exec("DROP TABLE preferences");
  expect((await patch({ view: "unified" })).status).toBe(503);
});
