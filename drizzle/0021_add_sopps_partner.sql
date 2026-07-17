-- Publica a la Sociedad Peruana de Psicoterapeutas como organización aliada.
-- Esta migración es aditiva e idempotente: no modifica ni elimina filas
-- existentes y puede volver a ejecutarse con seguridad.
INSERT OR IGNORE INTO `partners` (`id`,`name`,`specialty`,`description`,`logo`,`contacts`,`status`,`sort_order`,`created_at`,`updated_at`) VALUES
('partner-sopps-peru','Sociedad Peruana de Psicoterapeutas','Consejería psicológica a través de PAP','La Sociedad Peruana de Psicoterapeutas (SOPPS) brinda consejería psicológica a través de Primeros Auxilios Psicológicos (PAP).','/partners/sopps.png','[{"label":"Paula López de Romaña","type":"whatsapp","value":"+51991802871"},{"label":"Paula López de Romaña","type":"phone","value":"+51991802871"},{"label":"Paula López de Romaña","type":"email","value":"paulalopezderomana2000@gmail.com"},{"type":"website","value":"https://sopps.org/"}]','published',110,'2026-07-16T00:00:00.000Z','2026-07-16T00:00:00.000Z');
