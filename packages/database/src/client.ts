import { drizzle } from "drizzle-orm/node-postgres";
import { serverEnv } from "./data/env/server";
import * as schema from "./schema";

export const db = drizzle({
  connection: {
    connectionString: serverEnv.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  },
  schema,
});
