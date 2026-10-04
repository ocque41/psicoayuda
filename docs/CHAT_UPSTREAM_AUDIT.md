# Auditoría semántica de chat y lista de espera

Corte reproducible: `aca220d..3479233` (nueve commits, 73 rutas upstream), sobre base CRM `f1c69cd`; árbol de integración revisado `664d40d466bc48e8659a6c84d61ac2ba565c9d68`. Se revisan blobs/deltas y las funciones locales, no la fuente integrada en curso del coordinador. El JSON compañero conserva SHA completo de cada blob (dos bloques hex de 20 separados por dos puntos) base/upstream/corte; modificar un archivo no demuestra por sí solo que todos sus cambios upstream estén integrados.

La auditoría y la restitución acotada del tracking de Contactar ahora están en el commit que contiene este documento. El inventario de blobs usa el corte anterior a esa restitución y a las actualizaciones documentales. No hay merge global ni se declara integrado todo upstream por ascendencia.

## Decisiones de comportamiento

- Recuperación/E2EE: integrar la ausencia de rotación silenciosa del estado final de 7e0c7b3/3479233. No reaplicar la rotación automática intermedia 7bb1827 ni sus claims de CHANGELOG0.14.1. Claves por cuenta, respaldo confirmado, código profesional único y consentimiento para cambio explícito. Guardas frescas y descarte de respuestas tardías se endurecieron en 16b98a2/9e9c7fe.
- Acceso: aceptar SIDs registrados de esta sala, no sólo original. El enlace concede acceso; el código concede descifrado. 664d40d separa permiso de enlace de permiso de navegador, mantiene enlaces legados vivos sin reactivar revocados y no cambia otros equipos. Dos equipos con exactamente el mismo cookie legacy antiguo representan el mismo permiso hasta su entrada propia: no se afirma distinguirlos retrospectivamente.
- Bandeja: observer sólo activity(role,at), sin mensajes/historia/claves/presencia/escritura; nunca suprime correo. Tokens de 15 minutos y límite de 5, authSessionId/userId y D1 vivos. Conservar lectura persistida de mensaje realmente visible; NO marcar leído al abrir/renovar token como hacía upstream.
- Compositor: 56e55be resuelve deuda que existía tanto en base como en upstream: snapshot/revisión y bloqueo síncrono y botón ocupado. El sobre tardío no borra edición/inserción de enlace; error/logout no resucitan contenido ni duplican el envío.
- Waitlist: general separada de Ayuda Terremoto, sin ocupar sus cupos. Anotarme y confirmación motivo explícitos; no modificar fila ajena por conocer correo. SQL/auditoría/retención más estrictos que upstream.
- Migraciones: conservar 0027–0036 de CRM, sumar 0037/0038. Rechazar snapshots upstream preCRM y journal que borra entradas. Prueba temporal aplica 0000–0036, fotografía filas y valida preservación/foreignkeys tras las adiciones.
- Paneles: preservar rutas y permisos actuales de CRM/admin/Calendar/Notas/Admisión. No introducir PanelShell y su navegación por scroll ni defaults que envían todos los usuarios al profesional.
- Contactar ahora: visible aun con teléfono; conserva campos opcionales que habilitan regreso por correo y medios externos autorizados. Se restituye data-track=chat_start/data-track-label; ClickTracker depende de esa marca explícita para CTA sin href. La simplificación exacta de 347 (retirar campos y relegar todos los medios a links discretos) NO se ha aplicado: requiere decisión de producto/owner sin perder recuperación.

## Omisiones accionables para el coordinador

Estas omisiones son de esta rama, no afirmaciones de que sigan presentes en su source actual. Revisar su merge antes de aplicar otras copias.

