import { afterEach, expect, test, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { GET, PUT } from "../../../app/api/review-preferences/route";

const state = vi.hoisted(() => ({
  database: null as unknown as DatabaseSync,
  allowed: true,
}));
vi.mock("../../workspace/lib/server-workspace", () => ({
  getWorkspace: () => ({
    store: { database: state.database },
    root: async () => "/fixture",
  }),
  protectLocalRoute: () => state.allowed,
  readLocalBody: (request: Request) => request.json(),
}));
afterEach(() => {
  state.database?.close();
  state.allowed = true;
});

test("review preferences default off and saving is durable without any model configuration", async () => {
  state.database = new DatabaseSync(":memory:");
  state.database.exec(
    "CREATE TABLE preferences (name TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  const request = new Request("http://localhost/api/review-preferences");
  expect(await (await GET(request)).json()).toEqual({ autoAdvance: false });
  const saved = await PUT(
    new Request(request.url, {
      method: "PUT",
      body: JSON.stringify({ autoAdvance: true }),
    }),
  );
  expect(saved.status).toBe(200);
  expect(await (await GET(request)).json()).toEqual({ autoAdvance: true });
  expect(
    JSON.parse(
      String(
        state.database
          .prepare(
            "SELECT value FROM preferences WHERE name = 'project_review_preferences:/fixture'",
          )
          .get()?.value,
      ),
    ),
  ).toEqual({ autoAdvance: true });
  state.allowed = false;
  expect((await GET(request)).status).toBe(403);
  expect(
    (await PUT(new Request(request.url, { method: "PUT", body: "{}" }))).status,
  ).toBe(403);
});
