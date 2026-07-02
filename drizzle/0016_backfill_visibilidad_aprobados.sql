-- Backfill de visibilidad: los profesionales y auxiliares aprobados ANTES de
-- que la aprobación activara la visibilidad (fixes 4541b16 y 8848c71) quedaron
-- con remote_available=0 / accepting_requests=0 y por tanto fuera del feed
-- público (que exige status='approved' AND remote_available=1). Los publica,
-- EXCEPTO a quien un admin ocultó a propósito con el botón Ocultar
-- (audit_logs action='professional_hidden'). Aditiva y re-ejecutable: la 2ª
-- pasada no encuentra filas que actualizar.
UPDATE professionals
SET remote_available = 1,
    accepting_requests = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'approved'
  AND remote_available = 0
  AND id NOT IN (
    SELECT entity_id FROM audit_logs WHERE action = 'professional_hidden'
  );
