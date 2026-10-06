"use server";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  assignments,
  auditLogs,
  careCycles,
  carePlans,
  conversations,
  practiceAppointments,
  practicePatientProfiles,
  practicePatients,
  practiceReceipts,
  practiceServices,
  practiceSettings,
  professionals,
} from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";
import {
  ownedPatient,
  requirePracticeProfessional,
} from "@/lib/practice/access";
import {
  appointmentStates,
  localToUtc,
  moneyCents,
  patientSchema,
  patientStates,
  paymentMethods,
  serviceSchema,
  settingsSchema,
} from "@/lib/practice/domain";
import {
  currentPracticeActor,
  nextPracticeTimestamp,
} from "@/lib/practice/mutation-guard";
import { encryptPatientProfile } from "@/lib/practice/patient-profile-crypto";
import {
  hasPatientProfileContent,
  patientProfileSchema,
} from "@/lib/practice/patient-profile-domain";
import {
  currentPatientProfileActor,
  currentPatientProfileSession,
} from "@/lib/practice/patient-profile-guard";
import { receiptReceivedAt } from "@/lib/practice/receipts";

export type PracticeFormState = { ok: boolean; message: string } | null;
function invalid(
  message = "Revisa los datos del formulario.",
): PracticeFormState {
  return { ok: false, message };
}
function refresh() {
  revalidatePath("/pro/consulta");
  revalidatePath("/pro/pacientes");
  revalidatePath("/pro/pacientes", "layout");
  revalidatePath("/pro/mensajes");
  revalidatePath("/pro/dashboard");
}
function audit(
  pro: { id: string; userId: string; email: string },
  action: string,
  entityId: string,
) {
  // Debe ir inmediatamente después de la mutación dentro del mismo batch.
  return db.insert(auditLogs).select(
    db
      .select({
        id: sql<string>`${newId("log")}`.as("id"),
        actorEmail: sql<string>`${pro.email}`.as("actor_email"),
        action: sql<string>`${action}`.as("action"),
        entityType: sql<string>`'practice'`.as("entity_type"),
        entityId: sql<string>`${entityId}`.as("entity_id"),
        metadata: sql<null>`NULL`.as("metadata"),
        createdAt: sql<string>`${nowIso()}`.as("created_at"),
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.id, pro.id),
          currentPracticeActor(pro.id, pro.userId),
          sql`changes() > 0`,
        ),
      ),
  );
}

