import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  localPreviewSchema,
  savedReviewSchema,
  reviewChangeSchema,
  type LocalPreviewSchema,
  type SavedReviewSchema,
  type ReviewChangeSchema,
} from "@senslop/contracts";

export class LocalStore {
  readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(path);
    try {
      chmodSync(path, 0o600);
      this.database.exec(
        "PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON; PRAGMA journal_mode = WAL;",
      );
      this.transaction(() => {
        const version = Number(
          this.database.prepare("PRAGMA user_version").get()?.user_version,
        );
        if (version > 2)
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
      });
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  transaction = <T>(operation: () => T): T => {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
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

  listReviews = (repository: string, search = "") => {
    const existingReviews = this.database
      .prepare(
        "SELECT body FROM reviews WHERE repository = ? AND instr(lower(json_extract(body, '$.title')), lower(?)) > 0 ORDER BY rowid DESC",
      )
      .all(repository, search.trim().slice(0, 200));
    return existingReviews.map((row) => {
      const review = savedReviewSchema.parse(JSON.parse(String(row.body)));
      return {
        id: review.id,
        title: review.title,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        hash: review.hash,
        kind: review.source.kind,
        fileCount: review.files.length,
        noteCount: review.notes.length,
        completedCount: review.completedPaths.length,
      };
    });
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
  ) =>
    this.transaction(() => {
      const preview = localPreviewSchema.parse(input);
      const existingReview = this.getReview(repository, preview.id);
      if (existingReview) return existingReview;
      const now = new Date().toISOString();
      const saved = savedReviewSchema.parse({
        ...preview,
        title: `Review: ${preview.source.head?.slice(0, 8) ?? "uncommitted changes"}`,
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
        createdAt: now,
        updatedAt: now,
        revision: 0,
        notes: [],
        completedPaths: [],
        selectedPath: preview.files[0]?.path ?? null,
      });
      this.database
        .prepare("INSERT INTO reviews VALUES (?, ?, ?)")
        .run(saved.id, repository, JSON.stringify(saved));
      this.database
        .prepare(
          "INSERT INTO active_reviews VALUES (?, ?) ON CONFLICT(repository) DO UPDATE SET review_id = excluded.review_id",
        )
        .run(repository, saved.id);
      return saved;
    });

  changeReview = (repository: string, id: string, input: ReviewChangeSchema) =>
    this.transaction(() => {
      const change = reviewChangeSchema.parse(input);
      const existingReview = this.getReview(repository, id);
      if (!existingReview)
        throw new Error("Saved review not found in this repository.");
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
            if (
              content?.split("\n")[change.note.line.lineNumber - 1] !==
              change.note.line.code
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

  deleteReview = (repository: string, id: string) => {
    this.transaction(() => {
      const deletedReview = this.database
        .prepare("DELETE FROM reviews WHERE repository = ? AND id = ?")
        .run(repository, id);
      if (!deletedReview.changes)
        throw new Error("Saved review not found in this repository.");
    });
    this.database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  };

  close = () => this.database.close();
}
