import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL ?? "file:./local.db";
const cloudflareTarget = process.env.PSICOAYUDA_DB_TARGET === "cloudflare";

type LibsqlClient = {
  execute(input: { sql: string; args: unknown[] }): Promise<{
    rows: Record<string, unknown>[];
    columns: string[];
  }>;
};

let localClientPromise: Promise<LibsqlClient> | undefined;

async function getD1Database() {
  if (!cloudflareTarget) {
    return undefined;
  }

  return (await getCloudflareContext({ async: true })).env.DB;
}

async function getLocalClient() {
  localClientPromise ??= import("node:module").then(({ createRequire }) => {
    const require = createRequire(import.meta.url);
    const dependency = "@libsql/client";
    const { createClient } = require(dependency) as {
      createClient(input: { url: string }): LibsqlClient;
    };

    return createClient({ url: databaseUrl });
  });
  return localClientPromise;
}

type AppDatabase = ReturnType<typeof drizzleProxy<typeof schema>>;

async function runD1Query(
  database: D1Database,
  sql: string,
  params: unknown[],
  method: "run" | "all" | "values" | "get",
) {
  const statement = database.prepare(sql).bind(...params);

  if (method === "values") {
    return { rows: await statement.raw() };
  }

  if (method === "get") {
    const row = await statement.first();
    return { rows: row ? [row] : [] };
  }

  if (method === "run") {
    await statement.run();
    return { rows: [] };
  }

  const result = await statement.all();
  return { rows: result.results ?? [] };
}

async function runLocalQuery(
  sql: string,
  params: unknown[],
  method: "run" | "all" | "values" | "get",
) {
  const client = await getLocalClient();
  const result = await client.execute({ sql, args: params });

  if (method === "values") {
    return {
      rows: result.rows.map((row) =>
        result.columns.map((column) => row[column]),
      ),
    };
  }

  if (method === "get") {
    return { rows: result.rows.slice(0, 1) };
  }

  return { rows: result.rows };
}

export const db: AppDatabase = drizzleProxy(
  async (sql, params, method) => {
    const d1Database = await getD1Database();

    if (d1Database) {
      return runD1Query(d1Database, sql, params, method);
    }

    return runLocalQuery(sql, params, method);
  },
  { schema },
);
