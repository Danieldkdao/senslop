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
  await patch({ buddy: { visible: false, position: { x: 0.25, y: 0.75 } } });
  expect((await patch({ buddy: { size: 120 } })).status).toBe(200);
  expect((await patch({ buddy: { character: "lumi" } })).status).toBe(200);
  await patch({ buddy: { animations: false } });
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
    buddy: {
      character: "lumi",
      size: 120,
      visible: false,
      animations: false,
      position: { x: 0.25, y: 0.75 },
    },
  });
});

test("existing buddy preferences acquire the default size without losing saved placement", async () => {
  open();
  state.store.database
    .prepare("INSERT INTO preferences VALUES ('ui_preferences', ?)")
    .run(
      JSON.stringify({
        buddy: {
          visible: false,
          animations: false,
          position: { x: 0.2, y: 0.8 },
        },
      }),
    );
  expect(await (await GET(request())).json()).toMatchObject({
    buddy: {
      visible: false,
      animations: false,
      size: 96,
      character: "pip",
      position: { x: 0.2, y: 0.8 },
    },
  });
  expect((await patch({ buddy: { size: 80 } })).status).toBe(200);
  await patch({ buddy: { position: null } });
  expect(await (await GET(request())).json()).toMatchObject({
    buddy: { size: 80, visible: false, position: null, character: "pip" },
  });
});

test("all five buddy choices save independently of size, visibility, and position", async () => {
  open();
  await patch({
    buddy: { size: 112, visible: false, position: { x: 0.1, y: 0.9 } },
  });
  for (const character of ["pip", "momo", "nori", "lumi", "pebble"]) {
    const response = await patch({ buddy: { character } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      buddy: {
        character,
        size: 112,
        visible: false,
        position: { x: 0.1, y: 0.9 },
      },
    });
  }
  await patch({ buddy: { animations: false } });
  expect(await (await GET(request())).json()).toMatchObject({
    buddy: { character: "pebble", animations: false },
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
    { buddy: { size: 79 } },
    { buddy: { size: 121 } },
    { buddy: { size: 96.5 } },
    { buddy: { character: "unknown" } },
  ])
    expect((await patch(body)).status).toBe(400);
  state.allowed = false;
  expect((await GET(request())).status).toBe(403);
  expect((await patch({ view: "unified" })).status).toBe(403);
  state.allowed = true;
  state.store.database.exec("DROP TABLE preferences");
  expect((await patch({ view: "unified" })).status).toBe(503);
});