1. Privacidad: reconciliar campos waitlist (correo/título/relato/vínculo/hash), uso interno, retiro y anonimización tras 12 meses inactivos con política actual. No copiar promesas de voluntariado/cupo garantizado; datos/backups/clientes mantienen contratos distintos.
2. Descubrimiento: callout disponible pero sin callsites; panel montado sólo en /lista-de-espera. Faltan home/ayuda/directorio/alianzas/como-funciona/quienes-somos/FAQ, footer en AppFrame y sitemap. Adaptar al catálogo y onboarding vigentes con owner de SEO/producto.
3. Admin: ruta autorizada /admin/lista-de-espera existe, pero AdminShell necesita nav/badge vigente. No importar 200 relatos al dashboard general ni reemplazar shell.
4. Entrada: /pro/AuthPanel/pro-entry upstream no incluyen chooser paciente/Admisión ni guards frescos. Root debe resolver destino/callback sobre flujo actual; helpers y tests del viejo PanelShell no certifican ese flujo.
5. CSS: se recuperaron estilos locales de chat/drawer/waitlist, no globals entero. Tokens y jerarquía de CTA/contactos quedan en owner de diseño. QA móvil/teclado de source integrada sigue pendiente.
6. Pruebas: 25 Workers usan transporte D1 ficticio explícito; libSQL/D1 Miniflare SQL reales están aparte. Falta QA conjunta del source con BetterAuth real de fixture y mismo D1 para permisos+WS. No se presenta Chromium de widgets con acciones ficticias como aplicación Next integrada.
7. Historia: reconciliar CHANGELOG con entrega real; arquitectura técnica tiene actualización específica y remite al handoff actual. No publicar el historial temporal inseguro como comportamiento final.

8. Diferencia E2EE confirmada por lectura de fuente: en ChatRoom, la identidad local distinta de la pública activa restoreNeeded y no se asigna a identity; el compositor espera recuperación. Upstream3479233 asignaba la identidad local y dejaba un aviso opcional. El gate puro todavía permite el aviso, pero el componente añade el guard de publicación/CAS. Es una restricción efectiva más fuerte: no afirmar que se preservó el modo no bloqueante. Root debe mantenerla explícitamente o autorizar un flujo con esa clave sin cambiar silenciosamente la pública; no se debilitan permisos ni publicación para imitar upstream. Esta auditoría sólo identifica la diferencia; no certifica una reproducción browser de ese caso.

## Evidencia focal

Se detallan comandos/resultados exactos en el informe privado. Lotes previos: 223 pruebas/33 archivos del primer lote;27 pruebas en 7 archivos y 7 escenarios Chromium de recuperación;116 pruebas en 15 archivos y 22 Workers de 9e9c7fe. Lotes nuevos: compositor 15 escenarios Chromium y 21 pruebas en 5 archivos; separación de SID: 122 pruebas en 14 archivos y 25 Workers, con D1 Miniflare real. Esta auditoría valida 16 escenarios Chromium (incluye dos Enter en la misma tarea),11 pruebas en3 archivos de SSR/API/bandeja, TypeScript focal de 13 entradas sin diagnósticos, Biome y scanner limpios. No se suman ejecuciones repetidas como pruebas nuevas. No build completo/main/despliegue/BD remota/proveedores/usuarios reales.

## Commits upstream

```text
aee216b feat(lista-de-espera): alta pública y tarjeta en el chat para casos ajenos al terremoto
8b6643f fix(chat): acceso desde otro navegador, código de recuperación solo cuando toca y lista de espera de personas en admin
5290561 docs(chat): la clave del profesional se gestiona en la sección Cifrado del panel
c4f4170 fix(chat): botón 'Anotarme' explícito en la tarjeta de lista de espera
7bb1827 fix(chat): el profesional nunca queda bloqueado por el cifrado en una sala
6dfb779 feat(chat): lista de conversaciones en vivo y un solo código para el profesional
329ca16 feat(chat): avisos en vivo por WebSocket en la lista de conversaciones del profesional
7e0c7b3 fix(chat): el profesional no rota su clave al entrar desde otro dispositivo; feat: 'Contacta ahora' en la ficha profesional
3479233 feat(profesionales): 'Contactar ahora' es un botón grande, sin desplegable
```

## Inventario completo de las 73 rutas

Adaptado significa sustitución semántica con los contratos anteriores, no igualdad textual. Parcial y Root identifican explícitamente los gaps; Descartado registra sustituciones incompatibles. Los cambios sólo de ruta/numeración se distinguen de funciones perdidas.

