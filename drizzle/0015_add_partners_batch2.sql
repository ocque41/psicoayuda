-- Segunda tanda de aliados verificados (organizaciones nacionales de salud mental
-- que dan apoyo psicológico gratuito a venezolanos). Se publican con su CANAL
-- OFICIAL como contacto (web/Instagram), que siempre tiene el número vigente; el
-- equipo puede añadir un teléfono confirmado desde /admin. INSERT OR IGNORE para
-- que re-aplicar la migración sea seguro.
INSERT OR IGNORE INTO `partners` (`id`,`name`,`specialty`,`description`,`logo`,`contacts`,`status`,`sort_order`,`created_at`,`updated_at`) VALUES
('partner_fpv-lapsi','Línea LAPSI · Federación de Psicólogos de Venezuela','Línea de ayuda psicológica gratuita (nacional)','Línea de Ayuda Psicológica (LAPSI) de la Federación de Psicólogos de Venezuela: apoyo psicoemocional gratuito, anónimo y confidencial, atendido por psicólogos voluntarios de todo el país.','/partners/fpv-lapsi.png','[{"type":"website","value":"fpv.org.ve"}]','published',70,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z'),
('partner_psf-venezuela','Psicólogos Sin Fronteras Venezuela','Primeros Auxilios Psicológicos en crisis y duelo',NULL,'[{"type":"instagram","value":"psfvenezuela"}]','published',80,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z'),
('partner_cecodap','CECODAP','Apoyo psicológico a niñez, adolescencia y familias','Organización venezolana de derechos de la niñez y la adolescencia. Ofrece atención psicológica gratuita a niñas, niños, adolescentes y sus familias.',NULL,'[{"type":"website","value":"cecodap.org.ve"}]','published',90,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z'),
('partner_msf-venezuela','Médicos Sin Fronteras','Apoyo psicológico gratuito y confidencial','Organización médica humanitaria internacional. En Venezuela ofrece apoyo psicológico gratuito y confidencial; consulta su web oficial para el canal de atención vigente.','/partners/msf-venezuela.png','[{"type":"website","value":"msf.org"}]','published',100,'2026-07-02T00:00:00.000Z','2026-07-02T00:00:00.000Z');
