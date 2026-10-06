import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Refleja la tabla ya existente. Este corte no crea ni importa registros.
export const waitlistEntries = sqliteTable(
  "waitlist_entries",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    source: text("source").notNull(),
    status: text("status").default("waiting").notNull(),
    requesterHash: text("requester_hash"),
    anonymizedAt: text("anonymized_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    conversationId: text("conversation_id"),
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
