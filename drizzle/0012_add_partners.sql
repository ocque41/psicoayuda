CREATE TABLE `partners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`specialty` text,
	`description` text,
	`logo` text,
	`contacts` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `partners_status_order_idx` ON `partners` (`status`,`sort_order`);
--> statement-breakpoint
INSERT OR IGNORE INTO `partners` (`id`,`name`,`specialty`,`description`,`logo`,`contacts`,`status`,`sort_order`,`created_at`,`updated_at`) VALUES
('partner_guardianes-azules','Guardianes Azules','Acompañamiento emocional','Acompañamiento emocional a distancia. No estás solo: aquí caminamos contigo.','/partners/guardianes-azules.png','[{"type":"whatsapp","value":"+52 56 1823 4332"}]','published',10,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z'),
('partner_plafam','PLAFAM','Atención psicológica remota','Asociación Civil de Planificación Familiar. Línea gratuita de atención psicológica remota para acompañarte ante el miedo, la angustia o la ansiedad tras la catástrofe.',NULL,'[{"type":"whatsapp","value":"+58 412 227 3712"},{"type":"instagram","value":"plafamong"}]','published',20,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z'),
('partner_fundana','FUNDANA','Primeros Auxilios Psicológicos para mujeres','Servicio de Primeros Auxilios Psicológicos (PAP), gratuito y confidencial, con enfoque en mujeres. Horario de atención: 8:00 am a 5:00 pm.',NULL,'[{"label":"Francys Bigott","type":"whatsapp","value":"04126464253"},{"label":"Yulissa Dickson","type":"whatsapp","value":"04121466694"},{"label":"Flor Betancourt","type":"whatsapp","value":"04241986658"},{"label":"Yessica Zambrano","type":"whatsapp","value":"04241232234"}]','published',30,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z'),
('partner_sin-toc','SIN TOC','Atención psiquiátrica y psicológica en línea','Atención psiquiátrica y psicológica gratuita para venezolanos en momentos de crisis. Atención en línea.',NULL,'[{"type":"whatsapp","value":"+52 33 2542 9658"},{"type":"instagram","value":"sin_toc_"}]','published',40,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z'),
('partner_psicolinea-ucab','PsicoLínea UCAB','Atención psicológica gratuita (UCAB)','PsicoLínea de la Universidad Católica Andrés Bello (PsicoData Venezuela). Atención psicológica gratuita y confidencial, todos los días de 8:00 am a 5:00 pm.',NULL,'[{"label":"Línea 1","type":"whatsapp","value":"0414 121 7882"},{"label":"Línea 2","type":"whatsapp","value":"0424 172 3981"}]','published',50,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z'),
('partner_previasis','PREVIASÍS','Apoyo psicológico para niños y adultos','Apoyo psicológico gratuito para grandes y pequeños: orientación, calma y guía para quienes atraviesan momentos difíciles.',NULL,'[{"type":"whatsapp","value":"0424 505 1851"},{"type":"instagram","value":"previasis"}]','published',60,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z');