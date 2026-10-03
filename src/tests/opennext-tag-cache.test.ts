import { readFile } from "node:fs/promises";
import { type Client, createClient, type InValue } from "@libsql/client";
import { D1NextModeTagCache } from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const BUILD = "fixture-build";
let originalMigration: string;
let upsertMigration: string;
let client: Client;
let cache: D1NextModeTagCache;

// El adaptador instalado ejecuta su SQL real en SQLite aislado en memoria.
// Solo se sustituye el transporte D1: no se simulan INSERT ni el trigger.
function localD1(database: Client) {
  return {
    prepare(sql: string) {
      let args: InValue[] = [];
      const statement = {
        sql,
        get args() {
          return args;
        },
        bind(...values: InValue[]) {
          args = values;
          return statement;
        },
        async raw() {
          const result = await database.execute({ sql, args });
          return result.rows.map((row) =>
            result.columns.map((column) => row[column]),
          );
        },
      };
      return statement;
    },
    batch(statements: { sql: string; args: InValue[] }[]) {
      return database.batch(statements, "write");
    },
  };
}

async function rows() {
  return (
    await client.execute(
      "SELECT tag,revalidatedAt,stale,expire FROM revalidations ORDER BY tag",
    )
  ).rows.map((row) => ({ ...row }));
}
async function migrate() {
  await client.execute(upsertMigration);
}

describe("revalidaciones OpenNext repetidas sin reconstruir la caché D1", () => {
  beforeAll(async () => {
    originalMigration = await readFile(
      new URL("../../drizzle/0025_opennext_tag_cache.sql", import.meta.url),
      "utf8",
    );
    upsertMigration = await readFile(
      new URL(
        "../../drizzle/0031_opennext_tag_cache_upsert.sql",
        import.meta.url,
      ),
      "utf8",
    );
  });
  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute(originalMigration);
    vi.stubEnv("OPEN_NEXT_BUILD_ID", BUILD);
    vi.stubGlobal("openNextConfig", {});
    vi.stubGlobal("__openNextAls", undefined);
    vi.stubGlobal(Symbol.for("__cloudflare-context__"), {
      env: { NEXT_TAG_CACHE_D1: localD1(client) },
    });
    cache = new D1NextModeTagCache();
  });
  afterEach(() => {
    client.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reproduce el conflicto del adaptador y la migración permite repetir la misma etiqueta", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    await cache.writeTags(["professionals"]);
    clock.mockReturnValue(2000);
    await expect(cache.writeTags(["professionals"])).rejects.toThrow(
      "UNIQUE constraint failed: revalidations.tag",
    );
    expect(await rows()).toEqual([
      {
        tag: `${BUILD}/professionals`,
        revalidatedAt: 1000,
        stale: 1000,
        expire: null,
      },
    ]);
    await migrate();
    await cache.writeTags(["professionals"]);
    clock.mockReturnValue(3000);
    await cache.writeTags(["professionals"]);
    expect(await rows()).toEqual([
      {
        tag: `${BUILD}/professionals`,
        revalidatedAt: 3000,
        stale: 3000,
        expire: null,
      },
    ]);
    expect(await cache.getLastRevalidated(["professionals"])).toBe(3000);
    expect(await cache.hasBeenRevalidated(["professionals"], 2000)).toBe(true);
  });

  it("instalar y repetir la migración conserva las filas y el esquema original", async () => {
    await cache.writeTags([
      { tag: "professionals", stale: 10, expire: 15 },
      { tag: "partners", stale: 20 },
    ]);
    const before = await rows();
    const schema = await client.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='revalidations'",
    );
    await migrate();
    await migrate();
    expect(await rows()).toEqual(before);
    expect(
      (
        await client.execute(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='revalidations'",
        )
      ).rows,
    ).toEqual(schema.rows);
    expect(
      (
        await client.execute(
          "SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name='revalidations_update_existing_tag'",
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("actualiza todos los campos y restablece expire a NULL al volver a una etiqueta simple", async () => {
    await migrate();
    await cache.writeTags([{ tag: "professionals", stale: 100, expire: 150 }]);
    await cache.writeTags([{ tag: "professionals", stale: 200, expire: 240 }]);
    expect(await rows()).toEqual([
      {
        tag: `${BUILD}/professionals`,
        revalidatedAt: 200,
        stale: 200,
        expire: 240,
      },
    ]);
    vi.spyOn(Date, "now").mockReturnValue(300);
    await cache.writeTags(["professionals"]);
    expect(await rows()).toEqual([
      {
        tag: `${BUILD}/professionals`,
        revalidatedAt: 300,
        stale: 300,
        expire: null,
      },
    ]);
    await cache.writeTags([{ tag: "professionals", stale: 400 }]);
    expect(await rows()).toEqual([
      {
        tag: `${BUILD}/professionals`,
        revalidatedAt: 400,
        stale: 400,
        expire: null,
      },
    ]);
  });

  it("un batch con etiquetas repetidas y distintas termina completo y mantiene una fila por etiqueta", async () => {
    await migrate();
    vi.spyOn(Date, "now").mockReturnValue(500);
    await cache.writeTags(["professionals", "professionals", "partners"]);
    await cache.writeTags([
      { tag: "professionals", stale: 600, expire: 700 },
      { tag: "new-tag", stale: 800 },
    ]);
    expect(await rows()).toEqual([
      { tag: `${BUILD}/new-tag`, revalidatedAt: 800, stale: 800, expire: null },
      {
        tag: `${BUILD}/partners`,
        revalidatedAt: 500,
        stale: 500,
        expire: null,
      },
      {
        tag: `${BUILD}/professionals`,
        revalidatedAt: 600,
        stale: 600,
        expire: 700,
      },
    ]);
  });

  it("revalidar una etiqueta conserva otras etiquetas y el mismo nombre de otro build", async () => {
    await client.execute({
      sql: "INSERT INTO revalidations(tag,revalidatedAt,stale,expire) VALUES (?,?,?,?)",
      args: ["fixture-previous-build/professionals", 1, 1, 2],
    });
    await cache.writeTags([{ tag: "partners", stale: 10, expire: 20 }]);
    await migrate();
    await cache.writeTags([{ tag: "professionals", stale: 30, expire: 40 }]);
    await cache.writeTags([{ tag: "professionals", stale: 50 }]);
    expect(await rows()).toEqual([
      { tag: `${BUILD}/partners`, revalidatedAt: 10, stale: 10, expire: 20 },
      {
        tag: `${BUILD}/professionals`,
        revalidatedAt: 50,
        stale: 50,
        expire: null,
      },
      {
        tag: "fixture-previous-build/professionals",
        revalidatedAt: 1,
        stale: 1,
        expire: 2,
      },
    ]);
  });

  it("mantiene NOT NULL y no oculta errores distintos a la repetición de una etiqueta", async () => {
    await migrate();
    await cache.writeTags([{ tag: "professionals", stale: 10 }]);
    await expect(
      client.execute({
        sql: "INSERT INTO revalidations(tag,revalidatedAt,stale,expire) VALUES (?,?,?,?)",
        args: [null, 20, 20, null],
      }),
    ).rejects.toThrow("NOT NULL constraint failed");
    expect(await rows()).toEqual([
      {
        tag: `${BUILD}/professionals`,
        revalidatedAt: 10,
        stale: 10,
        expire: null,
      },
    ]);
  });
});
