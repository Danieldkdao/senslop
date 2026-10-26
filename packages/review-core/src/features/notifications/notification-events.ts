import {
  type NotificationKind,
  notificationEventSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";

export const recordNotification = (
  store: LocalStore,
  repository: string,
  event: {
    id: string;
    kind: NotificationKind;
    reviewId: string | null;
    title: string;
    destination?: string;
  },
) => {
  store.database
    .prepare(
      "INSERT OR IGNORE INTO notification_events(id,repository,review_id,body) VALUES (?,?,?,?)",
    )
    .run(
      event.id,
      repository,
      event.reviewId,
      JSON.stringify({
        ...event,
        destination:
          event.destination ??
          (event.reviewId ? `/?review=${event.reviewId}` : "/"),
        createdAt: new Date().toISOString(),
      }),
    );
};

export const listNotifications = (
  store: LocalStore,
  repository: string,
  after: number,
) =>
  store.database
    .prepare(
      "SELECT sequence,body FROM notification_events WHERE repository=? AND sequence>? ORDER BY sequence LIMIT 100",
    )
    .all(repository, after)
    .map((row) =>
      notificationEventSchema.parse({
        ...JSON.parse(String(row.body)),
        sequence: Number(row.sequence),
      }),
    );

export const recordWorkOutcome = (
  store: LocalStore,
  repository: string,
  kind: NotificationKind,
  run: { id: string; status: string; review: { id: string } },
) => {
  const destination = `/?review=${run.review.id}&panel=${["grouping", "review"].includes(kind) ? "review" : "work"}&work=${kind === "fix" ? "tasks" : kind}&event=${run.id}`;
  if (["completed", "passed", "returned"].includes(run.status))
    recordNotification(store, repository, {
      id: `${kind}:${run.id}:${run.status}`,
      kind,
      reviewId: run.review.id,
      title: "Background work completed",
      destination,
    });
  else if (
    ["failed", "blocked", "timed-out", "interrupted"].includes(run.status)
  )
    recordNotification(store, repository, {
      id: `${kind}:${run.id}:${run.status}`,
      kind: "attention",
      reviewId: run.review.id,
      title: "Background work needs attention",
      destination,
    });
};

export const claimNotification = (
  store: LocalStore,
  repository: string,
  id: string,
  owner: string,
) =>
  store.database
    .prepare(
      "UPDATE notification_events SET body=json_set(body,'$.delivery',json(?)) WHERE repository=? AND id=? AND json_extract(body,'$.delivery.completed') IS NULL AND (json_type(body,'$.delivery') IS NULL OR json_type(body,'$.delivery')='text' OR json_extract(body,'$.delivery.expiresAt')<=? OR json_extract(body,'$.delivery.owner')=?)",
    )
    .run(
      JSON.stringify({ owner, expiresAt: Date.now() + 120000 }),
      repository,
      id,
      Date.now(),
      owner,
    ).changes === 1;

export const releaseNotification = (
  store: LocalStore,
  repository: string,
  id: string,
  owner: string,
) => {
  store.database
    .prepare(
      "UPDATE notification_events SET body=json_remove(body,'$.delivery') WHERE repository=? AND id=? AND json_extract(body,'$.delivery.owner')=? AND json_extract(body,'$.delivery.completed') IS NULL",
    )
    .run(repository, id, owner);
};

export const completeNotification = (
  store: LocalStore,
  repository: string,
  id: string,
  owner: string,
) =>
  store.database
    .prepare(
      "UPDATE notification_events SET body=json_set(body,'$.delivery.completed',1) WHERE repository=? AND id=? AND json_extract(body,'$.delivery.owner')=?",
    )
    .run(repository, id, owner).changes === 1;

export const notificationCompleted = (
  store: LocalStore,
  repository: string,
  id: string,
) =>
  !!store.database
    .prepare(
      "SELECT 1 FROM notification_events WHERE repository=? AND id=? AND json_extract(body,'$.delivery.completed')=1",
    )
    .get(repository, id);
