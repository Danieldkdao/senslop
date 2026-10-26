import { carrySnapshotNotes } from "../features/history/note-anchors";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  localPreviewSchema,
  savedReviewSchema,
  reviewChangeSchema,
  organizationSchema,
  type LocalPreviewSchema,
  type SavedReviewSchema,
  type ReviewChangeSchema,
} from "@senslop/contracts";

export class LocalStore {
  readonly database: DatabaseSync;
  private transactionDepth = 0;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(path);
    try {
      chmodSync(path, 0o600);
      this.database.exec(
        "PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON; PRAGMA journal_mode = WAL;",
      );
      const previousVersion = Number(
        this.database.prepare("PRAGMA user_version").get()?.user_version,
      );
      if (previousVersion > 0 && previousVersion < 8)
        this.database
          .prepare("VACUUM INTO ?")
          .run(`${path}.before-v8-${Date.now()}`);
      this.transaction(() => {
        const version = Number(
          this.database.prepare("PRAGMA user_version").get()?.user_version,
        );
        if (version > 8)
          throw new Error(
            "Local data was created by a newer Senslop. Upgrade the CLI to open it.",
          );
        if (version === 0) {
          this.database.exec(`
            CREATE TABLE reviews (id TEXT PRIMARY KEY, repository TEXT NOT NULL, body TEXT NOT NULL) STRICT;
            CREATE INDEX reviews_repository ON reviews(repository);
            CREATE TABLE active_reviews (repository TEXT PRIMARY KEY, review_id TEXT REFERENCES reviews(id) ON DELETE CASCADE) STRICT;
            CREATE TABLE connections (id TEXT PRIMARY KEY, body TEXT NOT NULL) STRICT;
            CREATE TABLE preferences (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
            PRAGMA user_version = 1;
          `);
        }
        if (version < 2) {
          this.database.exec(
            "CREATE TABLE credential_cleanup (id TEXT PRIMARY KEY) STRICT; PRAGMA user_version = 2;",
          );
        }
        if (version < 3) {
          this.database.exec(`
            CREATE TABLE ai_jobs (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT;
            CREATE INDEX ai_jobs_snapshot ON ai_jobs(snapshot_id);
            CREATE TABLE ai_conversations (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT;
            CREATE INDEX ai_conversations_snapshot ON ai_conversations(snapshot_id);
            CREATE TABLE ai_context (snapshot_id TEXT PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT;
            PRAGMA user_version = 3;
          `);
        }
        if (version < 4) {
          this.database.exec(`
            CREATE TABLE ai_batch_checkpoints (job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE, checkpoint_key TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (job_id, checkpoint_key)) STRICT;
            PRAGMA user_version = 4;
          `);
        }
        if (version < 5) {
          this.database.exec(`
            CREATE TABLE review_rounds (review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, round INTEGER NOT NULL, body TEXT NOT NULL, context TEXT, PRIMARY KEY (review_id, round)) STRICT;
            INSERT INTO review_rounds SELECT id, coalesce(json_extract(body, '$.round'), 1), body, NULL FROM reviews;
            CREATE TABLE review_findings (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT;
            CREATE INDEX review_findings_review ON review_findings(review_id);
            CREATE TABLE fix_tasks (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT;
            CREATE TABLE check_runs (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT;
            CREATE TABLE execution_manifests (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT;
            CREATE TABLE review_usage (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT;
            PRAGMA user_version = 5;
          `);
        }
        if (version < 6)
          this.database.exec(
            "CREATE TABLE finding_verifications (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT; PRAGMA user_version=6;",
          );
        if (version < 7)
          this.database.exec(
            "CREATE TABLE review_precision (review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, round INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (review_id, round)) STRICT; CREATE TABLE review_briefs (review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (review_id, version)) STRICT; PRAGMA user_version=7;",
          );
        if (version < 8)
          this.database.exec(`
          CREATE TABLE notification_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, repository TEXT NOT NULL, review_id TEXT REFERENCES reviews(id) ON DELETE CASCADE, body TEXT NOT NULL) STRICT;
          CREATE INDEX notification_events_repository ON notification_events(repository,sequence);
          CREATE TABLE review_reports (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, round INTEGER NOT NULL, body TEXT NOT NULL) STRICT;
          CREATE TABLE git_operations (id TEXT PRIMARY KEY, repository TEXT NOT NULL, body TEXT NOT NULL) STRICT;
          CREATE TABLE checkpoint_records (id TEXT PRIMARY KEY, repository TEXT NOT NULL, body TEXT NOT NULL) STRICT;
          CREATE TABLE repository_leases (repository TEXT PRIMARY KEY, owner TEXT NOT NULL, pid INTEGER NOT NULL) STRICT;
          PRAGMA user_version=8;
        `);
      });
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  transaction = <T>(operation: () => T): T => {
    const nested = this.transactionDepth > 0;
    const savepoint = `senslop_${this.transactionDepth}`;
    this.database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    this.transactionDepth++;
    try {
      const result = operation();
      this.database.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      return result;
    } catch (error) {
      this.database.exec(
        nested
          ? `ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`
          : "ROLLBACK",
      );
      throw error;
    } finally {
      this.transactionDepth--;
    }
  };

  getReview = (repository: string, id: string): SavedReviewSchema | null => {
    const existingReview = this.database
      .prepare("SELECT body FROM reviews WHERE repository = ? AND id = ?")
      .get(repository, id);
    return existingReview
      ? savedReviewSchema.parse(JSON.parse(String(existingReview.body)))
      : null;
  };

  listReviews = (
    repository: string,
    search = "",
    page?: { offset: number; limit: number },
  ) => {
    const query = `
      SELECT id, repository,
        json_extract(body, '$.directory') AS directory,
        json_extract(body, '$.round') AS round,
        json_extract(body, '$.title') AS title,
        json_extract(body, '$.createdAt') AS created_at,
        json_extract(body, '$.updatedAt') AS updated_at,
        json_extract(body, '$.hash') AS hash,
        json_extract(body, '$.source.kind') AS kind,
        json_array_length(body, '$.files') AS file_count,
        json_array_length(body, '$.notes') AS note_count,
        json_array_length(body, '$.completedPaths') AS completed_count
      FROM reviews
      WHERE repository = ? AND (
        instr(lower(json_extract(body, '$.title')), lower(?)) > 0
        OR instr(lower(COALESCE(json_extract(body, '$.directory'), '')), lower(?)) > 0
      )
      ORDER BY rowid DESC
      ${page ? "LIMIT ? OFFSET ?" : ""}
    `;
    const normalizedSearch = search.trim().slice(0, 200);
    const parameters = [
      repository,
      normalizedSearch,
      normalizedSearch,
      ...(page ? [page.limit, page.offset] : []),
    ];
    const existingReviews = this.database.prepare(query).all(...parameters);
    return existingReviews.map((row) => ({
      id: String(row.id),
      repository: String(row.repository),
      directory: row.directory === null ? null : String(row.directory),
      round: Number(row.round ?? 1),
      title: String(row.title),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      hash: String(row.hash),
      kind: String(row.kind),
      fileCount: Number(row.file_count),
      noteCount: Number(row.note_count),
      completedCount: Number(row.completed_count),
    }));
  };

  currentReview = (repository: string) => {
    const existingReview = this.database
      .prepare("SELECT review_id FROM active_reviews WHERE repository = ?")
      .get(repository);
    return existingReview
      ? this.getReview(repository, String(existingReview.review_id))
      : null;
  };

  openReview = (repository: string, id: string) =>
    this.transaction(() => {
      const existingReview = this.getReview(repository, id);
      if (!existingReview)
        throw new Error("Saved review not found in this repository.");
      this.database
        .prepare(
          "INSERT INTO active_reviews VALUES (?, ?) ON CONFLICT(repository) DO UPDATE SET review_id = excluded.review_id",
        )
        .run(repository, id);
      return existingReview;
    });

  saveReview = (
    repository: string,
    input: LocalPreviewSchema,
    fingerprint: string | null,
    groupingEnabled = false,
    metadata: Partial<
      Pick<
        SavedReviewSchema,
        | "directory"
        | "repositoryState"
        | "syncBaseline"
        | "previousReviewId"
        | "resyncMode"
      >
    > & {
      expectedHash?: string;
      expectedRound?: number;
      activate?: boolean;
    } = {},
  ) =>
    this.transaction(() => {
      const preview = localPreviewSchema.parse(input);
      const existingReview = this.getReview(repository, preview.id);
      const keep = metadata.resyncMode === "keep";
      if (existingReview && !keep) return existingReview;
      const previousReview = metadata.previousReviewId
        ? this.getReview(repository, metadata.previousReviewId)
        : null;
      if (
        (keep && !previousReview) ||
        (metadata.previousReviewId &&
          (previousReview?.id !== metadata.previousReviewId ||
            (metadata.expectedHash &&
              previousReview.hash !== metadata.expectedHash) ||
            (metadata.expectedRound &&
              previousReview?.round !== metadata.expectedRound)))
      )
        throw new Error("Review contents changed. Reload and retry re-sync.");
      if (keep && previousReview) preview.id = previousReview.id;
      const now = new Date().toISOString();
      const unchanged = new Set(
        preview.files
          .filter((file) =>
            previousReview?.files.some(
              (previous) =>
                previous.path === file.path &&
                previous.beforeHash === file.beforeHash &&
                previous.afterHash === file.afterHash,
            ),
          )
          .map((file) => file.path),
      );
      const carriedNotes = new Map(
        carrySnapshotNotes(
          previousReview?.notes ?? [],
          preview.files,
          preview.id,
        ).map((note) => [note.id, note]),
      );
      const saved = savedReviewSchema.parse({
        ...preview,
        groupingEnabled,
        ...metadata,
        directory: keep ? previousReview?.directory : metadata.directory,
        previousReviewId: keep
          ? previousReview?.previousReviewId
          : metadata.previousReviewId,
        round: previousReview ? previousReview.round + 1 : 1,
        title:
          previousReview?.title ??
          `Review: ${preview.source.head?.slice(0, 8) ?? "uncommitted changes"}`,
        hash: createHash("sha256")
          .update(
            JSON.stringify({
              source: preview.source,
              files: preview.files,
              excluded: preview.excluded,
            }),
          )
          .digest("hex"),
        fingerprint,
        createdAt: keep ? (previousReview?.createdAt ?? now) : now,
        updatedAt: now,
        revision: keep ? (previousReview?.revision ?? 0) + 1 : 0,
        notes: keep
          ? (previousReview?.notes.map(
              (note) =>
                carriedNotes.get(note.id) ?? {
                  ...note,
                  previewId: preview.id,
                  line: null,
                },
            ) ?? [])
          : [],
        completedPaths: keep
          ? (previousReview?.completedPaths.filter((path) =>
              unchanged.has(path),
            ) ?? [])
          : [],
        selectedPath:
          keep &&
          preview.files.some(
            (file) => file.path === previousReview?.selectedPath,
          )
            ? previousReview!.selectedPath
            : (preview.files[0]?.path ?? null),
      });
      if (previousReview && !keep) {
        previousReview.completedPaths = previousReview.files.map(
          (file) => file.path,
        );
        previousReview.updatedAt = now;
        previousReview.revision++;
        this.database
          .prepare(
            "UPDATE reviews SET body = ? WHERE repository = ? AND id = ?",
          )
          .run(JSON.stringify(previousReview), repository, previousReview.id);
      }
      if (keep && previousReview) {
        this.database
          .prepare(
            "UPDATE review_rounds SET body=?, context = (SELECT body FROM ai_context WHERE snapshot_id = ?) WHERE review_id = ? AND round = ?",
          )
          .run(
            JSON.stringify(previousReview),
            saved.id,
            saved.id,
            previousReview.round,
          );
        this.database
          .prepare(
            "UPDATE ai_jobs SET body = json_set(body, '$.snapshotRound', ?) WHERE snapshot_id = ? AND json_type(body, '$.snapshotRound') IS NULL",
          )
          .run(previousReview.round, saved.id);
        this.database
          .prepare(
            "UPDATE reviews SET body = ? WHERE repository = ? AND id = ?",
          )
          .run(JSON.stringify(saved), repository, saved.id);
        // Retain the previous content for incremental grouping while rebuilding its source cache.
        this.database
          .prepare(
            "INSERT INTO ai_context VALUES (?, ?) ON CONFLICT(snapshot_id) DO UPDATE SET body = excluded.body",
          )
          .run(saved.id, JSON.stringify({ previousReview }));
        this.database
          .prepare(
            "UPDATE ai_jobs SET body = json_set(body, '$.status', 'canceled', '$.progress', 'Superseded by re-sync', '$.updatedAt', ?) WHERE snapshot_id = ? AND json_extract(body, '$.status') IN ('queued', 'running')",
          )
          .run(now, saved.id);
      } else {
        this.database
          .prepare("INSERT INTO reviews VALUES (?, ?, ?)")
          .run(saved.id, repository, JSON.stringify(saved));
      }
      this.database
        .prepare(
          "INSERT OR IGNORE INTO review_rounds (review_id, round, body) VALUES (?, ?, ?)",
        )
        .run(saved.id, saved.round, JSON.stringify(saved));
      const reviewCount = Number(
        this.database
          .prepare("SELECT count(*) AS count FROM reviews WHERE repository = ?")
          .get(repository)?.count,
      );
      if (metadata.activate !== false || reviewCount === 1)
        this.database
          .prepare(
            "INSERT INTO active_reviews VALUES (?, ?) ON CONFLICT(repository) DO UPDATE SET review_id = excluded.review_id",
          )
          .run(repository, saved.id);
      return saved;
    });

  changeReview = (
    repository: string,
    id: string,
    input: ReviewChangeSchema,
    expected?: Pick<SavedReviewSchema, "hash" | "round">,
    options?: { preserveUnitCompletion?: boolean },
  ) =>
    this.transaction(() => {
      const change = reviewChangeSchema.parse(input);
      const existingReview = this.getReview(repository, id);
      if (!existingReview)
        throw new Error("Saved review not found in this repository.");
      if (
        expected &&
        (existingReview.hash !== expected.hash ||
          existingReview.round !== expected.round)
      )
        throw new Error("Review contents changed. Reload and retry.");
      const requirePath = (path: string) => {
        if (!existingReview.files.some((file) => file.path === path))
          throw new Error("File does not belong to this snapshot.");
      };
      switch (change.action) {
        case "rename":
          existingReview.title = change.title;
          break;
        case "select":
          requirePath(change.path);
          existingReview.selectedPath = change.path;
          break;
        case "complete":
          requirePath(change.path);
          existingReview.completedPaths = existingReview.completedPaths.filter(
            (path) => path !== change.path,
          );
          if (change.complete) existingReview.completedPaths.push(change.path);
          if (!options?.preserveUnitCompletion) {
            const row = this.database
              .prepare(
                "SELECT body FROM review_precision WHERE review_id=? AND round=?",
              )
              .get(id, existingReview.round);
            if (row) {
              const organization = organizationSchema.parse(
                JSON.parse(String(row.body)),
              );
              for (const unit of organization.units)
                if (unit.path === change.path) {
                  unit.reviewed = change.complete;
                  unit.needsReview = false;
                }
              organization.version++;
              this.database
                .prepare(
                  "UPDATE review_precision SET body=? WHERE review_id=? AND round=?",
                )
                .run(JSON.stringify(organization), id, existingReview.round);
            }
          }
          break;
        case "add-note": {
          requirePath(change.note.path);
          if (change.note.previewId !== id)
            throw new Error("Note does not belong to this snapshot.");
          const file = existingReview.files.find(
            (file) => file.path === change.note.path,
          )!;
          if (change.note.line) {
            const content =
              change.note.line.side === "additions" ? file.after : file.before;
            const start = change.note.line.lineNumber;
            const end = change.note.line.endLineNumber ?? start;
            const lines = content?.split("\n");
            if (
              !lines ||
              end > lines.length ||
              lines.slice(start - 1, end).join("\n") !== change.note.line.code
            )
              throw new Error("Note line does not match the frozen snapshot.");
          }
          if (!existingReview.notes.some((note) => note.id === change.note.id))
            existingReview.notes.push(change.note);
          break;
        }
        case "edit-note": {
          const note = existingReview.notes.find(
            (note) => note.id === change.id,
          );
          if (!note) throw new Error("Note not found in this review.");
          note.body = change.body;
          break;
        }
        case "delete-note":
          existingReview.notes = existingReview.notes.filter(
            (note) => note.id !== change.id,
          );
          break;
      }
      existingReview.revision++;
      existingReview.updatedAt = new Date().toISOString();
      const saved = savedReviewSchema.parse(existingReview);
      this.database
        .prepare("UPDATE reviews SET body = ? WHERE repository = ? AND id = ?")
        .run(JSON.stringify(saved), repository, id);
      return saved;
    });

  enableGrouping = (repository: string, id: string) =>
    this.transaction(() => {
      const existingReview = this.getReview(repository, id);
      if (!existingReview)
        throw new Error("Saved review not found in this repository.");
      if (existingReview.groupingEnabled !== false) return;
      const updatedReview = {
        ...existingReview,
        groupingEnabled: true,
        revision: existingReview.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      this.database
        .prepare("UPDATE reviews SET body = ? WHERE repository = ? AND id = ?")
        .run(JSON.stringify(updatedReview), repository, id);
    });

  deleteReview = (
    repository: string,
    id: string,
    expected?: Pick<SavedReviewSchema, "hash" | "round">,
  ) => {
    this.transaction(() => {
      const existingReview = this.getReview(repository, id);
      if (
        expected &&
        (existingReview?.hash !== expected.hash ||
          existingReview.round !== expected.round)
      )
        throw new Error("Review contents changed. Reload and retry.");
      const deletedReview = this.database
        .prepare("DELETE FROM reviews WHERE repository = ? AND id = ?")
        .run(repository, id);
      if (!deletedReview.changes)
        throw new Error("Saved review not found in this repository.");
      this.database
        .prepare("DELETE FROM preferences WHERE name=?")
        .run(`review_rules:${id}`);
      this.database
        .prepare("DELETE FROM preferences WHERE name LIKE ?")
        .run(`workflow-history:${id}:%`);
    });
    this.database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  };

  close = () => this.database.close();
}
