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
    languages: text("languages").notNull(),
    supportAreas: text("support_areas").notNull(),
    remoteAvailable: integer("remote_available", { mode: "boolean" })
      .default(true)
      .notNull(),
    crisisExperience: integer("crisis_experience", { mode: "boolean" })
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
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("help_requests_status_idx").on(table.status),
    index("help_requests_created_at_idx").on(table.createdAt),
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
