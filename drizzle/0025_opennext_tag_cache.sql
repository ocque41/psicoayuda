-- Tabla del tag cache de OpenNext (open-next.config.ts -> d1NextTagCache).
-- Guarda la última revalidación por tag/etiqueta de caché para soportar
-- revalidateTag/revalidatePath on-demand desde las server actions. La escribe
-- el Worker; sin esta tabla, las revalidaciones on-demand no persisten.
CREATE TABLE IF NOT EXISTS `revalidations` (
	`tag` text PRIMARY KEY NOT NULL,
	`revalidatedAt` integer,
	`stale` integer,
	`expire` integer
);
