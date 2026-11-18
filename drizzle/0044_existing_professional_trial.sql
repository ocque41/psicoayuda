-- Aditiva: fin de la prueba gratuita de 90 días para los profesionales que ya
-- estaban en Nido cuando el equipo los pasa al plan de suscripción. Queda NULL
-- para todos los perfiles actuales hasta ese paso. `access_trial_reminded_at`
-- marca el aviso único 7 días antes del fin. No modifica ni borra filas.
ALTER TABLE professionals ADD COLUMN access_trial_ends_at TEXT;
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN access_trial_reminded_at TEXT;
