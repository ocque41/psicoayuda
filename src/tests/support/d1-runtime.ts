import { createRequire } from "node:module";

/**
 * D1 local en memoria para las pruebas de atomicidad. Usa el mismo miniflare
 * que trae wrangler (así la prueba corre sobre el runtime que despliega). Desde
 * miniflare 5 las opciones planas (modules/script/d1Databases) se pasan por
 * `convertV4MiniflareOptions`; no toca ninguna base remota.
 */
export type D1Runtime = {
  getD1Database(name: string): Promise<D1Database>;
  dispose(): Promise<void>;
};

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve("wrangler/package.json"),
)("miniflare") as {
  Miniflare: new (options: unknown) => D1Runtime;
  convertV4MiniflareOptions: (options: unknown) => unknown;
};

export function createD1Runtime(databaseId: string): D1Runtime {
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('fixture')}}",
      compatibilityDate: "2026-06-28",
      d1Databases: { DB: databaseId },
    }),
  );
}
