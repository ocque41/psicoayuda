import { eq, like } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RequestContext, RequestList } from "@/app/mi/patient-parts";
import { ProfessionalPatientRequests } from "@/app/mi/professional-requests";
import { db } from "@/db";
import {
  conversations,
  patientAccounts,
  patientConversationLinks,
  patientSessionRequests,
  practiceAppointments,
  practicePatients,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";
import {
  linkedRequestTimeLabel,
  professionalPatientRequests,
  requestFilterValues,
  requestNextStep,
  requestPageHref,
  requestStatusText,
} from "@/lib/patient/professional-requests";
import { patientRequestCounts, patientRequests } from "@/lib/patient/queries";

const P = "test-request-context";
const timestamp = "2026-10-01T12:00:00.000Z";
const id = (suffix: string) => `${P}-${suffix}`;
async function cleanup() {
  for (const [table, column] of [
    [patientSessionRequests, patientSessionRequests.id],
    [patientConversationLinks, patientConversationLinks.conversationId],
    [practiceAppointments, practiceAppointments.id],
    [practicePatients, practicePatients.id],
    [practiceSettings, practiceSettings.professionalId],
    [patientAccounts, patientAccounts.userId],
    [conversations, conversations.id],
    [professionals, professionals.id],
    [user, user.id],
  ] as const)
    await db.delete(table).where(like(column, `${P}%`));
}

describe("contexto e historial privado de solicitudes", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(user).values(
      ["patient", "other", "inactive", "pro-user", "other-pro-user"].map(
        (suffix) => ({
          id: id(suffix),
          name: "Cuenta ficticia",
          email: `${id(suffix)}@example.test`,
        }),
      ),
    );
    await db.insert(professionals).values(
      ["pro", "other-pro"].map((suffix) => ({
        id: id(suffix),
        userId: id(`${suffix}-user`),
        fullName: "Profesional ficticio",
        email: `${id(suffix)}@example.test`,
        status: "approved",
        languages: '["es"]',
        supportAreas: "[]",
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    await db.insert(practiceSettings).values({
      professionalId: id("pro"),
      timeZone: "Europe/Madrid",
      updatedAt: timestamp,
    });
    await db.insert(patientAccounts).values(
      ["patient", "other", "inactive"].map((suffix) => ({
        userId: id(suffix),
        displayName: `Alias ficticio ${suffix}`,
        deletionState: suffix === "inactive" ? "deleting" : "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    await db.insert(conversations).values(
      [
        "own",
        "foreign",
        "unlinked",
        "deleted",
        "anonymous",
        "inactive",
        "mismatch",
      ].map((suffix) => ({
        id: id(`chat-${suffix}`),
        professionalId: id(suffix === "foreign" ? "other-pro" : "pro"),
        seekerSid: "ficticio",
        deletedAt: suffix === "deleted" ? new Date(timestamp) : null,
        anonymizedAt: suffix === "anonymous" ? timestamp : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    await db.insert(patientConversationLinks).values(
      ["own", "foreign", "deleted", "anonymous", "inactive", "mismatch"].map(
        (suffix) => ({
          conversationId: id(`chat-${suffix}`),
          userId: id(
            suffix === "foreign" || suffix === "mismatch"
              ? "other"
              : suffix === "inactive"
                ? "inactive"
                : "patient",
          ),
          verifiedBy: "seeker_session",
          verifiedAt: timestamp,
        }),
      ),
    );
    await db.insert(practicePatients).values(
      ["own", "foreign"].map((suffix) => ({
        id: id(`record-${suffix}`),
        professionalId: id(suffix === "own" ? "pro" : "other-pro"),
        conversationId: id(`chat-${suffix}`),
        name: "Ficha ficticia",
        country: "VE",
        timeZone: "America/Caracas",
        consentAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    await db.insert(practiceAppointments).values(
      ["own", "foreign"].map((suffix) => ({
        id: id(`appointment-${suffix}`),
        professionalId: id(suffix === "own" ? "pro" : "other-pro"),
        patientId: id(`record-${suffix}`),
        startsAt: "2026-10-06T14:00:00.000Z",
        endsAt: "2026-10-06T14:50:00.000Z",
        timeZone: "America/Caracas",
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    await db.insert(patientSessionRequests).values([
      ...Array.from({ length: 25 }, (_, i) => ({
        id: id(`history-${String(i).padStart(2, "0")}`),
        userId: id("patient"),
        conversationId: id("chat-own"),
        kind: "new",
        status: "reviewed",
        timezone: "America/Caracas",
        preferredStartsAt: "2026-10-07T14:00:00.000Z",
        reason: "schedule",
        createdAt: timestamp,
        updatedAt: "2026-10-02T12:00:00.000Z",
      })),
      {
        id: id("pending-early"),
        userId: id("patient"),
        conversationId: id("chat-own"),
        appointmentId: id("appointment-own"),
        kind: "cancel",
        status: "pending",
        timezone: "America/Caracas",
        reason: "unavailable",
        createdAt: "2026-10-03T03:30:00.000Z",
        updatedAt: "2026-10-03T03:30:00.000Z",
      },
      {
        id: id("pending-late"),
        userId: id("patient"),
        conversationId: id("chat-own"),
        kind: "new",
        status: "pending",
        timezone: "America/Caracas",
        preferredStartsAt: "2026-10-07T14:00:00.000Z",
        reason: "other",
        createdAt: "2026-10-03T04:30:00.000Z",
        updatedAt: "2026-10-03T04:30:00.000Z",
      },
      {
        id: id("confirmed"),
        userId: id("patient"),
        conversationId: id("chat-own"),
        appointmentId: id("appointment-own"),
        kind: "reschedule",
        status: "confirmed",
        timezone: "America/Caracas",
        preferredStartsAt: "2026-10-06T14:00:00.000Z",
        reason: "schedule",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: id("cross-appointment"),
        userId: id("patient"),
        conversationId: id("chat-own"),
        appointmentId: id("appointment-foreign"),
        kind: "reschedule",
        status: "reviewed",
        timezone: "America/Caracas",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...[
        "foreign",
        "unlinked",
        "deleted",
        "anonymous",
        "inactive",
        "mismatch",
      ].map((suffix) => ({
        id: id(`hidden-${suffix}`),
        userId: id(
          suffix === "foreign"
            ? "other"
            : suffix === "inactive"
              ? "inactive"
              : "patient",
        ),
        conversationId: id(`chat-${suffix}`),
        kind: "new",
        status: "pending",
        timezone: "UTC",
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    ]);
  });
  afterAll(cleanup);

  it("pagina decisiones sin huecos ni duplicados aun con timestamps iguales", async () => {
    const first = await professionalPatientRequests(
      id("pro"),
      "Europe/Madrid",
      { solicitudes_estado: "all" },
    );
    const second = await professionalPatientRequests(
      id("pro"),
      "Europe/Madrid",
      { solicitudes_estado: "all", solicitudes: "2" },
    );
    expect(first.total).toBe(29);
    expect(first.rows).toHaveLength(20);
    expect(second.rows).toHaveLength(9);
    expect(
      new Set([...first.rows, ...second.rows].map((row) => row.id)).size,
    ).toBe(29);
    expect(
      first.rows.concat(second.rows).some((row) => row.id.includes("hidden")),
    ).toBe(false);
    const oversized = await professionalPatientRequests(id("pro"), "UTC", {
      solicitudes_estado: "all",
      solicitudes: "99999",
    });
    expect(oversized.page).toBe(2);
    expect(
      (
        await professionalPatientRequests(id("other-pro"), "UTC", {
          solicitudes_estado: "all",
        })
      ).rows.map((row) => row.id),
    ).toEqual([id("hidden-foreign")]);
  });

  it("ordena pendientes por antigüedad y filtra el día de envío en la zona elegida", async () => {
    const pending = await professionalPatientRequests(
      id("pro"),
      "America/Caracas",
    );
    expect(pending.rows.map((row) => row.id)).toEqual([
      id("pending-early"),
      id("pending-late"),
    ]);
    const day = await professionalPatientRequests(
      id("pro"),
      "America/Caracas",
      { solicitudes_desde: "2026-10-03", solicitudes_hasta: "2026-10-03" },
    );
    expect(day.rows.map((row) => row.id)).toEqual([id("pending-late")]);
    const reviewed = await professionalPatientRequests(id("pro"), "UTC", {
      solicitudes_estado: "reviewed",
    });
    expect(reviewed.total).toBe(26);
    expect(
      requestFilterValues(
        { solicitudes_estado: "unknown", solicitudes_desde: "2026-02-30" },
        "UTC",
      ),
    ).toMatchObject({ state: "pending", fromUtc: null });
    expect(
      requestFilterValues(
        { solicitudes_desde: "2026-10-05", solicitudes_hasta: "2026-10-03" },
        "UTC",
      ).error,
    ).toBeTruthy();
    const url = new URL(
      requestPageHref(
        {
          mes: "2026-10",
          chats: "2",
          solicitudes_estado: "reviewed",
          solicitudes_desde: "2026-10-01",
        },
        2,
      ),
      "https://example.test",
    );
    expect(url.searchParams.get("solicitudes_estado")).toBe("reviewed");
    expect(url.searchParams.get("solicitudes_desde")).toBe("2026-10-01");
    expect(url.searchParams.get("chats")).toBe("2");
    expect(url.hash).toBe("#solicitudes");
  });

  it("proyecta la cita propia y nunca una cita de otra ficha o profesional", async () => {
    const rows = (
      await professionalPatientRequests(id("pro"), "UTC", {
        solicitudes_estado: "all",
        solicitudes: "2",
      })
    ).rows;
    const bad = rows.find((row) => row.id === id("cross-appointment"));
    expect(bad).toMatchObject({
      patientId: id("record-own"),
      linkedStartsAt: null,
      linkedStatus: null,
    });
    const patientRows = [
      ...(await patientRequests(id("patient"))),
      ...(await patientRequests(id("patient"), 2)),
    ];
    expect(patientRows).toHaveLength(29);
    expect(
      patientRows.find((row) => row.id === id("cross-appointment")),
    ).toMatchObject({
      linkedStartsAt: null,
      professionalTimezone: "Europe/Madrid",
    });
    expect(
      patientRows.find((row) => row.id === id("pending-early")),
    ).toMatchObject({
      linkedStartsAt: "2026-10-06T14:00:00.000Z",
      linkedStatus: "scheduled",
      reason: "unavailable",
    });
    expect(await patientRequestCounts(id("patient"))).toEqual({
      total: 29,
      pending: 2,
    });
    expect((await patientRequests(id("other"))).map((row) => row.id)).toEqual([
      id("hidden-foreign"),
    ]);
  });

  it("revocar el vínculo o iniciar una baja excluye filas y conteos", async () => {
    try {
      await db
        .update(patientConversationLinks)
        .set({ userId: id("other") })
        .where(eq(patientConversationLinks.conversationId, id("chat-own")));
      expect(await patientRequestCounts(id("patient"))).toEqual({
        total: 0,
        pending: 0,
      });
      expect(await patientRequests(id("patient"))).toEqual([]);
      expect(
        (
          await professionalPatientRequests(id("pro"), "UTC", {
            solicitudes_estado: "all",
          })
        ).total,
      ).toBe(0);
    } finally {
      await db
        .update(patientConversationLinks)
        .set({ userId: id("patient") })
        .where(eq(patientConversationLinks.conversationId, id("chat-own")));
    }
    try {
      await db
        .update(patientAccounts)
        .set({ deletionState: "deleting" })
        .where(eq(patientAccounts.userId, id("patient")));
      expect(await patientRequests(id("patient"))).toEqual([]);
      expect(await patientRequestCounts(id("patient"))).toEqual({
        total: 0,
        pending: 0,
      });
      expect(
        (
          await professionalPatientRequests(id("pro"), "UTC", {
            solicitudes_estado: "all",
          })
        ).total,
      ).toBe(0);
    } finally {
      await db
        .update(patientAccounts)
        .set({ deletionState: "active" })
        .where(eq(patientAccounts.userId, id("patient")));
    }
  });

  it("presenta fecha, zonas, motivo y siguiente paso sin inventar la hora anterior", async () => {
    const pending = (
      await professionalPatientRequests(id("pro"), "Europe/Madrid")
    ).rows[0];
    expect(linkedRequestTimeLabel(pending)).toBe(
      "Horario original de la sesión",
    );
    expect(
      linkedRequestTimeLabel({
        ...pending,
        linkedUpdatedAt: pending.createdAt,
      }),
    ).toBe("Sesión vinculada · horario actual");
    const changed = { ...pending, linkedUpdatedAt: "2026-10-04T00:00:00.000Z" };
    expect(linkedRequestTimeLabel(changed)).toBe(
      "Sesión vinculada · horario actual",
    );
    expect(requestStatusText({ kind: "cancel", status: "confirmed" })).toBe(
      "Cancelación confirmada",
    );
    expect(
      requestNextStep({ ...pending, status: "reviewed" }, "patient"),
    ).toContain("no confirma ni cambia");
    expect(requestNextStep(pending, "patient")).toContain("sigue programada");
    const html = renderToStaticMarkup(
      <RequestContext
        request={pending}
        timezone="Europe/Madrid"
        otherTimezone="America/Caracas"
        audience="professional"
      />,
    );
    expect(html).toContain("Solicitud enviada");
    expect(html).toContain("No puedo asistir");
    expect(html).toContain("Europe/Madrid");
    expect(html).toContain("America/Caracas");
    expect(html).toContain("2026");
    expect(html).toContain("Siguiente paso");
    const patientHtml = renderToStaticMarkup(
      <RequestList
        rows={await patientRequests(id("patient"))}
        timezone="America/Caracas"
      />,
    );
    expect(patientHtml).toContain(`/mi/mensajes/${id("chat-own")}`);
    expect(patientHtml).not.toContain(id("chat-foreign"));
    const historyHtml = renderToStaticMarkup(
      await ProfessionalPatientRequests({
        professionalId: id("pro"),
        timezone: "Europe/Madrid",
        parameters: { solicitudes_estado: "reviewed" },
      }),
    );
    expect(historyHtml).toContain("solicitudes_estado");
    expect(historyHtml).toContain("Enviadas desde");
    expect(historyHtml).not.toContain("Guardar decisión");
    expect(historyHtml).toContain("Siguiente →");
    const untouched = await db.query.practiceAppointments.findFirst({
      where: eq(practiceAppointments.id, id("appointment-own")),
    });
    expect(untouched).toMatchObject({
      status: "scheduled",
      startsAt: "2026-10-06T14:00:00.000Z",
    });
  });
});
