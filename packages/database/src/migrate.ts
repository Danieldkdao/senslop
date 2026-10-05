import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { serverEnv } from "./data/env/migration";

const url = serverEnv.DATABASE_URL_UNPOOLED;
if (new URL(url).hostname.includes("-pooler"))
  throw new Error("Migration URL must be direct, not pooled.");
const db = drizzle(url);
try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
} finally {
  await db.$client.end();
}
