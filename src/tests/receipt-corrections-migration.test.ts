import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

describe("0033 aditiva sobre recibos históricos", () => {
  it("conserva datos originales, crea restricciones y permite SET NULL de autor histórico", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      await client.executeMultiple(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE user (id TEXT PRIMARY KEY);
        CREATE TABLE professionals (id TEXT PRIMARY KEY, user_id TEXT REFERENCES user(id) ON DELETE CASCADE, status TEXT, non_clinical_helper INTEGER);
        CREATE TABLE practice_patients (id TEXT PRIMARY KEY, professional_id TEXT REFERENCES professionals(id) ON DELETE CASCADE, program TEXT);
        CREATE TABLE practice_receipts (id TEXT PRIMARY KEY, professional_id TEXT REFERENCES professionals(id) ON DELETE CASCADE, patient_id TEXT REFERENCES practice_patients(id) ON DELETE CASCADE, amount_cents INTEGER, currency TEXT, method TEXT, reference TEXT UNIQUE, received_at TEXT);
        CREATE TABLE audit_logs (id TEXT PRIMARY KEY, action TEXT, metadata TEXT);
        INSERT INTO user VALUES ('fixture-author'), ('fixture-new-owner');
        INSERT INTO professionals VALUES ('fixture-pro', 'fixture-author', 'approved', 0);
        INSERT INTO practice_patients VALUES ('fixture-patient', 'fixture-pro', 'general');
        INSERT INTO practice_receipts VALUES ('fixture-receipt', 'fixture-pro', 'fixture-patient', 2000, 'usd', 'cash', 'fixture-pro:original', '2026-01-15T14:00:00.000Z');
        INSERT INTO audit_logs VALUES ('fixture-audit', 'external_receipt_confirmed', 'fixture-unchanged');
      `);
      const before = {
        receipts: (await client.execute("SELECT * FROM practice_receipts"))
          .rows,
        audits: (await client.execute("SELECT * FROM audit_logs")).rows,
      };
      const migration = await readFile(
        new URL("../../drizzle/0033_receipt_corrections.sql", import.meta.url),
        "utf8",
      );
      expect(migration).not.toMatch(
        /\b(?:DROP|DELETE|UPDATE|ALTER)\s+(?:TABLE|FROM|practice_receipts)/i,
      );
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await client.execute(statement);
      expect(
        (await client.execute("SELECT * FROM practice_receipts")).rows,
      ).toEqual(before.receipts);
      expect((await client.execute("SELECT * FROM audit_logs")).rows).toEqual(
        before.audits,
      );
      expect(
        (await client.execute("SELECT * FROM practice_receipt_corrections"))
          .rows,
      ).toHaveLength(0);
      expect(
        (
          await client.execute(
            "SELECT count(*) AS total FROM sqlite_master WHERE type='trigger' AND name LIKE 'practice_receipt_%'",
          )
        ).rows[0].total,
      ).toBe(8);
      await client.execute({
        sql: `INSERT INTO practice_receipt_corrections
        (id,receipt_id,professional_id,patient_id,revision,expected_revision,kind,amount_cents,currency,method,reference,received_at,reason,author_user_id,submission_id,submission_payload,created_at)
        VALUES ('fixture-change','fixture-receipt','fixture-pro','fixture-patient',1,0,'corrected',3500,'eur','transfer','fixture-pro:original','2026-01-15T15:00:00.000Z','Importe corregido','fixture-author',?,'{}','2026-01-15T15:01:00.000Z')`,
        args: [crypto.randomUUID()],
      });
      await expect(
        client.execute("UPDATE practice_receipts SET amount_cents=5"),
      ).rejects.toThrow();
      await expect(
        client.execute(
          "UPDATE practice_receipt_corrections SET amount_cents=5",
        ),
      ).rejects.toThrow();
      await expect(
        client.execute(
          "UPDATE practice_receipt_corrections SET author_user_id=NULL",
        ),
      ).rejects.toThrow();
      await client.execute(
        "UPDATE professionals SET user_id='fixture-new-owner' WHERE id='fixture-pro'",
      );
      await client.execute("DELETE FROM user WHERE id='fixture-author'");
      expect(
        (
          await client.execute(
            "SELECT author_user_id,revision,amount_cents FROM practice_receipt_corrections",
          )
        ).rows[0],
      ).toMatchObject({
        author_user_id: null,
        revision: 1,
        amount_cents: 3500,
      });
      await client.execute("DELETE FROM professionals WHERE id='fixture-pro'");
      expect(
        (await client.execute("SELECT * FROM practice_receipt_corrections"))
          .rows,
      ).toHaveLength(0);
      expect((await client.execute("SELECT * FROM audit_logs")).rows).toEqual(
        before.audits,
      );
    } finally {
      client.close();
    }
  });
});
