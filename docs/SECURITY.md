# Auditoría de seguridad y aislamiento de datos

Auditoría exhaustiva (9 dimensiones, verificación adversarial de cada hallazgo):
24 hallazgos, **21 confirmados / 3 refutados**.

## Conclusión principal

**El modelo de aislamiento de datos es sólido.** No existe ninguna ruta
actualmente explotable por la que un usuario vea los datos de otro:

- Quien pide ayuda no tiene cuenta ni endpoints propios; sus datos solo los ven
  un admin (vía `requireAdmin`) o el profesional **asignado** (panel acotado
  `userId → professional.id → assignments`).
- Onboarding y disponibilidad de un profesional están acotados por `userId`.
- `/ayuda/gracias?solicitud=<id>` usa IDs UUIDv4 (122 bits) como URL-capacidad y
  no expone PII del solicitante; solo nombre de pila + bio del profesional.

Los dos hallazgos **genuinamente explotables** se han **corregido**: inyección de
fórmulas CSV y el fallback de secreto ante mala configuración. El resto eran
defensa en profundidad o lógica de negocio. La verificación adversarial **degradó**
el "forjado de sesión crítico" porque better-auth usa tokens opacos en BD (no JWT):
conocer el secreto no permite forjar una sesión existente.

## Corregido en el código (con prueba: 50 tests verdes, build OK)

| # | Sev | Arreglo | Archivos |
|---|-----|---------|----------|
| 1/3/14/16 | crit→med | Secreto de auth **falla en cerrado** en producción (build excluido); `trustedOrigins`; `requesterHash` ya no usa sal adivinable | `src/lib/auth-secret.ts`, `auth.ts`, `actions.ts` |
| 6 | med (explotable) | **Inyección de fórmulas CSV** neutralizada (`=,+,-,@,\t,\r` → prefijo `'`) | `src/lib/csv.ts`, `admin/export/route.ts` |
| 5 | med | `suggestProfessionalsForRequest` **proyecta columnas** (sin email/licencia/notas) | `src/lib/matching.ts` |
| 7 | med | **Cabeceras de seguridad** (CSP con `frame-ancestors 'none'`, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) | `next.config.ts` |
| 4 | high | `currentActiveRequests` **se decrementa** al cerrar/anonimizar (antes monótono) | `assignment.ts`, `actions.ts` |
| 12 | med | Suspender/rechazar **libera asignaciones** y devuelve solicitudes a la cola | `assignment.ts`, `actions.ts` |
| 8 | med | Rate limit de login de better-auth **activado** | `auth.ts` |
| 17/19/15 | low | Export CSV: **LIMIT** (5000), **audit log** del egreso, `nosniff` + `no-store` | `admin/export/route.ts` |
| 20 | low | Anonimización usa **token aleatorio** (sin enlace al id original) | `actions.ts` |
| 21 | low | Panel pro filtra por `assignments.status = 'assigned'` (frontera de autorización) | `pro/dashboard/page.tsx` |

## Acción operativa requerida (no es código)

1. **CRÍTICO**: configurar `BETTER_AUTH_SECRET` como secreto de Cloudflare:
   `wrangler secret put BETTER_AUTH_SECRET` (valor largo y aleatorio). Con el
   nuevo guard, si falta en producción el Worker falla en cerrado (mejor que
   firmar con un literal público). **Rotar** el valor si alguna vez se desplegó
   sin él.
2. Reforzar el rate limit de auth con un backend **durable** (KV/Durable Object)
   y/o una regla de **Cloudflare WAF** sobre `/api/auth/*` (en Workers el límite
   en memoria es por isolate).
3. Verificar que las cabeceras de seguridad aparecen en la respuesta del Worker
   desplegado (OpenNext aplica `next.config` `headers()`); si algún asset no las
   recibe, añadir `public/_headers`.

## Pendiente (follow-ups, fuera de este alcance — ver tareas creadas)

- **Retención automática (#10)**: la política promete cierre a 30 días y
  anonimización a 90 que **no está implementada**. Requiere un cron de Cloudflare
  + handler. *(tarea spawn creada)*
- **Rendimiento admin (#9/#17)**: el panel admin hace un scan por solicitud (N+1)
  y carga la tabla completa sin paginar. *(tarea spawn creada)*
- **Anti-abuso (#2)**: añadir Turnstile/CAPTCHA en `/ayuda` y un techo global por
  ventana (el límite por IP ya frena la rotación de email en producción).
- Bajo riesgo, solo nota: `/ayuda/gracias` es un oráculo de existencia de IDs
  (mitigado por UUID); huecos del `secret-scan.mjs`.
