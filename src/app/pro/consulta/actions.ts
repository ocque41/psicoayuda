"use server";
import { and, eq, isNull, sql } from "drizzle-orm";
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
  practicePatients,
  practiceReceipts,
  practiceServices,
  practiceSettings,
  professionals,
} from "@/db/schema";
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
function audit(pro: { email: string }, action: string, entityId: string) {
  return db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: pro.email,
    action,
    entityType: "practice",
    entityId,
    createdAt: nowIso(),
  });
}

export async function createPatient(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const parsed = patientSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const conversationId = String(form.get("conversationId") || "");
  let program = parsed.data.program;
  if (conversationId) {
    const chat = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.professionalId, pro.id),
        isNull(conversations.deletedAt),
      ),
    });
    if (!chat) return invalid("Esta conversación no está disponible.");
    // El formulario de ayuda existente pertenece al programa del terremoto.
    if (chat.helpRequestId) program = "earthquake";
  }
  const id = newId("patient");
  const timestamp = nowIso();
  try {
    await db.batch([
      db.insert(practicePatients).values({
        id,
        professionalId: pro.id,
        conversationId: conversationId || null,
        name: parsed.data.name,
        email: parsed.data.email,
        country: parsed.data.country,
        timeZone: parsed.data.timeZone,
        program,
        consentAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      audit(pro, "patient_created", id),
    ]);
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
  await db.batch([
    db.insert(practiceServices).values({
      ...data,
      priceCents: moneyCents(price),
      id,
      professionalId: pro.id,
      createdAt: nowIso(),
    }),
    audit(pro, "service_created", id),
  ]);
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
  await db
    .insert(practiceSettings)
    .values({ ...parsed.data, professionalId: pro.id, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: practiceSettings.professionalId,
      set: { ...parsed.data, updatedAt: nowIso() },
    });
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
    await db.batch([
      db.insert(practiceAppointments).values({
        id,
        professionalId: pro.id,
        patientId,
        careCycleId: careCycleId || null,
        serviceId: service.id,
        startsAt,
        endsAt,
        timeZone,
        modality,
        priceCents:
          patient.program === "earthquake"
            ? 0
            : Math.round(service.priceCents / service.sessionsCount),
        currency: service.currency,
        cancellationHours: service.cancellationHours,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      audit(pro, "appointment_scheduled", id),
    ]);
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
  if (status.data === "completed" && Date.parse(appt.startsAt) > Date.now())
    return invalid("La sesión todavía no ha comenzado.");
  if (appt.dailyRoom && status.data !== "scheduled") {
    try {
      const { dailyRequest } = await import("@/lib/practice/calls");
      await dailyRequest(`/rooms/${appt.dailyRoom}`, undefined, "DELETE");
    } catch {
      return invalid(
        "No pudimos detener la llamada. Reintenta antes de cerrar la sesión.",
      );
    }
  }
  await db.batch([
    db
      .update(practiceAppointments)
      .set({ status: status.data, updatedAt: nowIso() })
      .where(
        and(
          eq(practiceAppointments.id, id),
          eq(practiceAppointments.professionalId, pro.id),
          eq(practiceAppointments.status, "scheduled"),
        ),
      ),
    audit(pro, `appointment_${status.data}`, id),
  ]);
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
  await db.batch([
    db
      .update(practicePatients)
      .set({ status: state.data, updatedAt: nowIso() })
      .where(
        and(
          eq(practicePatients.id, patient.id),
          eq(practicePatients.professionalId, pro.id),
        ),
      ),
    audit(pro, `patient_${state.data}`, patient.id),
  ]);
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
  // Idempotencia y contador en el mismo batch; el decremento se calcula ANTES de marcar.
  await db.batch([
    db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - (SELECT count(*) FROM conversations WHERE id = ${id} AND professional_id = ${pro.id} AND status = 'open' AND quota_released_at IS NULL AND deleted_at IS NULL AND (help_request_id IS NULL OR EXISTS (SELECT 1 FROM assignments WHERE help_request_id = conversations.help_request_id AND professional_id = ${pro.id} AND status IN ('assigned', 'accepted')))))`,
        updatedAt: nowIso(),
      })
      .where(eq(professionals.id, pro.id)),
    db
      .update(assignments)
      .set({ status: "closed", updatedAt: nowIso() })
      .where(
        and(
          eq(assignments.professionalId, pro.id),
          sql`${assignments.helpRequestId} = (SELECT help_request_id FROM conversations WHERE id = ${id} AND professional_id = ${pro.id} AND quota_released_at IS NULL)`,
          sql`${assignments.status} IN ('assigned', 'accepted')`,
        ),
      ),
    db
      .update(conversations)
      .set({ quotaReleasedAt: new Date(), updatedAt: nowIso() })
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.professionalId, pro.id),
          eq(conversations.status, "open"),
          isNull(conversations.quotaReleasedAt),
          isNull(conversations.deletedAt),
        ),
      ),
    audit(pro, "conversation_quota_released", id),
  ]);
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
  await db
    .update(practiceServices)
    .set({ active: form.get("active") === "1" })
    .where(
      and(
        eq(practiceServices.id, String(form.get("serviceId") || "")),
        eq(practiceServices.professionalId, pro.id),
      ),
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
        .set({ conversationId: chat.id, updatedAt: nowIso() })
        .where(
          and(
            eq(practicePatients.id, patient.id),
            eq(practicePatients.professionalId, pro.id),
            isNull(practicePatients.conversationId),
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
    await db.batch([
      db
        .update(practiceAppointments)
        .set({
          startsAt,
          endsAt: new Date(Date.parse(startsAt) + duration).toISOString(),
          dailyRoom: null,
          updatedAt: nowIso(),
        })
        .where(
          and(
            eq(practiceAppointments.id, id),
            eq(practiceAppointments.professionalId, pro.id),
            eq(practiceAppointments.status, "scheduled"),
          ),
        ),
      audit(pro, "appointment_rescheduled", id),
    ]);
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
  await db.batch([
    db
      .update(practicePatients)
      .set({
        name: parsed.data.name,
        email: parsed.data.email,
        country: parsed.data.country,
        timeZone: parsed.data.timeZone,
        updatedAt: nowIso(),
      })
      .where(
        and(
          eq(practicePatients.id, patient.id),
          eq(practicePatients.professionalId, pro.id),
        ),
      ),
    audit(pro, "patient_contact_updated", patient.id),
  ]);
  refresh();
  return { ok: true, message: "Datos de contacto actualizados." };
}
