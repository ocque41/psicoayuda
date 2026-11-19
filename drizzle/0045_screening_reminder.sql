-- Aditiva: marca el recordatorio único a las candidaturas clínicas que aún no
-- enviaron el cuestionario 24 h después de registrarse. NULL para todos los
-- perfiles actuales. No modifica ni borra filas.
ALTER TABLE professionals ADD COLUMN screening_reminded_at TEXT;
