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
    crisisExperience: integer("crisis_experience", { mode: "boolean" })
      .default(false)
      .notNull(),
    // Auxiliar no clínico: estudiante/voluntario sin credencial para ejercer.
    // Exime de la verificación de credencial y se muestra como etiqueta PÚBLICA
    // en su ficha, para que quien busca ayuda sepa que no es un profesional con licencia.
    nonClinicalHelper: integer("non_clinical_helper", { mode: "boolean" })
      .default(false)
      .notNull(),
    contactEmail: text("contact_email"),
    contactNotes: text("contact_notes"),
    shortBio: text("short_bio"),
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
    status: text("status").default("open").notNull(),
    firstSeekerMsgAt: integer("first_seeker_msg_at", { mode: "timestamp_ms" }),
    firstProReplyAt: integer("first_pro_reply_at", { mode: "timestamp_ms" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    closedAt: text("closed_at"),
    anonymizedAt: text("anonymized_at"),
  },
  (table) => [
    index("conversations_professional_idx").on(table.professionalId),
    index("conversations_help_request_idx").on(table.helpRequestId),
    index("conversations_status_created_idx").on(table.status, table.createdAt),
  ],
);

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
