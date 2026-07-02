-- Fija los logos de los aliados que se sembraron sin logo en 0012.
-- Necesario porque 0012 ya estaba aplicado en producción cuando se añadieron los
-- logos, y wrangler no re-aplica una migración ya marcada como aplicada. El guard
-- (logo NULL o vacío) evita pisar un logo que un admin haya subido desde el panel.
UPDATE `partners` SET `logo` = '/partners/plafam.png' WHERE `id` = 'partner_plafam' AND (`logo` IS NULL OR `logo` = '');
--> statement-breakpoint
UPDATE `partners` SET `logo` = '/partners/fundana.png' WHERE `id` = 'partner_fundana' AND (`logo` IS NULL OR `logo` = '');
--> statement-breakpoint
UPDATE `partners` SET `logo` = '/partners/previasis.png' WHERE `id` = 'partner_previasis' AND (`logo` IS NULL OR `logo` = '');
--> statement-breakpoint
UPDATE `partners` SET `logo` = '/partners/psicolinea-ucab.png' WHERE `id` = 'partner_psicolinea-ucab' AND (`logo` IS NULL OR `logo` = '');
