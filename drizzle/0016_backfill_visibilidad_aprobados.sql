-- Backfill de visibilidad ACOTADO a las altas manuales del admin
-- (adminApproveIncompleteRegistration) anteriores a 4541b16, que insertaban el
-- perfil con remote_available=0 / accepting_requests=0 por diseño: son las
-- únicas filas ocultas cuyo estado NO expresa una decisión de la persona.
-- Un remote_available=0 en un perfil auto-registrado es un opt-out deliberado
-- (checkbox "disponible en remoto" del onboarding, marcado por defecto) y NO
-- debe republicarse sin su consentimiento; para casos puntuales existe el
-- botón Mostrar de /admin.
-- Guards:
--  * user_id con log de alta manual (professional_manual_approval_*; ese flujo
--    registra entity_id = user_id).
--  * support_areas = '[]': el alta manual crea la ficha sin áreas y el
--    onboarding exige al menos una — si hay áreas, la persona ya completó su
--    perfil y su visibilidad actual es su elección.
--  * fuera quien un admin ocultó a propósito (professional_hidden, con
--    entity_id = id del profesional).
UPDATE professionals
SET remote_available = 1,
    accepting_requests = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'approved'
  AND remote_available = 0
  AND support_areas = '[]'
  AND user_id IN (
    SELECT entity_id FROM audit_logs
    WHERE action IN (
      'professional_manual_approval_certified',
      'professional_manual_approval_non_clinical'
    )
  )
  AND id NOT IN (
    SELECT entity_id FROM audit_logs WHERE action = 'professional_hidden'
  );