| Ruta upstream | Decisión | Función o gap exacto |
|---|---|---|
| `.gitignore` | Fuera | Ignore .playwright-mcp opcional; el runner local elimina sus temporales. |
| `CHANGELOG.md` | Root | Reconciliar historia/versiones; no copiar claims de rotación automática de 0.14.1. |
| `docs/CHAT_ARCHITECTURE.md` | Adaptado | Actualizado al contrato actual; detalle en CHAT_WAITLIST_INTEGRATION, sin claims de marcar leído al abrir. |
| `drizzle/0027_waitlist_entries.sql` | Renumerado | Mismas adiciones waitlist en 0037/0038, sin sustituir CRM 0027/0028. |
| `drizzle/0028_waitlist_chat.sql` | Renumerado | Mismas adiciones waitlist en 0037/0038, sin sustituir CRM 0027/0028. |
| `drizzle/meta/0027_snapshot.json` | Descartado | Snapshots upstream preCRM incompatibles; preservar snapshots y SQL CRM 0000–0036. |
| `drizzle/meta/0028_snapshot.json` | Descartado | Snapshots upstream preCRM incompatibles; preservar snapshots y SQL CRM 0000–0036. |
| `drizzle/meta/_journal.json` | Adaptado | Añade 0037/0038 y tabla waitlist/vínculo; conservar todas las tablas CRM. |
| `src/app/acceso/[token]/route.ts` | Adaptado | Permiso registrado de misma sala; ahora intercambio atómico permiso de enlace→permiso de navegador en 664d40d. |
| `src/app/actions-waitlist.ts` | Adaptado | Alta y cambios de estado/auditoría atómicos; correo conocido no altera fila ajena. |
| `src/app/admin/page.tsx` | Sustituido | Ruta propia /admin/lista-de-espera paginada/autorizada; nav/badge AdminShell pendientes root, sin 200 relatos en resumen. |
| `src/app/alianzas/page.tsx` | Root | Omitido WaitlistCallout showAssociationsLink=false; adaptar descubrimiento al producto actual. |
| `src/app/api/pro/chats/route.ts` | Adaptado | Metadatos propios no-store; exige profesional aprobado y autenticación fresca. |
| `src/app/ayuda/page.tsx` | Root | Omitido WaitlistPanel source=ayuda antes del directorio; conservar programa gratuito y cupos separados. |
| `src/app/c/[conversationId]/actions.ts` | Adaptado | SID registrado/rol/permisos SQL; avisos de 15 minutos/liveauth; waitlist general con consentimiento y guard SQL. |
| `src/app/c/[conversationId]/chat-room.tsx` | Parcial | Gate E2EE/sin rotación automática, waitlist, America/Caracas y eventos bandeja; conservar sync/scroll/lectura visible y compositor 56e55be. Una clave local distinta de la publicada exige recuperar; upstream permitía continuar con aviso. |
| `src/app/c/[conversationId]/chat.module.css` | Adaptado | Combina estilos sala y tarjeta waitlist; conserva bloque de movimiento reducido cerrado. |
| `src/app/c/[conversationId]/conversation-access-panel.tsx` | Adaptado | Acceso privado sin revelar datos; solicitar enlace y recordar recuperación de claves por separado. |
| `src/app/c/[conversationId]/conversation-deleted-notice.tsx` | Adaptado | Recuperación tras papelera conserva permisos y sesión/identidad por cuenta. |
| `src/app/c/[conversationId]/e2ee-restore-panel.tsx` | Adaptado | Recuperación explícita; actor fresco/rol y descarte de importaciones tardías en 16b98a2/9e9c7fe. |
| `src/app/c/[conversationId]/page.tsx` | Adaptado | Lista lateral sólo del dueño, acceso privado y waitlist; preserva redirección de paciente/Calendar/paquetes; la key incluye cuenta/rol/sala. |
| `src/app/c/[conversationId]/waitlist-prompt-card.tsx` | Adaptado | Botón Anotarme explícito y confirmación motivo general; correo sólo HTTPS, no mensaje WS. |
| `src/app/como-funciona/page.tsx` | Root | Omitido WaitlistCallout contextual; decidir ubicación/copy con marketing actual. |
| `src/app/globals.css` | Parcial | Chat/inbox/drawer/waitlist aislados en CSS locales; no tokens globales/panel-shell ni jerarquía pro-contact-wa/main upstream. |
| `src/app/layout.tsx` | Root | Enlace footer omitido; footer actual en components/app-frame.tsx, no transplantar layout upstream. |
| `src/app/lista-de-espera/page.tsx` | Adaptado | Página/formulario general separado de terremoto; no promete cupo garantizado ni todos los servicios gratuitos. |
| `src/app/page.tsx` | Root | Omitido WaitlistCallout contextual; decidir ubicación/copy con marketing actual. |
| `src/app/preguntas-frecuentes/page.tsx` | Root | Omitidos callout/pregunta para personas no afectadas y FAQ JSON-LD concordante; adaptar sin prometer disponibilidad. |
| `src/app/privacidad/page.tsx` | Root | Omitidos campos/uso/hash/retiro/anonimización12 meses waitlist; necesario reconciliar copy antes de publicar. |
| `src/app/pro/dashboard/page.tsx` | Parcial | Tarjeta Cifrado siempre visible y por cuenta; no PanelShell upstream ni reemplazo de ajustes/calendario/CRM. |
| `src/app/pro/page.tsx` | Descartado | No redirecciones/defaults profesionales globales del upstream; root conserva chooser paciente/pro/admin/Admisión y callbacks actuales. |
| `src/app/profesionales/page.tsx` | Root | Omitido WaitlistPanel source=profesionales; adaptar a catálogo general actual sin bloquear contacto. |
| `src/app/profesionales/professional-card.tsx` | Parcial | CTA Contactar ahora visible y tracking restituido; se conservan alias/correo opcionales y medios externos. Jerarquía única347 pendiente decisión root. |
| `src/app/quienes-somos/page.tsx` | Root | Omitidos enlaces explicativos a lista general y asociaciones. |
| `src/app/sitemap.ts` | Root | Omitida entrada /lista-de-espera con priority0.6/changeFrequency monthly; owner de SEO. |
| `src/components/admin-incomplete-registrations.tsx` | Descartado | Sólo id=registros/aliados para anchors del PanelShell antiguo; AdminShell vigente usa rutas. |
| `src/components/admin-partners.tsx` | Descartado | Sólo id=registros/aliados para anchors del PanelShell antiguo; AdminShell vigente usa rutas. |
| `src/components/auth-panel.tsx` | Descartado | No redirecciones/defaults profesionales globales del upstream; root conserva chooser paciente/pro/admin/Admisión y callbacks actuales. |
| `src/components/e2ee-pro-setup.tsx` | Adaptado | Tarjeta por cuenta/código único; backups confirmados y memoria invalidada al logout/switch/expiry. |
| `src/components/panel-shell.tsx` | Descartado | No sustituir AdminShell/WorkspaceShell/PracticeNav por panel de scroll upstream. |
| `src/components/pro-chat-list.tsx` | Adaptado | Orden/metadatos/unread, sondeo y WSobserver 5 canales; renovación15 minutos, cierres visibility/logout y scopepropietario. |
| `src/components/side-drawer.tsx` | Adaptado | Cajón móvil de inbox, Escape/foco/trap/cleanup/desktop; CSSlocal, no menús del resto del producto. |
| `src/components/waitlist-callout.tsx` | Parcial | Componente disponible pero sin callsites públicos en esta rama: no afirmar descubrimiento implementado. |
| `src/components/waitlist-form.tsx` | Adaptado | Consentimiento y separación de ayuda gratuita y formulario general; sólo panel dedicado montado en esta rama. |
| `src/components/waitlist-panel.tsx` | Adaptado | Consentimiento y separación de ayuda gratuita y formulario general; sólo panel dedicado montado en esta rama. |
| `src/db/schema.ts` | Adaptado | Añade 0037/0038 y tabla waitlist/vínculo; conservar todas las tablas CRM. |
| `src/lib/chat-view.ts` | Adaptado | Permiso seeker registrado de sala y dueño profesional con sesión de autenticación viva, sin cookiepro independiente. |
| `src/lib/email-templates.ts` | Adaptado | Confirmación waitlist y aviso interno sin relato; no envíos reales en QA. |
| `src/lib/notifications.ts` | Adaptado | Confirmación waitlist y aviso interno sin relato; no envíos reales en QA. |
| `src/lib/panel-nav.ts` | Descartado | No sustituir AdminShell/WorkspaceShell/PracticeNav por panel de scroll upstream. |
| `src/lib/pro-chats.ts` | Adaptado | Orden/metadatos/unread, sondeo y WSobserver 5 canales; renovación15 minutos, cierres visibility/logout y scopepropietario. |
| `src/lib/pro-entry.ts` | Descartado | No redirecciones/defaults profesionales globales del upstream; root conserva chooser paciente/pro/admin/Admisión y callbacks actuales. |
| `src/lib/requester-hash.ts` | Adaptado | Dominio waitlist hash/límites/esquemas; confirmación general y sources conservados. |
| `src/lib/retention.ts` | Adaptado | Anonimización12 meses atómica/idempotente; conserva toda retención CRM y guard de caducidad dentro de UPDATE. |
| `src/lib/seeker-token.ts` | Adaptado | Inbox separado authSessionId/userId; finalidadenlace/navegador firmada y parser failclosed. |
| `src/lib/validation.ts` | Adaptado | Dominio waitlist hash/límites/esquemas; confirmación general y sources conservados. |
| `src/lib/waitlist-store.ts` | Adaptado | Alta y cambios de estado/auditoría atómicos; correo conocido no altera fila ajena. |
| `src/lib/waitlist.ts` | Adaptado | Dominio waitlist hash/límites/esquemas; confirmación general y sources conservados. |
| `src/server/auth-gate.ts` | Adaptado | Observer sin datos ni presencia; D1role/sala/propietario/sesión viva antes de historia/frame/destinatario/presencia, sin fallback. |
| `src/server/conversation.ts` | Adaptado | Observer sin datos ni presencia; D1role/sala/propietario/sesión viva antes de historia/frame/destinatario/presencia, sin fallback. |
| `src/shared/e2ee-gating.ts` | Adaptado | Estado final7e0c7b3: nunca rotar clave publicada sin consentimiento. No reaplicar estado inseguro intermedio7bb1827. |
| `src/shared/waitlist-prompt.ts` | Adaptado | Botón Anotarme explícito y confirmación motivo general; correo sólo HTTPS, no mensaje WS. |
| `src/tests/acceso-token-route.test.ts` | Adaptado | Pruebas propias SQLite temporal de SIDnuevo/permiso/rol/revoked/TTL/actor/sala y carreras SQL. |
| `src/tests/auth-gate.test.ts` | Adaptado | Fixtures liveauth/grants; root corrige fixture expiry en fuente integrada. No modificado en lotes nuevos por reserva root. |
| `src/tests/chat-access.test.ts` | Adaptado | Pruebas propias SQLite temporal de SIDnuevo/permiso/rol/revoked/TTL/actor/sala y carreras SQL. |
| `src/tests/e2ee-gating.test.ts` | Adaptado | Gate final compatible con recuperación, no auto-rotación y vistas porrol. |
| `src/tests/panel-navigation.test.ts` | Descartado | Prueba PanelShell viejo; QA pertinente actual en practice-navigation/admin-navigation, integración root. |
| `src/tests/waitlist-actions.test.ts` | Adaptado | Fixtures ficticias, SQL temporal/races/sin takeover/permisos/consentimiento/migraciones renumeradas. |
| `src/tests/waitlist-chat-actions.test.ts` | Adaptado | Fixtures ficticias, SQL temporal/races/sin takeover/permisos/consentimiento/migraciones renumeradas. |
| `src/tests/waitlist-migration.test.ts` | Adaptado | Fixtures ficticias, SQL temporal/races/sin takeover/permisos/consentimiento/migraciones renumeradas. |
| `src/tests/waitlist-prompt.test.ts` | Adaptado | Fixtures ficticias, SQL temporal/races/sin takeover/permisos/consentimiento/migraciones renumeradas. |
| `test/chat.workers.test.ts` | Adaptado | WS/DO/mensajesSQL reales, transporte D1 ficticio explícito;25checks; D1driver real independiente en chat-d1-atomic. |
| `vitest.workers.config.mts` | Parcial | No importar d1Databases:[DB] sin crear esquema/filas; integración conjunta D1/WS sigue pendiente root. D1SQL real se prueba aparte. |
