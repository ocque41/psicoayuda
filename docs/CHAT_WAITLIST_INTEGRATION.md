# Integración de chat y lista de espera

Integración selectiva de aca220d..3479233 sobre f1c69cd. Se mantienen el CRM, la administración por secciones, Calendar y las notas. No es un merge global: las sustituciones de páginas, navegación y estilos ajenas a chat se dejan al coordinador.

La sala conserva sesión seeker registrada con rol, propiedad del profesional aprobado, autorización D1 por frame, cola de frames, sincronización paginada, lectura confirmada y posición de lectura. El visitante de otro dispositivo recibe acceso privado y enlace de regreso; ese enlace recupera el permiso, y el código recupera las claves E2EE. Son pasos separados.

La bandeja `/api/pro/chats` requiere profesional aprobado y no permite caché. Los canales `avisos=1` tienen token de quince minutos, propiedad y estado comprobados al conectar y antes de cada aviso; sólo emiten `{type: "activity", role, at}`. No reciben historia, contenido, claves o presencia, no escriben y no silencian las notificaciones. El cliente renueva el token, cierra canales en segundo plano y limita conexiones. El sondeo reconcilia altas/estados y borra la bandeja al perder sesión.

## Cifrado y compatibilidad

El servidor sólo permite inicializar/reafirmar la misma clave profesional. Una sustitución requiere la clave esperada y confirmación explícita en la UI; otro dispositivo no puede sobrescribirla al iniciar. El slot profesional se aísla por ID de cuenta. Una clave del slot legado `pro` se adopta únicamente si coincide con la publicada; no se borra ni se rota al adoptar.

Los nuevos respaldos separan código y entradas por cuenta profesional o conversación seeker. Las claves seeker utilizadas en una vista autorizada del profesional se vinculan a su respaldo cuando ese dispositivo tiene también su identidad profesional. El profesional necesita su clave para crear el respaldo de cuenta. El formato admite `scope`/`ownerSlot` opcionales y conserva lectura de archivos antiguos. Un código antiguo sigue abriendo su copia antigua: no se reutiliza automáticamente para sobrescribirla con un subconjunto de claves. Las claves privadas no cambian al crear un código nuevo. Sólo se muestra un código tras un guardado positivo del servidor; el rechazo/excepción ofrece reintento y conserva el código local del intento para subirlo de nuevo.

Cerrar sesión limpia las capacidades HMAC de chat de este navegador y bloquea salas/bandejas de las pestañas abiertas mediante una señal sin contenido. Se conservan claves y borradores cifrados para volver a entrar. Una sesión de otra cuenta no puede heredar el fallback de la cookie profesional anterior. Los cambios compartidos se limitan a los handlers de salida de AccountActions/SiteNav.

El borrador se cifra para la propia identidad con AES-GCM y contexto de cuenta/rol/conversación. Caduca en 24 horas y no contiene texto plano en localStorage. Los cifrados tardíos no reemplazan un texto más reciente ni resucitan un borrador enviado. Se retiran las entradas antiguas en texto plano de la conversación: el formato legado no permite atribuirlas a una cuenta o rol de forma segura. Las claves y mensajes anteriores permanecen intactos.

## Lista general

`/lista-de-espera` y la tarjeta del chat gestionan motivos ajenos al terremoto. La tarjeta exige confirmación explícita y permiso seeker vigente dentro de la escritura. No cambian solicitudes, asignaciones ni cupos de Ayuda Terremoto. El formulario público no modifica una fila previa sólo por conocer su correo. El límite de nuevas anotaciones se evalúa en la misma sentencia que la inserción. Los avisos no incluyen narrativas. `/admin/lista-de-espera` es una vista independiente, autorizada, filtrada y paginada; no sustituye admin-shell. El coordinador puede añadir su enlace en la navegación compartida.

Cambios de estado y auditoría son un batch atómico con condición del estado previo. La anonimización conserva el guard de caducidad dentro de la escritura y se audita una sola vez. El botón Contactar ahora permanece visible aunque existan otros medios de contacto; se preservan sus enlaces y el control de cupos del servidor.

## Migraciones aditivas

Upstream 0027/0028 colisionaba con CRM: se usa `0037_waitlist_entries.sql` y `0038_waitlist_chat.sql`. 0037 crea exclusivamente la tabla/índices waitlist; 0038 añade `conversation_id` y su índice. El journal incorpora entradas nuevas; no se reemplazan SQL ni snapshots CRM. No se modifica 0040, reservada para admisión. El test reproduce todas las migraciones 0000–0036, añade filas ficticias, aplica 0037/0038 y compara cada tabla previa y sus filas; también comprueba foreign_key_check y la nueva columna.

Sólo el coordinador puede aplicarlas a infraestructura real, tras guardar backup y comprobar el historial de migraciones y la numeración integrada. Una reversión del código conserva tabla, columna, índices y anotaciones; no ejecutar DROP, DELETE, rollback destructivo ni borrar claves. Para cambios posteriores de esquema, usar otra migración aditiva.

## Verificación focal

Ejecutar `pnpm --config.verifyDepsBeforeRun=false test:isolated` con los archivos de pruebas de chat, E2EE, waitlist y retención indicados en el informe. Usa DB temporal sin proveedores reales. `pnpm --config.verifyDepsBeforeRun=false test:workers` prueba transporte WebSocket/DO real dentro de workerd con D1 simulado explícito; las consultas/autorización reales se prueban además sobre SQLite temporal en auth-gate-d1. `node --max-old-space-size=768 scripts/check-chat-integration-types.mjs` comprueba once entradas y sus dependencias sin emitir archivos; `typecheck:worker` comprueba el Worker.

La prueba SSR comprueba que las vistas montan y muestran controles/estados. No sustituye QA visual móvil/teclado de la aplicación integrada. No se ha realizado build completo, despliegue, migración remota ni prueba con usuarios o proveedores reales en este worktree.
