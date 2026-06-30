import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL ?? "file:./local.db";
const cloudflareTarget = process.env.NIDO_DB_TARGET === "cloudflare";

type SqliteMethod = "run" | "all" | "values" | "get";
type ProxyQuery = { sql: string; params: unknown[]; method: SqliteMethod };

type LibsqlResultSet = {
  rows: Record<string, unknown>[];
  columns: string[];
};

type LibsqlClient = {
  execute(input: { sql: string; args: unknown[] }): Promise<LibsqlResultSet>;
  batch(
    stmts: { sql: string; args: unknown[] }[],
    mode: "write",
  ): Promise<LibsqlResultSet[]>;
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
  method: SqliteMethod,
) {
  const statement = database.prepare(sql).bind(...params);

  if (method === "values") {
    return { rows: await statement.raw() };
  }

  if (method === "get") {
    const rows = await statement.raw();
    return { rows: rows[0] as unknown[] };
  }

  if (method === "run") {
    await statement.run();
    return { rows: [] };
  }

  return { rows: await statement.raw() };
}

function mapLocalResult(result: LibsqlResultSet, method: SqliteMethod) {
  if (method === "run") {
    return { rows: [] };
  }
  const valueRows = result.rows.map((row) =>
    result.columns.map((column) => row[column]),
  );
  if (method === "get") {
    return { rows: (valueRows[0] ?? undefined) as unknown[] };
  }
  return { rows: valueRows };
}

async function runLocalQuery(
  sql: string,
  params: unknown[],
  method: SqliteMethod,
) {
  const client = await getLocalClient();
  return mapLocalResult(await client.execute({ sql, args: params }), method);
}

// --- Batch atómico ---------------------------------------------------------
// D1 rechaza transacciones interactivas por SQL (BEGIN/COMMIT), pero tanto
// `D1Database.batch()` como el `batch()` de libSQL ejecutan todas las sentencias
// en UNA transacción implícita (todo-o-nada). Esto da atomicidad real a los
// flujos multi-escritura (p.ej. acceptOffer) sin la compensación frágil que
// dejaba conversaciones huérfanas o duplicadas ante un fallo a medias.
async function runD1Batch(database: D1Database, batch: ProxyQuery[]) {
  const statements = batch.map((query) =>
    database.prepare(query.sql).bind(...query.params),
  );
  const results = await database.batch<Record<string, unknown>>(statements);
  return results.map((result, index) => {
    const method = batch[index].method;
    if (method === "run") {
      return { rows: [] };
    }
    const valueRows = (result.results ?? []).map((row) => Object.values(row));
    if (method === "get") {
      return { rows: (valueRows[0] ?? undefined) as unknown[] };
    }
    return { rows: valueRows };
  });
}

async function runLocalBatch(batch: ProxyQuery[]) {
  const client = await getLocalClient();
  const results = await client.batch(
    batch.map((query) => ({ sql: query.sql, args: query.params })),
    "write",
  );
  return results.map((result, index) =>
    mapLocalResult(result, batch[index].method),
  );
}

export const db: AppDatabase = drizzleProxy(
  async (sql, params, method) => {
    const d1Database = await getD1Database();

    if (d1Database) {
      return runD1Query(d1Database, sql, params, method);
    }

    return runLocalQuery(sql, params, method);
  },
  async (batch) => {
    const d1Database = await getD1Database();

    if (d1Database) {
      return runD1Batch(d1Database, batch);
    }

    return runLocalBatch(batch);
  },
  { schema },
);
