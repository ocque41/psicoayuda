import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp_ms",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp_ms",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const professionals = sqliteTable(
  "professionals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull(),
    displayName: text("display_name"),
    country: text("country"),
    city: text("city"),
    licenseNumber: text("license_number"),
    licenseCountry: text("license_country"),
    // Universidad donde obtuvo el título (dato de verificación, no público).
    university: text("university"),
    // Verificación profesional flexible — basta UNA vía (o marcar auxiliar no
    // clínico, ver `nonClinicalHelper`): (1) número FPV, verificable en
    // sistema.fpv.org.ve; (2) declaración de supervisión (de quién/institución);
    // (3) comprobante de registro (tipo + detalle + documento subido). No públicas.
    fpvNumber: text("fpv_number"),
    supervisionInfo: text("supervision_info"),
    // 'ministerio_educacion' | 'colegio_psicologos' | 'inprepsi'
    registrationType: text("registration_type"),
    registrationDetail: text("registration_detail"),
    // Documento del comprobante (data URL, imagen o PDF). PESA: NUNCA entra en los
    // selects de listado — feed/matching/offers proyectan columnas explícitas y el
    // admin lo excluye a propósito (db.query ... columns: { registrationProofDoc: false }).
    registrationProofDoc: text("registration_proof_doc"),
    // Teléfono/WhatsApp opcional. Público por diseño: si el profesional lo da, se
    // muestra en su ficha como botón de WhatsApp/llamada (libro amarillo).
    phone: text("phone"),
    // Teléfono fijo opcional (solo llamada). Público: se muestra en la ficha como
    // enlace tel:. Va aparte de `phone` porque un fijo no tiene WhatsApp.
    landline: text("landline"),
    // ¿Mostrar el correo (email) como contacto público en la ficha? El alta exige
    // al menos una vía (correo/fijo/WhatsApp); esto controla el correo.
    emailPublic: integer("email_public", { mode: "boolean" })
      .default(true)
      .notNull(),
    // Foto opcional (avatar). Data URL pequeña, redimensionada en el cliente para
    // no pesar (ver professional-onboarding-form). Pública: se muestra en su ficha.
    photo: text("photo"),
    languages: text("languages").notNull(),
    supportAreas: text("support_areas").notNull(),
    remoteAvailable: integer("remote_available", { mode: "boolean" })
      .default(true)
      .notNull(),
    // Atención presencial (además de o en vez de remota). Para voluntarios en
    // Venezuela que pueden ver a la persona en su ciudad. Pública en la ficha.
    inPersonAvailable: integer("in_person_available", { mode: "boolean" })
      .default(false)
      .notNull(),
    crisisExperience: integer("crisis_experience", { mode: "boolean" })
      .default(false)
      .notNull(),
    // Auxiliar no clínico: estudiante/voluntario sin credencial para ejercer.
    // Exime de la verificación de credencial y se muestra como etiqueta PÚBLICA
    // en su ficha, para que quien busca ayuda sepa que no es un profesional con licencia.
    nonClinicalHelper: integer("non_clinical_helper", { mode: "boolean" })
      .default(false)
      .notNull(),
    // ¿Ofrece también servicios PAGOS por temas ajenos a la emergencia? La ayuda
    // por el terremoto sigue siendo gratis; este dato es la etiqueta pública que
    // lo distingue en el directorio y habilita la sección de cobros/paquetes del
    // panel (ver src/lib/payments). Autodeclarado por el profesional.
    offersPaidServices: integer("offers_paid_services", { mode: "boolean" })
      .default(false)
      .notNull(),
    contactEmail: text("contact_email"),
    contactNotes: text("contact_notes"),
    shortBio: text("short_bio"),
    // Verificación oficial contra la Federación de Psicólogos de Venezuela
    // (api.sistema.fpv.org.ve). Se rellena en el alta SOLO si el profesional
    // aporta cédula + Nº FPV: consultamos la API pública por cédula, cruzamos
    // Nº FPV + nombre y guardamos el resultado. La cédula NO se guarda (se usa
    // solo para consultar). `fpvSnapshot` es el registro oficial + el detalle
    // del cruce (JSON), para auditoría y para mostrarlo en /admin; nunca sale en
    // las proyecciones públicas (feed/matching/offers usan columnas explícitas).
    fpvVerified: integer("fpv_verified", { mode: "boolean" })
      .default(false)
      .notNull(),
    fpvVerifiedAt: integer("fpv_verified_at", { mode: "timestamp_ms" }),
    fpvSnapshot: text("fpv_snapshot"),
    // Confirmación MANUAL de credencial para profesionales sin verificación
    // automática (fuera de Venezuela: España, México, etc., donde no hay FPV).
    // El admin la marca tras cotejar su nº de colegiado / cédula profesional con
    // el registro oficial del país. Por defecto false = "pendiente de
    // confirmación". Solo se usa en /admin (no sale en la ficha pública).
    credentialConfirmed: integer("credential_confirmed", { mode: "boolean" })
      .default(false)
      .notNull(),
    status: text("status").default("pending_verification").notNull(),
    acceptingRequests: integer("accepting_requests", { mode: "boolean" })
      .default(false)
      .notNull(),
    maxActiveRequests: integer("max_active_requests").default(3).notNull(),
    currentActiveRequests: integer("current_active_requests")
      .default(0)
      .notNull(),
    // Caché del algoritmo de tiempo de respuesta (la rellena el recompute).
    responseBucket: text("response_bucket"),
    responseMedianMs: integer("response_median_ms"),
    responseSampleSize: integer("response_sample_size").default(0).notNull(),
    responseAnsweredRatio: real("response_answered_ratio"),
    responseComputedAt: integer("response_computed_at", {
      mode: "timestamp_ms",
    }),
    conductAcceptedAt: text("conduct_accepted_at"),
    // ---- Cobros con Stripe (Connect Express). Nada de esto es público: solo se
    // usa para habilitar la sección "Cobros" y crear Checkout Sessions. ----
    stripeAccountId: text("stripe_account_id"),
    stripeChargesEnabled: integer("stripe_charges_enabled", { mode: "boolean" })
      .default(false)
      .notNull(),
    stripePayoutsEnabled: integer("stripe_payouts_enabled", { mode: "boolean" })
      .default(false)
      .notNull(),
    stripeDetailsSubmitted: integer("stripe_details_submitted", {
      mode: "boolean",
    })
      .default(false)
      .notNull(),
    // ---- Cifrado de extremo a extremo (E2EE) del chat. Clave pública ECDH
    // P-256 (base64url, raw) que el profesional publica desde su navegador al
    // configurar el cifrado. El servidor NUNCA ve su privada ni puede derivar
    // las claves de conversación: solo guarda sobres opacos. Null = todavía no
    // configuró el cifrado (sus salas se bloquean hasta que lo haga, para no
    // almacenar texto legible). ----
    cryptoPublicKey: text("crypto_public_key"),
    cryptoPublicKeyUpdatedAt: integer("crypto_public_key_updated_at", {
      mode: "timestamp_ms",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("professionals_status_idx").on(table.status),
    index("professionals_accepting_requests_idx").on(table.acceptingRequests),
    index("professionals_remote_available_idx").on(table.remoteAvailable),
  ],
);

export const helpRequests = sqliteTable(
  "help_requests",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    // Alias opcional elegido por la persona ("¿Cómo quieres que te llamemos?").
    // No es identidad legal: la persona decide qué compartir. Se muestra al
    // profesional en el aviso de mensaje y se borra al anonimizar.
    seekerName: text("seeker_name"),
    language: text("language").default("es").notNull(),
    country: text("country").default("Venezuela"),
    state: text("state"),
    city: text("city"),
    lat: real("lat"),
    lng: real("lng"),
    locationConsent: integer("location_consent", { mode: "boolean" })
      .default(false)
      .notNull(),
    needCategory: text("need_category").notNull(),
    urgency: text("urgency").notNull(),
    status: text("status").default("new").notNull(),
    consentContact: integer("consent_contact", { mode: "boolean" })
      .default(false)
      .notNull(),
    requesterHash: text("requester_hash"),
    anonymizedAt: text("anonymized_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("help_requests_status_idx").on(table.status),
    index("help_requests_created_at_idx").on(table.createdAt),
    index("help_requests_email_created_idx").on(table.email, table.createdAt),
    index("help_requests_requester_hash_created_idx").on(
      table.requesterHash,
      table.createdAt,
    ),
  ],
);

export const assignments = sqliteTable(
  "assignments",
  {
    id: text("id").primaryKey(),
    helpRequestId: text("help_request_id")
      .notNull()
      .references(() => helpRequests.id, { onDelete: "cascade" }),
    professionalId: text("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    status: text("status").default("suggested").notNull(),
    source: text("source").default("auto").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("assignments_help_request_idx").on(table.helpRequestId),
    index("assignments_professional_idx").on(table.professionalId),
    uniqueIndex("assignments_request_professional_unique").on(
      table.helpRequestId,
      table.professionalId,
    ),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: text("metadata"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    // Rate limits respaldados en audit_logs (credenciales y checkout público):
    // la consulta filtra por actor + acción en una ventana de tiempo.
    index("audit_logs_actor_action_created_idx").on(
      table.actorEmail,
      table.action,
      table.createdAt,
    ),
  ],
);

// ---- Chat en tiempo real (Durable Objects). El contenido de los mensajes vive
// en el SQLite del DO; aquí va solo el espejo en D1 para feed, autorización y
// métricas de tiempo de respuesta. ----

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    helpRequestId: text("help_request_id").references(() => helpRequests.id, {
      onDelete: "set null",
    }),
    professionalId: text("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    seekerSid: text("seeker_sid").notNull(),
    // Copia del alias opcional del seeker, para mostrarlo en el aviso "te están
    // escribiendo" sin tener que cruzar a help_requests (que puede ser null en el
    // flujo de chat directo). Se borra al anonimizar.
    seekerName: text("seeker_name"),
    // Correo OPCIONAL del seeker en chats directos (sin solicitud /ayuda), para
    // habilitar la re-entrada por enlace mágico. En el flujo de solicitud se usa
    // help_requests.email. Se borra al anonimizar.
    seekerEmail: text("seeker_email"),
    status: text("status").default("open").notNull(),
    firstSeekerMsgAt: integer("first_seeker_msg_at", { mode: "timestamp_ms" }),
    firstProReplyAt: integer("first_pro_reply_at", { mode: "timestamp_ms" }),
    // Espejo NO sensible de la actividad del DO (solo timestamp + rol del último
    // mensaje, NUNCA contenido): ordena la bandeja del profesional y marca no
    // leídos. Lo escribe el endpoint interno del DO.
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    lastMessageRole: text("last_message_role"),
    // Cuándo abrió/leyó el chat el profesional (badge de "nuevo" en su panel).
    proLastReadAt: integer("pro_last_read_at", { mode: "timestamp_ms" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    closedAt: text("closed_at"),
    // 'inactivity' | 'case_closed' | 'admin' | 'professional' | 'seeker'
    closedReason: text("closed_reason"),
    // Reapertura dentro de la ventana de retención: mismo hilo, sin crear otro.
    reopenedAt: integer("reopened_at", { mode: "timestamp_ms" }),
    // Cupo liberado por inactividad: la conversación es ETERNA (nunca se cierra
    // sola), pero un hilo sin actividad >30 días deja de ocupar uno de los cupos
    // del profesional para que pueda acompañar a más personas. Al liberarlo se
    // descuenta `current_active_requests` una sola vez (idempotente por la fecha).
    quotaReleasedAt: integer("quota_released_at", { mode: "timestamp_ms" }),
    anonymizedAt: text("anonymized_at"),
    // Papelera con deshacer: borrar ya no purga al instante. `deletedAt` marca
    // el hilo como borrado (para las dos partes) y `purgeAfter` da 7 días para
    // restaurarlo; al vencer, el cron de retención purga el DO y borra las
    // filas D1. Mientras está en papelera, el WebSocket se rechaza.
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    purgeAfter: integer("purge_after", { mode: "timestamp_ms" }),
    deletedByRole: text("deleted_by_role"),
  },
  (table) => [
    index("conversations_professional_idx").on(table.professionalId),
    index("conversations_help_request_idx").on(table.helpRequestId),
    index("conversations_status_created_idx").on(table.status, table.createdAt),
    index("conversations_professional_activity_idx").on(
      table.professionalId,
      table.lastMessageAt,
    ),
    index("conversations_status_activity_idx").on(
      table.status,
      table.lastMessageAt,
    ),
    index("conversations_seeker_email_idx").on(table.seekerEmail),
    index("conversations_purge_after_idx").on(table.purgeAfter),
  ],
);

// Keystores de recuperación del E2EE. `wrapped` es el keystore JSON cifrado con
// AES-256-GCM bajo una clave derivada del código de recuperación del usuario
// (`src/shared/e2ee.ts`); `id` se deriva del propio código. El servidor guarda
// el blob pero NO puede descifrarlo ni relacionarlo con nadie sin el código.
export const recoveryKeystores = sqliteTable("recovery_keystores", {
  id: text("id").primaryKey(),
  wrapped: text("wrapped").notNull(),
  kind: text("kind").default("unknown").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const seekerSessions = sqliteTable(
  "seeker_sessions",
  {
    sid: text("sid").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    requesterHash: text("requester_hash"),
    role: text("role").default("seeker").notNull(),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("seeker_sessions_conversation_idx").on(table.conversationId),
    index("seeker_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const responseSamples = sqliteTable(
  "response_samples",
  {
    id: text("id").primaryKey(),
    professionalId: text("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    responseDeltaMs: integer("response_delta_ms"),
    answered: integer("answered", { mode: "boolean" }).default(false).notNull(),
    sampledAt: integer("sampled_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("response_samples_conversation_unique").on(
      table.conversationId,
    ),
    index("response_samples_professional_sampled_idx").on(
      table.professionalId,
      table.sampledAt,
    ),
  ],
);

// Solicitudes del enlace mágico de re-entrada (/acceso) para que una persona sin
// cuenta vuelva a sus conversaciones desde cualquier dispositivo. Tabla
// desechable (el cron purga >7 días) que solo guarda hashes: nunca el correo en
// claro, nunca la IP. Se usa para limitar abuso (3/h por correo + IP).
export const accessRequests = sqliteTable(
  "access_requests",
  {
    id: text("id").primaryKey(),
    emailHash: text("email_hash").notNull(),
    requesterHash: text("requester_hash"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("access_requests_email_created_idx").on(
      table.emailHash,
      table.createdAt,
    ),
    index("access_requests_created_idx").on(table.createdAt),
  ],
);

// Solicitudes de fundaciones/organizaciones que quieren aliarse con Nido
// (formulario público /alianzas). A diferencia del contacto por correo, aquí SÍ
// persistimos: el equipo de coordinación las revisa y aprueba desde /admin, y al
// aprobar se avisa por correo a la organización. Son datos que la propia
// organización facilita a propósito (no PII sensible de quien pide ayuda).
export const allianceRequests = sqliteTable(
  "alliance_requests",
  {
    id: text("id").primaryKey(),
    organizationName: text("organization_name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    website: text("website"),
    phone: text("phone"),
    // Vía de contacto más rápida elegida en el formulario: 'whatsapp' | 'phone' |
    // 'email'. El equipo la usa para ir directo (wa.me / tel: / mailto).
    preferredContact: text("preferred_contact"),
    message: text("message"),
    // 'pending' | 'approved' | 'rejected'
    status: text("status").default("pending").notNull(),
    // Correo del admin que la revisó y momento de la revisión (auditoría ligera).
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("alliance_requests_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

// Consultas, ideas y avisos enviados desde /contacto o desde el panel
// profesional. La fila es la fuente de verdad: el correo a los admins es solo
// un aviso best-effort, así que un fallo del proveedor no pierde el mensaje.
export const contactMessages = sqliteTable(
  "contact_messages",
  {
    id: text("id").primaryKey(),
    // 'public_contact' | 'professional_dashboard'
    source: text("source").notNull(),
    // 'question' | 'improvement' | 'problem' | 'other'
    category: text("category").notNull(),
    name: text("name"),
    email: text("email").notNull(),
    professionalId: text("professional_id").references(() => professionals.id, {
      onDelete: "set null",
    }),
    message: text("message").notNull(),
    // 'new' | 'in_review' | 'resolved'
    status: text("status").default("new").notNull(),
    // Hash irreversible de la conexión para limitar abuso; nunca guardamos IP.
    requesterHash: text("requester_hash"),
    handledBy: text("handled_by"),
    handledAt: text("handled_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("contact_messages_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("contact_messages_source_created_idx").on(
      table.source,
      table.createdAt,
    ),
    index("contact_messages_email_created_idx").on(
      table.email,
      table.createdAt,
    ),
    index("contact_messages_professional_created_idx").on(
      table.professionalId,
      table.createdAt,
    ),
    index("contact_messages_requester_created_idx").on(
      table.requesterHash,
      table.createdAt,
    ),
    index("contact_messages_created_idx").on(table.createdAt),
  ],
);

// Lista de espera para personas que necesitan apoyo psicológico por motivos
// AJENOS al terremoto. La ayuda gratuita de la emergencia está reservada para
// las víctimas, así que aquí guardamos lo mínimo para avisarles cuando se libere
// un cupo voluntario: correo, un título breve y una descripción de lo que
// necesitan. UNA fila por correo: si la persona vuelve a enviar el formulario,
// se actualiza su anotación en vez de duplicarla. El contenido es sensible:
// solo lo ve el equipo de coordinación y se anonimiza por retención.
export const waitlistEntries = sqliteTable(
  "waitlist_entries",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    // Título breve ("Ansiedad por el trabajo") y descripción de lo que necesita.
    title: text("title").notNull(),
    description: text("description").notNull(),
    // Página/componente desde el que se anotó (ej. 'profesionales', 'chat').
    // Sirve para medir qué punto de la web convierte; nunca es PII.
    source: text("source").notNull(),
    // Conversación de origen cuando la anotación nace de la tarjeta del chat
    // (source = 'chat'). Permite mostrar al profesional si la persona ya se
    // anotó y da contexto al equipo. Se limpia al anonimizar por retención.
    conversationId: text("conversation_id"),
    // 'waiting' | 'contacted' | 'matched' | 'closed'
    status: text("status").default("waiting").notNull(),
    // Hash irreversible de la conexión para limitar abuso; nunca guardamos IP.
    requesterHash: text("requester_hash"),
    anonymizedAt: text("anonymized_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("waitlist_entries_email_unique").on(table.email),
    index("waitlist_entries_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("waitlist_entries_requester_created_idx").on(
      table.requesterHash,
      table.createdAt,
    ),
    index("waitlist_entries_conversation_idx").on(table.conversationId),
  ],
);

// Organizaciones ALIADAS que se muestran en la web (carrusel de la portada y
// escaparate de /alianzas). Antes eran una constante en código; ahora viven en
// D1 para que el equipo las gestione desde /admin (crear, editar, logo, ocultar)
// sin tocar el repo. `contacts` es JSON con las vías de contacto: una misma
// organización puede tener varias (p.ej. varias psicólogas, cada una con su
// WhatsApp). La primera de la lista es la principal (a la que enlaza el carrusel).
export const partners = sqliteTable(
  "partners",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Especialidad / enfoque breve (ej. "Primeros Auxilios Psicológicos").
    specialty: text("specialty"),
    // Descripción más larga para la ficha de /alianzas.
    description: text("description"),
    // Logo: URL http(s), data URL (base64) o ruta local en /public. Vacío => en
    // el carrusel se muestra el nombre "en limpio".
    logo: text("logo"),
    // Vías de contacto en JSON: [{ label?, type, value }] con
    // type ∈ whatsapp | phone | instagram | website | email.
    contacts: text("contacts").default("[]").notNull(),
    // 'published' | 'hidden'. 'hidden' no aparece en la web pero sí en /admin.
    status: text("status").default("published").notNull(),
    // Orden ascendente en el carrusel/escaparate.
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("partners_status_order_idx").on(table.status, table.sortOrder),
  ],
);

// Analítica propia de clics (sin PII). Registra QUÉ pulsa la gente (los CTAs y
// los enlaces salientes a WhatsApp/webs) y de qué campaña UTM llegó su sesión,
// para medir qué canal trae gente y qué funciona. Complementa a Cloudflare Web
// Analytics: aquél cuenta VISITAS, esto cuenta ACCIONES. No guarda IP ni nada
// identificable; `country` viene del edge de Cloudflare (cf-ipcountry) y solo
// sirve a nivel agregado. Es una tabla desechable: se puede purgar sin afectar
// a ningún otro flujo.
export const clickEvents = sqliteTable(
  "click_events",
  {
    id: text("id").primaryKey(),
    // 'outbound' (wa.me/tel/mailto/web externa) | 'cta' (botón interno) | valor
    // libre si el elemento trae `data-track`.
    type: text("type").notNull(),
    // Texto del botón/enlace (truncado) para saber QUÉ se pulsó.
    label: text("label"),
    // Destino del enlace: para salientes el wa.me/tel/web; para CTAs, la ruta.
    href: text("href"),
    // Ruta interna donde ocurrió el clic (window.location.pathname).
    page: text("page"),
    // Atribución de ENTRADA (first-touch de la sesión): de qué campaña vino
    // quien hizo el clic. Se rellena desde los UTM de la URL de aterrizaje.
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    // País del edge de Cloudflare (cf-ipcountry), agregado y no identificable.
    country: text("country"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("click_events_created_idx").on(table.createdAt),
    index("click_events_type_created_idx").on(table.type, table.createdAt),
    index("click_events_campaign_idx").on(table.utmCampaign),
  ],
);

// ---- Pagos de Nido (Stripe). Módulo aislado: todo lo específico de cobros vive
// aquí y en src/lib/payments/*. La plataforma cobra por el profesional y retiene
// una comisión fija por transacción; el resto se transfiere a su cuenta Connect.
// El contenido de tarjetas NUNCA toca Nido: se usa el Checkout hospedado de
// Stripe (PCI SAQ A). ----

// Paquetes de sesiones que cada profesional configura en su perfil ("4 sesiones
// válidas por 1 mes", etc.). Público solo a través del link de pago /pagar/<id>.
export const sessionPackages = sqliteTable(
  "session_packages",
  {
    id: text("id").primaryKey(),
    professionalId: text("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    // Número de sesiones incluidas y vigencia en días (null = sin caducidad).
    sessionsCount: integer("sessions_count").notNull(),
    validityDays: integer("validity_days"),
    // Precio en la unidad mínima de la moneda (céntimos). EUR por ahora.
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").default("eur").notNull(),
    active: integer("active", { mode: "boolean" }).default(true).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("session_packages_professional_idx").on(
      table.professionalId,
      table.active,
    ),
  ],
);

// Registro contable de cada pago. Conserva SNAPSHOTS (nombre del profesional,
// título del paquete) porque la contabilidad no debe perderse si luego se borra
// la cuenta o el paquete. Los importes van en céntimos.
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    // Nullable + snapshot: si se borra la cuenta, el pago sigue existiendo.
    professionalId: text("professional_id").references(() => professionals.id, {
      onDelete: "set null",
    }),
    professionalName: text("professional_name"),
    packageId: text("package_id").references(() => sessionPackages.id, {
      onDelete: "set null",
    }),
    packageTitle: text("package_title"),
    // Conversación de origen cuando el link se comparte dentro de un chat.
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    payerEmail: text("payer_email"),
    payerName: text("payer_name"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    amountCents: integer("amount_cents").notNull(),
    applicationFeeCents: integer("application_fee_cents").notNull(),
    currency: text("currency").default("eur").notNull(),
    // 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'disputed'
    status: text("status").default("pending").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    paidAt: text("paid_at"),
    refundedAt: text("refunded_at"),
  },
  (table) => [
    index("payments_professional_created_idx").on(
      table.professionalId,
      table.createdAt,
    ),
    index("payments_status_created_idx").on(table.status, table.createdAt),
    // Busca el pago por PaymentIntent (reembolsos/disputas del webhook).
    index("payments_payment_intent_idx").on(table.stripePaymentIntentId),
  ],
);

// Idempotencia de webhooks de Stripe: un evento se procesa EXACTAMENTE una vez.
// Stripe reintenta entregas; sin esto un pago podría avisarse dos veces.
export const stripeEvents = sqliteTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: text("processed_at").notNull(),
});
