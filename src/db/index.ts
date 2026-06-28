import "server-only";

import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL ?? "file:./local.db";

export const db = drizzle({
  connection: {
    url: databaseUrl,
  },
  schema,
});