export async function createPatient(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const parsed = patientSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const profile = patientProfileSchema(parsed.data.timeZone).safeParse(
    Object.fromEntries(form),
  );
  if (!profile.success) return invalid(profile.error.issues[0]?.message);
  const auth = await getServerSession();
  if (!auth?.session?.id || auth.user.id !== pro.userId)
    return invalid(
      "Tu sesión cambió. Conserva los datos y vuelve a entrar antes de guardarlos.",
    );
  const conversationId = String(form.get("conversationId") || "");
  let program = parsed.data.program;
  let linkedHelpRequestId: string | null = null;
  if (conversationId) {
    const chat = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.professionalId, pro.id),
        eq(conversations.status, "open"),
        isNull(conversations.closedAt),
        isNull(conversations.deletedAt),
        isNull(conversations.anonymizedAt),
      ),
    });
    if (!chat) return invalid("Esta conversación no está disponible.");
    linkedHelpRequestId = chat.helpRequestId;
    // El formulario de ayuda existente pertenece al programa del terremoto.
    if (chat.helpRequestId) program = "earthquake";
  }
  const id = newId("patient");
  const timestamp = nowIso();
  try {
    // El cifrado se completa antes de crear contacto, auditoría o ficha ampliada.
    const profileCiphertext = hasPatientProfileContent(profile.data)
      ? await encryptPatientProfile(profile.data, pro.id, id)
      : null;
    const [saved] = await db.batch([
      db
        .insert(practicePatients)
        .select(
          db
            .select({
              id: sql<string>`${id}`.as("id"),
              professionalId: professionals.id,
              conversationId: sql<string | null>`${conversationId || null}`.as(
                "conversation_id",
              ),
              name: sql<string>`${parsed.data.name}`.as("name"),
              email: sql<string>`${parsed.data.email}`.as("email"),
              country: sql<string>`${parsed.data.country}`.as("country"),
              timeZone: sql<string>`${parsed.data.timeZone}`.as("time_zone"),
              program:
                sql<string>`CASE WHEN EXISTS (SELECT 1 FROM conversations c WHERE c.id=${conversationId} AND c.help_request_id IS NOT NULL) THEN 'earthquake' ELSE ${program} END`.as(
                  "program",
                ),
              status: sql<string>`'new'`.as("status"),
              consentAt: sql<string>`${timestamp}`.as("consent_at"),
              createdAt: sql<string>`${timestamp}`.as("created_at"),
              updatedAt: sql<string>`${timestamp}`.as("updated_at"),
            })
            .from(professionals)
            .where(
              and(
                eq(professionals.id, pro.id),
                currentPracticeActor(pro.id, pro.userId),
                currentPatientProfileSession(
                  pro.id,
                  pro.userId,
                  auth.session.id,
                ),
                sql`(${conversationId}='' OR EXISTS (SELECT 1 FROM conversations c WHERE c.id=${conversationId} AND c.professional_id=${pro.id} AND c.status='open' AND c.closed_at IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL AND c.help_request_id IS ${linkedHelpRequestId}))`,
              ),
            ),
        )
        .returning({ id: practicePatients.id }),
      audit(pro, "patient_created", id),
      ...(profileCiphertext
        ? [
            db.insert(practicePatientProfiles).values({
              patientId: id,
              professionalId: pro.id,
              // Un guard rechazado produce NOT NULL y revierte TODO el batch.
              contentCiphertext: sql<string>`CASE WHEN ${currentPatientProfileActor(pro.id, pro.userId, id, auth.session.id)} THEN ${profileCiphertext} ELSE NULL END`,
              revision: 1,
              updatedAt: timestamp,
            }),
          ]
        : []),
    ]);
    if (!saved.length)
      return invalid(
        "Tu consulta o esta conversación cambió. Actualiza la página antes de guardar la ficha.",
      );
  } catch {
    return invalid(
      "No pudimos guardar la ficha. Si ya vinculaste ese chat, abre su ficha existente.",
    );
  }
  refresh();
  return {
    ok: true,
    message: "Ficha guardada. Ya puedes programar sus sesiones.",
  };
}
export async function saveService(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const parsed = serviceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { price, ...data } = parsed.data;
  const id = newId("service");
  const [saved] = await db.batch([
    db
      .insert(practiceServices)
      .select(
        db
          .select({
            id: sql<string>`${id}`.as("id"),
            professionalId: professionals.id,
            title: sql<string>`${data.title}`.as("title"),
            durationMinutes: sql<number>`${data.durationMinutes}`.as(
              "duration_minutes",
            ),
            sessionsCount: sql<number>`${data.sessionsCount}`.as(
              "sessions_count",
            ),
            priceCents: sql<number>`${moneyCents(price)}`.as("price_cents"),
            currency: sql<string>`${data.currency}`.as("currency"),
            interval: sql<string>`${data.interval}`.as("interval"),
            validityDays: sql<number>`${data.validityDays}`.as("validity_days"),
            cancellationHours: sql<number>`${data.cancellationHours}`.as(
              "cancellation_hours",
            ),
            active: sql<boolean>`1`.as("active"),
            createdAt: sql<string>`${nowIso()}`.as("created_at"),
          })
          .from(professionals)
          .where(
            and(
              eq(professionals.id, pro.id),
              currentPracticeActor(pro.id, pro.userId),
            ),
          ),
      )
      .returning({ id: practiceServices.id }),
    audit(pro, "service_created", id),
  ]);
  if (!saved.length)
    return invalid(
      "Tu consulta cambió y no pudimos guardar el servicio. Actualiza la página.",
    );
  revalidatePath("/pro/servicios");
  refresh();
  return { ok: true, message: "Servicio guardado." };
}
export async function saveSettings(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const previous = await db.query.practiceSettings.findFirst({
    where: eq(practiceSettings.professionalId, pro.id),
  });
  const timestamp = nextPracticeTimestamp(previous?.updatedAt);
  const saved = await db
    .insert(practiceSettings)
    .select(
      db
        .select({
          professionalId: professionals.id,
          timeZone: sql<string>`${parsed.data.timeZone}`.as("time_zone"),
          workStart: sql<number>`${parsed.data.workStart}`.as("work_start"),
          workEnd: sql<number>`${parsed.data.workEnd}`.as("work_end"),
          updatedAt: sql<string>`${timestamp}`.as("updated_at"),
        })
        .from(professionals)
        .where(
          and(
            eq(professionals.id, pro.id),
            currentPracticeActor(pro.id, pro.userId),
            previous
              ? sql`EXISTS (SELECT 1 FROM practice_settings prior WHERE prior.professional_id=${pro.id} AND prior.updated_at=${previous.updatedAt})`
              : sql`NOT EXISTS (SELECT 1 FROM practice_settings prior WHERE prior.professional_id=${pro.id})`,
          ),
        ),
    )
    .onConflictDoUpdate({
      target: practiceSettings.professionalId,
      set: { ...parsed.data, updatedAt: timestamp },
      setWhere: previous
        ? eq(practiceSettings.updatedAt, previous.updatedAt)
        : sql`0`,
    })
    .returning({ id: practiceSettings.professionalId });
  if (!saved.length)
    return invalid(
      "Tu consulta o el horario cambió en otra ventana. Actualiza la página antes de guardar.",
    );
  revalidatePath("/pro/ajustes");
  refresh();
  return { ok: true, message: "Horario guardado." };
}
export async function scheduleAppointment(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const patientId = String(form.get("patientId") || "");
  const patient = await ownedPatient(patientId, pro.id);
  if (!patient || patient.status === "closed")
    return invalid("Abre una ficha activa para programar la cita.");
  const service = await db.query.practiceServices.findFirst({
    where: and(
      eq(practiceServices.id, String(form.get("serviceId") || "")),
      eq(practiceServices.professionalId, pro.id),
      eq(practiceServices.active, true),
    ),
  });
  if (!service) return invalid("Selecciona un servicio activo.");
  const settings = await db.query.practiceSettings.findFirst({
    where: eq(practiceSettings.professionalId, pro.id),
  });
  const timeZone = settings?.timeZone || "America/Caracas";
  const startsAt = localToUtc(String(form.get("startsAt") || ""), timeZone);
  if (!startsAt || Date.parse(startsAt) < Date.now())
    return invalid(
      "Elige una fecha futura. Si cambia el horario de verano, usa una hora que no sea ambigua.",
    );
  const careCycleId = String(form.get("careCycleId") || "");
  if (careCycleId) {
    const [cycle] = await db
      .select({ id: careCycles.id })
      .from(careCycles)
      .innerJoin(carePlans, eq(careCycles.carePlanId, carePlans.id))
      .where(
        and(
          eq(careCycles.id, careCycleId),
          eq(carePlans.patientId, patient.id),
          eq(carePlans.professionalId, pro.id),
          eq(carePlans.serviceId, service.id),
        ),
      );
    if (!cycle)
      return invalid(
        "El ciclo elegido no corresponde al paciente o al servicio.",
      );
  }
  const endsAt = new Date(
    Date.parse(startsAt) + service.durationMinutes * 60000,
  ).toISOString();
  const modality =
    form.get("modality") === "in_person" ? "in_person" : "online";
  const id = newId("appointment");
  const timestamp = nowIso();
  try {
    const [saved] = await db.batch([
      db
        .insert(practiceAppointments)
        .select(
          db
            .select({
              id: sql<string>`${id}`.as("id"),
              professionalId: professionals.id,
              patientId: practicePatients.id,
              serviceId: practiceServices.id,
              startsAt: sql<string>`${startsAt}`.as("starts_at"),
              endsAt: sql<string>`${endsAt}`.as("ends_at"),
              timeZone: sql<string>`${timeZone}`.as("time_zone"),
              status: sql<string>`'scheduled'`.as("status"),
              modality: sql<string>`${modality}`.as("modality"),
              priceCents:
                sql<number>`CASE WHEN ${practicePatients.program}='earthquake' THEN 0 ELSE round(${practiceServices.priceCents} * 1.0 / ${practiceServices.sessionsCount}) END`.as(
                  "price_cents",
                ),
              currency: practiceServices.currency,
              cancellationHours: practiceServices.cancellationHours,
              dailyRoom: sql<null>`NULL`.as("daily_room"),
              careCycleId: sql<string | null>`${careCycleId || null}`.as(
                "care_cycle_id",
              ),
              createdAt: sql<string>`${timestamp}`.as("created_at"),
              updatedAt: sql<string>`${timestamp}`.as("updated_at"),
            })
            .from(professionals)
            .innerJoin(
              practicePatients,
              eq(practicePatients.professionalId, professionals.id),
            )
            .innerJoin(
              practiceServices,
              eq(practiceServices.professionalId, professionals.id),
            )
            .where(
              and(
                eq(professionals.id, pro.id),
                currentPracticeActor(pro.id, pro.userId),
                eq(practicePatients.id, patient.id),
                ne(practicePatients.status, "closed"),
                eq(practicePatients.updatedAt, patient.updatedAt),
                eq(practiceServices.id, service.id),
                eq(practiceServices.active, true),
                eq(practiceServices.durationMinutes, service.durationMinutes),
                eq(practiceServices.priceCents, service.priceCents),
                eq(practiceServices.sessionsCount, service.sessionsCount),
                eq(practiceServices.currency, service.currency),
                eq(
                  practiceServices.cancellationHours,
                  service.cancellationHours,
                ),
                sql`coalesce((SELECT time_zone FROM practice_settings WHERE professional_id=${pro.id}),'America/Caracas')=${timeZone}`,
                sql`${startsAt} > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
                careCycleId
                  ? sql`EXISTS (SELECT 1 FROM care_cycles cycle JOIN care_plans plan ON plan.id=cycle.care_plan_id WHERE cycle.id=${careCycleId} AND plan.patient_id=${patient.id} AND plan.professional_id=${pro.id} AND plan.service_id=${service.id} AND cycle.status='paid')`
                  : undefined,
              ),
            ),
        )
        .returning({ id: practiceAppointments.id }),
      audit(pro, "appointment_scheduled", id),
    ]);
    if (!saved.length)
      return invalid(
        "La ficha, el servicio o tu consulta cambió. Actualiza la página antes de programar.",
      );
  } catch {
    return invalid(
      "No pudimos guardar la cita. Comprueba si ya tienes otra sesión a esa hora.",
    );
  }
  refresh();
  return {
    ok: true,
    message: `Sesión programada. Comparte la fecha con el paciente en el chat; su zona es ${patient.timeZone}.`,
  };
}
export async function updateAppointment(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const status = z.enum(appointmentStates).safeParse(form.get("status"));
  if (!status.success) return invalid();
  const id = String(form.get("appointmentId") || "");
  const appt = await db.query.practiceAppointments.findFirst({
    where: and(
      eq(practiceAppointments.id, id),
      eq(practiceAppointments.professionalId, pro.id),
    ),
  });
  if (appt?.status !== "scheduled")
    return invalid("La cita ya cambió de estado. Actualiza la página.");
  if (status.data === "scheduled")
    return invalid(
      "Esta sesión ya está programada. Elige un cambio de estado.",
    );
  if (status.data === "completed" && Date.parse(appt.startsAt) > Date.now())
    return invalid("La sesión todavía no ha comenzado.");
  if (appt.dailyRoom) {
    try {
      const { dailyRequest } = await import("@/lib/practice/calls");
      await dailyRequest(`/rooms/${appt.dailyRoom}`, undefined, "DELETE");
    } catch {
      return invalid(
        "No pudimos detener la llamada. Reintenta antes de cerrar la sesión.",
      );
    }
  }
  const [changed] = await db.batch([
    db
      .update(practiceAppointments)
      .set({
        status: status.data,
        updatedAt: nextPracticeTimestamp(appt.updatedAt),
      })
      .where(
        and(
          eq(practiceAppointments.id, id),
          eq(practiceAppointments.professionalId, pro.id),
          eq(practiceAppointments.patientId, appt.patientId),
          sql`${practiceAppointments.serviceId} IS ${appt.serviceId}`,
          sql`${practiceAppointments.careCycleId} IS ${appt.careCycleId}`,
          eq(practiceAppointments.status, "scheduled"),
          eq(practiceAppointments.updatedAt, appt.updatedAt),
          eq(practiceAppointments.startsAt, appt.startsAt),
          eq(practiceAppointments.endsAt, appt.endsAt),
          appt.dailyRoom
            ? eq(practiceAppointments.dailyRoom, appt.dailyRoom)
            : isNull(practiceAppointments.dailyRoom),
          currentPracticeActor(pro.id, pro.userId),
          sql`EXISTS (SELECT 1 FROM practice_patients patient WHERE patient.id=${practiceAppointments.patientId} AND patient.professional_id=${pro.id})`,
          status.data === "completed"
            ? sql`${practiceAppointments.startsAt} <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`
            : undefined,
        ),
      )
      .returning({ id: practiceAppointments.id }),
    audit(pro, `appointment_${status.data}`, id),
  ]);
  if (!changed.length)
    return invalid(
      "La sesión o tu consulta cambió mientras guardabas. Actualiza la página.",
    );
  refresh();
  return { ok: true, message: "Estado de sesión actualizado." };
}
export async function saveReceipt(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const patient = await ownedPatient(
    String(form.get("patientId") || ""),
    pro.id,
  );
  if (!patient || patient.program === "earthquake")
    return invalid("La ayuda por el terremoto no permite cobros.");
  const parsed = z
    .object({
      amount: z.string().regex(/^\d{1,6}([.,]\d{1,2})?$/),
      currency: z.enum(["usd", "eur", "ves"]),
      method: z.enum(paymentMethods),
      reference: z.string().trim().min(3).max(80),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success || moneyCents(parsed.data.amount) <= 0)
    return invalid(
      "Indica importe, moneda, método y referencia del pago externo.",
    );
  const settings = await db.query.practiceSettings.findFirst({
    where: eq(practiceSettings.professionalId, pro.id),
  });
  const receiptZone = settings?.timeZone || "America/Caracas";
  if (form.get("receivedTimeZone") !== receiptZone)
    return invalid(
      "La zona horaria de tu consulta cambió. Actualiza la página y revisa la fecha del pago antes de guardarlo.",
    );
  const receivedAt = receiptReceivedAt(
    String(form.get("receivedAt") || ""),
    receiptZone,
    Date.now(),
  );
  if (!receivedAt.ok) return invalid(receivedAt.message);
  const id = newId("receipt");
  try {
    const [saved] = await db.batch([
      db
        .insert(practiceReceipts)
        .select(
          db
            .select({
              id: sql<string>`${id}`.as("id"),
              professionalId: professionals.id,
              patientId: practicePatients.id,
              amountCents: sql<number>`${moneyCents(parsed.data.amount)}`.as(
                "amount_cents",
              ),
              currency: sql<string>`${parsed.data.currency}`.as("currency"),
              method: sql<string>`${parsed.data.method}`.as("method"),
              reference:
                sql<string>`${`${pro.id}:${parsed.data.reference}`}`.as(
                  "reference",
                ),
              receivedAt: sql<string>`${receivedAt.iso}`.as("received_at"),
            })
            .from(practicePatients)
            .innerJoin(
              professionals,
              eq(professionals.id, practicePatients.professionalId),
            )
            .where(
              and(
                eq(practicePatients.id, patient.id),
                eq(practicePatients.professionalId, pro.id),
                eq(practicePatients.program, "general"),
                eq(professionals.status, "approved"),
                eq(professionals.nonClinicalHelper, false),
                currentPracticeActor(pro.id, pro.userId),
                sql`coalesce((SELECT time_zone FROM practice_settings WHERE professional_id=${pro.id}),'America/Caracas')=${receiptZone}`,
              ),
            ),
        )
        .returning({ id: practiceReceipts.id }),
      db.insert(auditLogs).select(
        db
          .select({
            id: sql<string>`${newId("log")}`.as("id"),
            actorEmail: sql<string>`${pro.email}`.as("actor_email"),
            action: sql<string>`'external_receipt_confirmed'`.as("action"),
            entityType: sql<string>`'practice'`.as("entity_type"),
            entityId: practiceReceipts.id,
            metadata: sql<null>`NULL`.as("metadata"),
            createdAt: sql<string>`${nowIso()}`.as("created_at"),
          })
          .from(practiceReceipts)
          .where(
            and(
              eq(practiceReceipts.id, id),
              eq(practiceReceipts.professionalId, pro.id),
              eq(practiceReceipts.patientId, patient.id),
            ),
          ),
      ),
    ]);
    if (!saved.length)
      return invalid(
        "El paciente o tu consulta ya no permite registrar este cobro. Actualiza la página antes de continuar.",
      );
  } catch {
    return invalid(
      "No pudimos guardar el cobro. Revisa si esa referencia ya existe.",
    );
  }
  refresh();
  return {
    ok: true,
    message:
      "Pago externo registrado por ti. Nido no ha procesado ni verificado el movimiento.",
  };
}
export async function setPatientStatus(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const patient = await ownedPatient(
    String(form.get("patientId") || ""),
    pro.id,
  );
  const state = z.enum(patientStates).safeParse(form.get("status"));
  if (!patient || !state.success) return invalid();
  if (state.data === patient.status)
    return invalid("La ficha ya tiene este estado.");
  const [changed] = await db.batch([
    db
      .update(practicePatients)
      .set({
        status: state.data,
        updatedAt: nextPracticeTimestamp(patient.updatedAt),
      })
      .where(
        and(
          eq(practicePatients.id, patient.id),
          eq(practicePatients.professionalId, pro.id),
          eq(practicePatients.updatedAt, patient.updatedAt),
          eq(practicePatients.status, patient.status),
          currentPracticeActor(pro.id, pro.userId),
        ),
      )
      .returning({ id: practicePatients.id }),
    audit(pro, `patient_${state.data}`, patient.id),
  ]);
  if (!changed.length)
    return invalid(
      "La ficha o tu consulta cambió mientras guardabas. Actualiza la página.",
    );
  refresh();
  return {
    ok: true,
    message:
      "Seguimiento actualizado. Cerrar la ficha conserva el chat y las citas; libera su cupo con el botón del chat si corresponde.",
  };
}
export async function releaseConversationQuota(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const id = String(form.get("conversationId") || "");
  const timestamp = nowIso();
  const results = await db.batch([
    db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - (SELECT count(*) FROM conversations c
        WHERE c.id=${id} AND c.professional_id=${pro.id} AND c.status='open' AND c.quota_released_at IS NULL
          AND c.deleted_at IS NULL AND c.anonymized_at IS NULL AND (c.help_request_id IS NULL OR EXISTS
            (SELECT 1 FROM assignments a WHERE a.help_request_id=c.help_request_id AND a.professional_id=${pro.id} AND a.status IN ('assigned','accepted')))))`,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(professionals.id, pro.id),
          currentPracticeActor(pro.id, pro.userId),
          sql`EXISTS(SELECT 1 FROM conversations c WHERE c.id=${id} AND c.professional_id=${pro.id} AND c.status='open'
        AND c.quota_released_at IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL)`,
        ),
      ),
    db
      .update(conversations)
      .set({ quotaReleasedAt: new Date(), updatedAt: timestamp })
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.professionalId, pro.id),
          eq(conversations.status, "open"),
          isNull(conversations.quotaReleasedAt),
          isNull(conversations.deletedAt),
          isNull(conversations.anonymizedAt),
          sql`changes()=1`,
        ),
      )
      .returning({ id: conversations.id }),
    audit(pro, "conversation_quota_released", id),
    db
      .update(assignments)
      .set({ status: "closed", updatedAt: timestamp })
      .where(
        and(
          eq(assignments.professionalId, pro.id),
          sql`changes()=1`,
          sql`${assignments.helpRequestId}=(SELECT help_request_id FROM conversations WHERE id=${id} AND professional_id=${pro.id})`,
          sql`${assignments.status} IN ('assigned','accepted')`,
        ),
      ),
  ]);
  if (!results[1].length) {
    // Repetir una liberación propia ya confirmada es seguro; un id ajeno o una
    // cuenta que cambió no equivalen a un cupo liberado.
    const released =
      await db.all(sql`SELECT c.id FROM conversations c WHERE c.id=${id} AND c.professional_id=${pro.id}
      AND c.status='open' AND c.quota_released_at IS NOT NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL
      AND ${currentPracticeActor(pro.id, pro.userId)}`);
    if (!released.length)
      return invalid(
        "El chat o tu acceso ya cambió. Actualiza la página antes de liberar el cupo.",
      );
  }
  refresh();
  return {
    ok: true,
    message: "Cupo liberado. El chat sigue disponible para ambos.",
  };
}
export async function toggleService(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const id = String(form.get("serviceId") || "");
  const active = form.get("active") === "1";
  const [changed] = await db.batch([
    db
      .update(practiceServices)
      .set({ active })
      .where(
        and(
          eq(practiceServices.id, id),
          eq(practiceServices.professionalId, pro.id),
          eq(practiceServices.active, !active),
          currentPracticeActor(pro.id, pro.userId),
        ),
      )
      .returning({ id: practiceServices.id }),
    audit(pro, active ? "service_activated" : "service_paused", id),
  ]);
  if (!changed.length)
    return invalid(
      "El servicio o tu consulta cambió, o ya tenía este estado. Actualiza la página.",
    );
  revalidatePath("/pro/servicios");
  refresh();
  return {
    ok: true,
    message:
      form.get("active") === "1"
        ? "Servicio activado."
        : "Servicio pausado. Las citas y acuerdos existentes se conservan.",
  };
}

