import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptNote, encryptNote } from "@/lib/practice/note-crypto";

describe("0036: notas por sesión sin alterar el historial", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("conserva cifrado y AAD antiguo y verifica relaciones dentro de cada escritura", async () => {
    vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "ab".repeat(32));
    const client = createClient({ url: ":memory:" });
    try {
      await client.executeMultiple(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE professionals (id TEXT PRIMARY KEY);
        CREATE TABLE practice_patients (id TEXT PRIMARY KEY, professional_id TEXT NOT NULL REFERENCES professionals(id));
        CREATE TABLE practice_appointments (id TEXT PRIMARY KEY, professional_id TEXT NOT NULL, patient_id TEXT NOT NULL, starts_at TEXT, status TEXT);
        INSERT INTO professionals VALUES ('pro-ficticio'), ('otro-pro-ficticio');
        INSERT INTO practice_patients VALUES ('paciente-ficticio','pro-ficticio'), ('otro-paciente-ficticio','otro-pro-ficticio'), ('segunda-ficha','pro-ficticio');
        INSERT INTO practice_appointments VALUES ('sesion-ficticia','pro-ficticio','paciente-ficticio','2026-10-01T14:00:00.000Z','completed'), ('sesion-ajena','otro-pro-ficticio','otro-paciente-ficticio','2026-10-02T14:00:00.000Z','cancelled'), ('segunda-sesion','pro-ficticio','paciente-ficticio','2026-10-03T14:00:00.000Z','cancelled'), ('otra-ficha','pro-ficticio','segunda-ficha','2026-10-04T14:00:00.000Z','scheduled');
      `);
      const oldMigration = await readFile(
        new URL("../../drizzle/0030_practice_notes.sql", import.meta.url),
        "utf8",
      );
      for (const statement of oldMigration.split("--> statement-breakpoint"))
        await client.execute(statement);
      const ciphertext = await encryptNote(
        "Apunte antiguo ficticio",
        "pro-ficticio",
        "paciente-ficticio",
        "nota-antigua",
      );
      await client.execute({
        sql: "INSERT INTO practice_notes VALUES ('nota-antigua','pro-ficticio','paciente-ficticio',?,7,'2026-09-01','2026-09-02')",
        args: [ciphertext],
      });
      const before = (await client.execute("SELECT * FROM practice_notes"))
        .rows[0];
      const appointments = (
        await client.execute("SELECT * FROM practice_appointments")
      ).rows;
      const migration = await readFile(
        new URL("../../drizzle/0036_session_notes.sql", import.meta.url),
        "utf8",
      );
      expect(migration).not.toMatch(
        /\b(?:DROP TABLE|DELETE FROM|UPDATE practice_notes)\b/i,
      );
      for (const statement of migration.split("--> statement-breakpoint"))
        await client.execute(statement);
      expect(
        (await client.execute("SELECT * FROM practice_notes")).rows,
      ).toEqual([{ ...before, appointment_id: null }]);
      expect(
        (await client.execute("SELECT * FROM practice_appointments")).rows,
      ).toEqual(appointments);
      expect(
        await decryptNote(
          ciphertext,
          "pro-ficticio",
          "paciente-ficticio",
          "nota-antigua",
        ),
      ).toBe("Apunte antiguo ficticio");
      const insert = (id: string, session: string | null) => ({
        sql: "INSERT INTO practice_notes (id,professional_id,patient_id,ciphertext,created_at,updated_at,appointment_id) VALUES (?,'pro-ficticio','paciente-ficticio',?,'2026-10-03','2026-10-03',?)",
        args: [id, ciphertext, session],
      });
      for (const session of [null, "ausente", "sesion-ajena", "otra-ficha"])
        await expect(
          client.execute(insert(`rechazada-${session}`, session)),
        ).rejects.toThrow();
      await expect(
        client.batch(
          [
            insert("batch-valida", "sesion-ficticia"),
            insert("batch-ajena", "sesion-ajena"),
          ],
          "write",
        ),
      ).rejects.toThrow();
      expect(
        (
          await client.execute(
            "SELECT * FROM practice_notes WHERE id LIKE 'batch-%'",
          )
        ).rows,
      ).toHaveLength(0);
      await client.execute(insert("nota-nueva", "sesion-ficticia"));
      await client.execute(insert("otra-nota", "sesion-ficticia"));
      await client.execute(
        "UPDATE practice_notes SET revision=8 WHERE id='nota-antigua'",
      );
      await expect(
        client.execute(
          "UPDATE practice_notes SET appointment_id='sesion-ficticia' WHERE id='nota-antigua'",
        ),
      ).rejects.toThrow();
      await expect(
        client.execute(
          "UPDATE practice_notes SET appointment_id='segunda-sesion' WHERE id='nota-nueva'",
        ),
      ).rejects.toThrow();
      await expect(
        client.execute(
          "UPDATE practice_notes SET appointment_id=NULL WHERE id='nota-nueva'",
        ),
      ).rejects.toThrow();
      await expect(
        client.execute(
          "UPDATE practice_appointments SET id='sesion-trasladada' WHERE id='sesion-ficticia'",
        ),
      ).rejects.toThrow();
      // El guard funciona también si un driver no ha activado las FK.
      await client.execute("PRAGMA foreign_keys=OFF");
      await expect(
        client.execute(
          "DELETE FROM practice_appointments WHERE id='sesion-ficticia'",
        ),
      ).rejects.toThrow();
      await expect(
        client.execute(
          "UPDATE practice_appointments SET patient_id='segunda-ficha' WHERE id='sesion-ficticia'",
        ),
      ).rejects.toThrow();
      await client.execute(
        "UPDATE practice_appointments SET status='cancelled',starts_at='2026-10-05T14:00:00.000Z' WHERE id='sesion-ficticia'",
      );
      await client.execute(
        "UPDATE practice_notes SET revision=2 WHERE id='nota-nueva'",
      );
      expect(
        (
          await client.execute(
            "SELECT appointment_id,revision FROM practice_notes WHERE id='nota-nueva'",
          )
        ).rows[0],
      ).toMatchObject({ appointment_id: "sesion-ficticia", revision: 2 });
      // La purga explícita conserva el orden notas -> citas existente.
      await client.execute(
        "DELETE FROM practice_notes WHERE appointment_id='sesion-ficticia'",
      );
      await client.execute(
        "DELETE FROM practice_appointments WHERE id='sesion-ficticia'",
      );
      expect(
        (
          await client.execute(
            "SELECT ciphertext,revision,appointment_id FROM practice_notes WHERE id='nota-antigua'",
          )
        ).rows[0],
      ).toMatchObject({ ciphertext, revision: 8, appointment_id: null });
    } finally {
      client.close();
    }
  });
});
