-- OpenNext escribe INSERT sin UPSERT para las revalidaciones repetidas.
-- Conserva la tabla y todas sus filas; solo actualiza la etiqueta insertada.
CREATE TRIGGER IF NOT EXISTS revalidations_update_existing_tag
BEFORE INSERT ON revalidations
WHEN EXISTS (SELECT 1 FROM revalidations WHERE tag = NEW.tag)
BEGIN
 UPDATE revalidations
 SET tag = NEW.tag,
     revalidatedAt = NEW.revalidatedAt,
     stale = NEW.stale,
     expire = NEW.expire
 WHERE tag = NEW.tag;
 SELECT RAISE(IGNORE);
END;
