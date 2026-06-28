"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, helpRequests, professionals } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { assignRequestToProfessional } from "@/lib/assignment";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";
import {
  notifyAdminHelpRequest,
  notifyProfessionalAssignment,
} from "@/lib/notifications";
import {
  helpRequestSchema,
  professionalSchema,
  professionalStatusSchema,
  statusSchema,
} from "@/lib/validation";

function formEntries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function createHelpRequest(
  _prevState: unknown,
  formData: FormData,
) {
  const parsed = helpRequestSchema.safeParse(formEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Error" };
  }

  const timestamp = nowIso();
  const id = newId("req");
  await db.insert(helpRequests).values({
    id,
    email: parsed.data.email,
    language: parsed.data.language,
    country: parsed.data.country || "Venezuela",
    state: parsed.data.state,
    city: parsed.data.city,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    locationConsent: parsed.data.locationConsent,
    needCategory: parsed.data.needCategory,
    urgency: parsed.data.urgency,
    consentContact: parsed.data.consentContact,
    status: "new",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await notifyAdminHelpRequest(id);
  redirect(`/ayuda/gracias?solicitud=${id}`);
}

export async function saveProfessionalOnboarding(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getServerSession();
  if (!session?.user?.id || !session.user.email) {
    redirect("/pro");
  }

  const raw = formEntries(formData);
  const parsed = professionalSchema.safeParse({
    ...raw,
    languages: formData.getAll("languages"),
    supportAreas: formData.getAll("supportAreas"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Error" };
  }

  const timestamp = nowIso();
  const existing = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });

  const values = {
    userId: session.user.id,
    email: session.user.email,
    fullName: parsed.data.fullName,
    displayName: parsed.data.displayName,
    country: parsed.data.country,
    city: parsed.data.city,
    licenseNumber: parsed.data.licenseNumber,
    licenseCountry: parsed.data.licenseCountry,
    languages: JSON.stringify(parsed.data.languages),
    supportAreas: JSON.stringify(parsed.data.supportAreas),
    remoteAvailable: parsed.data.remoteAvailable,
    crisisExperience: parsed.data.crisisExperience,
    contactEmail: parsed.data.contactEmail || session.user.email,
    contactNotes: parsed.data.contactNotes,
    shortBio: parsed.data.shortBio,
    acceptingRequests: parsed.data.acceptingRequests,
    maxActiveRequests: parsed.data.maxActiveRequests,
    updatedAt: timestamp,
  };

  if (existing) {
    await db
      .update(professionals)
      .set({ ...values, status: "pending_verification" })
      .where(eq(professionals.id, existing.id));
  } else {
    await db.insert(professionals).values({
      ...values,
      id: newId("pro"),
      status: "pending_verification",
      currentActiveRequests: 0,
      createdAt: timestamp,
    });
  }

  redirect("/pro/dashboard");
}

export async function updateProfessionalAvailability(formData: FormData) {
  const session = await getServerSession();
  if (!session?.user?.id) redirect("/pro");

  await db
    .update(professionals)
    .set({
      acceptingRequests: formData.get("acceptingRequests") === "on",
      updatedAt: nowIso(),
    })
    .where(eq(professionals.userId, session.user.id));

  revalidatePath("/pro/dashboard");
}

export async function adminUpdateProfessionalStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const professionalId = String(formData.get("professionalId") ?? "");
  const status = professionalStatusSchema.parse(formData.get("status"));
  const timestamp = nowIso();

  await db
    .update(professionals)
    .set({ status, updatedAt: timestamp })
    .where(eq(professionals.id, professionalId));

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: `professional_${status}`,
    entityType: "professional",
    entityId: professionalId,
    createdAt: timestamp,
  });

  revalidatePath("/admin");
}

export async function adminUpdateHelpRequestStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const requestId = String(formData.get("requestId") ?? "");
  const status = statusSchema.parse(formData.get("status"));
  await db
    .update(helpRequests)
    .set({ status, updatedAt: nowIso() })
    .where(eq(helpRequests.id, requestId));

  revalidatePath("/admin");
}

export async function adminAssignRequest(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const helpRequestId = String(formData.get("helpRequestId") ?? "");
  const professionalId = String(formData.get("professionalId") ?? "");
  const result = await assignRequestToProfessional({
    helpRequestId,
    professionalId,
    actorEmail: admin.email,
  });

  if (result.ok) {
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
    });
    if (professional?.contactEmail) {
      await notifyProfessionalAssignment(professional.contactEmail);
    }
  }

  revalidatePath("/admin");
}

export async function adminExportCsv() {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");
}
