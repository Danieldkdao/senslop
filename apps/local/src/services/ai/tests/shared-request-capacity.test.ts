import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { SharedRequestCapacity } from "../shared-request-capacity";

const directories: string[] = [];
const coordinators: SharedRequestCapacity[] = [];
afterEach(async () => {
  for (const coordinator of coordinators.splice(0)) coordinator.close();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
  vi.useRealTimers();
});
const fixture = async (machineConcurrency = 2) => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-capacity-"));
  directories.push(directory);
  const path = join(directory, "capacity.sqlite");
  const first = new SharedRequestCapacity(path, machineConcurrency);
  const second = new SharedRequestCapacity(path, machineConcurrency);
  coordinators.push(first, second);
  return { first, second };
};
const policy = { concurrency: 1, limits: {} };

test("independent connections share endpoint slots and machine limits without provider calls", async () => {
  const { first, second } = await fixture(1);
  const lease = await first.acquire("local", policy, 0, 0);
  const abort = new AbortController();
  let admitted = false;
  const pending = second
    .acquire("remote", policy, 0, 0, abort.signal)
    .then((value) => {
      admitted = true;
      return value;
    });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(admitted).toBe(false);
  lease.release();
  const next = await pending;
  expect(admitted).toBe(true);
  next.release();
});

test("canceled queued demand never reserves a provider slot", async () => {
  const { first, second } = await fixture();
  const lease = await first.acquire("endpoint", policy, 0, 0);
  const abort = new AbortController();
  const pending = second.acquire("endpoint", policy, 0, 0, abort.signal);
  abort.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  lease.release();
  (await second.acquire("endpoint", policy, 0, 0)).release();
});

test("rolling token reservations and actual usage are shared between connections", async () => {
  vi.useFakeTimers();
  const { first, second } = await fixture();
  const capacity = { concurrency: 2, limits: { inputTokensPerMinute: 100 } };
  const lease = await first.acquire("endpoint", capacity, 90, 0);
  lease.release(20);
  (await second.acquire("endpoint", capacity, 80, 0)).release();
  let admitted = false;
  const pending = first.acquire("endpoint", capacity, 1, 0).then((lease) => {
    admitted = true;
    lease.release();
  });
  await vi.advanceTimersByTimeAsync(59900);
  expect(admitted).toBe(false);
  await vi.advanceTimersByTimeAsync(200);
  await pending;
  expect(admitted).toBe(true);
});

test("a separate process holds shared capacity and a crashed owner releases its stale lease", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-process-capacity-"));
  directories.push(directory);
  const path = join(directory, "capacity.sqlite");
  const source = new URL("../shared-request-capacity.ts", import.meta.url).href;
  const code = `import { SharedRequestCapacity } from ${JSON.stringify(source)}; const capacity = new SharedRequestCapacity(${JSON.stringify(path)}, 1); await capacity.acquire("local", { concurrency: 1, limits: {} }, 0, 0); process.stdout.write("ready"); process.stdin.resume();`;
  const child = spawn(
    process.execPath,
    [
      "--import",
      createRequire(import.meta.url).resolve("tsx/esm"),
      "--input-type=module",
      "-e",
      code,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const closed = once(child, "close");
  try {
    await Promise.race([
      once(child.stdout!, "data"),
      closed.then(() => {
        throw new Error("Capacity fixture exited before acquiring a slot.");
      }),
    ]);
    const coordinator = new SharedRequestCapacity(path, 1);
    coordinators.push(coordinator);
    const abort = new AbortController();
    const blocked = coordinator.acquire("remote", policy, 0, 0, abort.signal);
    abort.abort();
    await expect(blocked).rejects.toMatchObject({ name: "AbortError" });
    child.kill("SIGKILL");
    await closed;
    (await coordinator.acquire("remote", policy, 0, 0)).release();
  } finally {
    child.kill("SIGKILL");
    await closed;
  }
});