export async function linkPatientConversation(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const patient = await ownedPatient(
    String(form.get("patientId") || ""),
    pro.id,
  );
  if (!patient || patient.conversationId || form.get("confirmed") !== "on")
    return invalid(
      "Confirma a quién corresponde la conversación antes de vincularla.",
    );
  const chat = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, String(form.get("conversationId") || "")),
      eq(conversations.professionalId, pro.id),
      eq(conversations.status, "open"),
      isNull(conversations.deletedAt),
      isNull(conversations.anonymizedAt),
    ),
    columns: { id: true, helpRequestId: true },
  });
  if (!chat)
    return invalid("Esta conversación no está disponible en tu consulta.");
  if (Boolean(chat.helpRequestId) !== (patient.program === "earthquake"))
    return invalid(
      "La ayuda por el terremoto y las consultas habituales deben mantener fichas separadas.",
    );
  try {
    const results = await db.batch([
      db
        .update(practicePatients)
        .set({
          conversationId: chat.id,
          updatedAt: nextPracticeTimestamp(patient.updatedAt),
        })
        .where(
          and(
            eq(practicePatients.id, patient.id),
            eq(practicePatients.professionalId, pro.id),
            isNull(practicePatients.conversationId),
            eq(practicePatients.updatedAt, patient.updatedAt),
            sql`${practicePatients.status} != 'closed'`,
            currentPracticeActor(pro.id, pro.userId),
            sql`EXISTS(SELECT 1 FROM conversations c WHERE c.id=${chat.id} AND c.professional_id=${pro.id}
              AND c.status='open' AND c.deleted_at IS NULL AND c.anonymized_at IS NULL
              AND ((c.help_request_id IS NOT NULL AND ${practicePatients.program}='earthquake')
                OR (c.help_request_id IS NULL AND ${practicePatients.program}='general')))`,
          ),
        )
        .returning({ id: practicePatients.id }),
      audit(pro, "patient_chat_linked", patient.id),
    ]);
    if (!results[0].length)
      return invalid("La ficha ya cambió. Actualiza la página.");
  } catch {
    return invalid(
      "Este chat ya está vinculado a otra ficha. Abre su ficha existente.",
    );
  }
  refresh();
  return {
    ok: true,
    message:
      "Chat vinculado. La persona puede acceder a sus sesiones y acuerdos desde esta conversación.",
  };
}

