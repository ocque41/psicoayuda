import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

// Caché persistente para ISR y data cache:
//  - KV (NEXT_INC_CACHE_KV): guarda las páginas prerenderizadas/ISR y los
//    resultados de `unstable_cache` entre requests y entre isolates. Sin esto
//    cada visita re-renderizaba la página y volvía a consultar D1 (la caché por
//    defecto era "dummy", solo válida para desarrollo).
//  - Cola en Durable Object (NEXT_CACHE_DO_QUEUE): revalida en segundo plano
//    (stale-while-revalidate) para que la visita que llega al caducar no espere.
//  - Tag cache en D1 (NEXT_TAG_CACHE_D1): soporta `revalidateTag`/`revalidatePath`
//    on-demand desde las server actions (aprobaciones, cambios de perfil, aliados).
//  - `enableCacheInterception`: sirve desde la caché del edge antes de ejecutar
//    el handler de Next; en un HIT no se re-renderiza nada.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  queue: doQueue,
  tagCache: d1NextTagCache,
  enableCacheInterception: true,
});