export async function rescheduleAppointment(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const id = String(form.get("appointmentId") || "");
  const appt = await db.query.practiceAppointments.findFirst({
    where: and(
      eq(practiceAppointments.id, id),
      eq(practiceAppointments.professionalId, pro.id),
      eq(practiceAppointments.status, "scheduled"),
    ),
  });
  if (!appt) return invalid("La sesión ya cambió de estado.");
  const startsAt = localToUtc(
    String(form.get("startsAt") || ""),
    appt.timeZone,
  );
  if (!startsAt || Date.parse(startsAt) <= Date.now())
    return invalid("Elige una fecha futura que no sea ambigua.");
  const duration = Date.parse(appt.endsAt) - Date.parse(appt.startsAt);
  if (appt.dailyRoom) {
    try {
      const { dailyRequest } = await import("@/lib/practice/calls");
      await dailyRequest(`/rooms/${appt.dailyRoom}`, undefined, "DELETE");
    } catch {
      return invalid(
        "No pudimos detener la llamada anterior. Reintenta antes de cambiar la fecha.",
      );
    }
  }
  try {
    const [changed] = await db.batch([
      db
        .update(practiceAppointments)
        .set({
          startsAt,
          endsAt: new Date(Date.parse(startsAt) + duration).toISOString(),
          dailyRoom: null,
          updatedAt: nextPracticeTimestamp(appt.updatedAt),
        })
        .where(
          and(
            eq(practiceAppointments.id, id),
            eq(practiceAppointments.professionalId, pro.id),
            eq(practiceAppointments.patientId, appt.patientId),
            sql`${practiceAppointments.serviceId} IS ${appt.serviceId}`,
            sql`${practiceAppointments.careCycleId} IS ${appt.careCycleId}`,
            eq(practiceAppointments.status, "scheduled"),
            eq(practiceAppointments.updatedAt, appt.updatedAt),
            eq(practiceAppointments.startsAt, appt.startsAt),
            eq(practiceAppointments.endsAt, appt.endsAt),
            appt.dailyRoom
              ? eq(practiceAppointments.dailyRoom, appt.dailyRoom)
              : isNull(practiceAppointments.dailyRoom),
            currentPracticeActor(pro.id, pro.userId),
            sql`EXISTS (SELECT 1 FROM practice_patients patient WHERE patient.id=${practiceAppointments.patientId} AND patient.professional_id=${pro.id} AND patient.status != 'closed')`,
            sql`${startsAt} > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
          ),
        )
        .returning({ id: practiceAppointments.id }),
      audit(pro, "appointment_rescheduled", id),
    ]);
    if (!changed.length)
      return invalid(
        "La sesión, la ficha o tu consulta cambió mientras guardabas. Actualiza la página.",
      );
  } catch {
    return invalid(
      "La nueva hora coincide con otra sesión o está fuera de la vigencia del ciclo.",
    );
  }
  refresh();
  return {
    ok: true,
    message:
      "Sesión reprogramada. Acuerda el nuevo horario con el paciente en el chat.",
  };
}

export async function updatePatientContact(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const patient = await ownedPatient(
    String(form.get("patientId") || ""),
    pro.id,
  );
  if (!patient) return invalid("No encontramos esta ficha en tu consulta.");
  const parsed = patientSchema.safeParse({
    ...Object.fromEntries(form),
    program: patient.program,
  });
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const [changed] = await db.batch([
    db
      .update(practicePatients)
      .set({
        name: parsed.data.name,
        email: parsed.data.email,
        country: parsed.data.country,
        timeZone: parsed.data.timeZone,
        updatedAt: nextPracticeTimestamp(patient.updatedAt),
      })
      .where(
        and(
          eq(practicePatients.id, patient.id),
          eq(practicePatients.professionalId, pro.id),
          eq(practicePatients.updatedAt, patient.updatedAt),
          eq(practicePatients.program, patient.program),
          currentPracticeActor(pro.id, pro.userId),
          sql`(${practicePatients.name} IS NOT ${parsed.data.name} OR ${practicePatients.email} IS NOT ${parsed.data.email} OR ${practicePatients.country} IS NOT ${parsed.data.country} OR ${practicePatients.timeZone} IS NOT ${parsed.data.timeZone})`,
        ),
      )
      .returning({ id: practicePatients.id }),
    audit(pro, "patient_contact_updated", patient.id),
  ]);
  if (!changed.length)
    return invalid(
      "La ficha o tu consulta cambió, o estos datos ya estaban guardados. Actualiza la página.",
    );
  refresh();
  return { ok: true, message: "Datos de contacto actualizados." };
}
