import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { professionals, sessionPackages } from "@/db/schema";
import {
  MAX_PACKAGE_PRICE_CENTS,
  MIN_PACKAGE_PRICE_CENTS,
  PACKAGE_CURRENCY,
} from "@/lib/payments/config";

export type SessionPackage = typeof sessionPackages.$inferSelect;

function eurosToCents(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/[€\s]/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// Paquete de sesiones configurado por el profesional. El precio se escribe en
// euros en el formulario y se guarda en céntimos (entero, sin decimales).
export const sessionPackageSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Ponle un título al paquete (mínimo 3 letras).")
    .max(80, "El título es demasiado largo (máximo 80 caracteres)."),
  description: z
    .string()
    .trim()
    .max(400, "La descripción es demasiado larga (máximo 400 caracteres).")
    .optional()
    .transform((value) => value || null),
  sessionsCount: z.coerce
    .number("Indica cuántas sesiones incluye el paquete.")
    .int("Las sesiones deben ser un número entero.")
    .min(1, "El paquete debe incluir al menos 1 sesión.")
    .max(50, "El máximo es 50 sesiones por paquete."),
  validityDays: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.coerce
      .number("La vigencia debe ser un número de días.")
      .int("La vigencia debe ser un número entero de días.")
      .min(1, "La vigencia mínima es 1 día.")
      .max(365, "La vigencia máxima es 365 días.")
      .nullable(),
  ),
  priceCents: z.preprocess(
    eurosToCents,
    z
      .number("Escribe el precio en euros, por ejemplo 25.")
      .int()
      .min(
        MIN_PACKAGE_PRICE_CENTS,
        `El precio mínimo es ${MIN_PACKAGE_PRICE_CENTS / 100} €.`,
      )
      .max(
        MAX_PACKAGE_PRICE_CENTS,
        `El precio máximo es ${MAX_PACKAGE_PRICE_CENTS / 100} €.`,
      ),
  ),
});

export type SessionPackageInput = z.infer<typeof sessionPackageSchema>;

export function formatEuros(cents: number): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} €`;
  }
}

/** Paquetes del profesional para su panel (incluye inactivos). */
export async function listPackagesForProfessional(
  professionalId: string,
): Promise<SessionPackage[]> {
  return db
    .select()
    .from(sessionPackages)
    .where(eq(sessionPackages.professionalId, professionalId))
    .orderBy(desc(sessionPackages.createdAt));
}

/** Paquetes activos (los que se pueden compartir/cobrar) de un profesional. */
export async function listActivePackagesForProfessional(
  professionalId: string,
): Promise<SessionPackage[]> {
  return db
    .select()
    .from(sessionPackages)
    .where(
      and(
        eq(sessionPackages.professionalId, professionalId),
        eq(sessionPackages.active, true),
      ),
    )
    .orderBy(desc(sessionPackages.createdAt));
}

export type PayablePackage = {
  pkg: SessionPackage;
  professional: {
    id: string;
    name: string;
    photo: string | null;
    country: string | null;
    city: string | null;
    stripeAccountId: string | null;
    stripeChargesEnabled: boolean;
  };
};

/**
 * Paquete listo para cobrar: activo, de un profesional aprobado que aceptó
 * servicios pagos y con su cuenta Connect habilitada para cargos. Devuelve null
 * si algo falla (la página pública muestra "no disponible").
 */
export async function getPayablePackage(
  packageId: string,
): Promise<PayablePackage | null> {
  const [row] = await db
    .select({
      // Selección PLANA (sin `pkg: sessionPackages`): mezclar una tabla anidada
      // con columnas planas del join confundía el mapeo y `professionals.id`
      // llegaba con el valor del id del paquete.
      packageId: sessionPackages.id,
      title: sessionPackages.title,
      description: sessionPackages.description,
      sessionsCount: sessionPackages.sessionsCount,
      validityDays: sessionPackages.validityDays,
      priceCents: sessionPackages.priceCents,
      currency: sessionPackages.currency,
      active: sessionPackages.active,
      packageCreatedAt: sessionPackages.createdAt,
      packageUpdatedAt: sessionPackages.updatedAt,
      professionalId: professionals.id,
      fullName: professionals.fullName,
      displayName: professionals.displayName,
      photo: professionals.photo,
      country: professionals.country,
      city: professionals.city,
      stripeAccountId: professionals.stripeAccountId,
      stripeChargesEnabled: professionals.stripeChargesEnabled,
    })
    .from(sessionPackages)
    .innerJoin(
      professionals,
      eq(sessionPackages.professionalId, professionals.id),
    )
    .where(
      and(
        eq(sessionPackages.id, packageId),
        eq(sessionPackages.active, true),
        eq(professionals.status, "approved"),
        eq(professionals.offersPaidServices, true),
        eq(professionals.stripeChargesEnabled, true),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    pkg: {
      id: row.packageId,
      professionalId: row.professionalId,
      title: row.title,
      description: row.description,
      sessionsCount: row.sessionsCount,
      validityDays: row.validityDays,
      priceCents: row.priceCents,
      currency: row.currency,
      active: row.active,
      createdAt: row.packageCreatedAt,
      updatedAt: row.packageUpdatedAt,
    },
    professional: {
      id: row.professionalId,
      name: row.displayName || row.fullName.split(" ")[0] || "Profesional",
      photo: row.photo,
      country: row.country,
      city: row.city,
      stripeAccountId: row.stripeAccountId,
      stripeChargesEnabled: row.stripeChargesEnabled,
    },
  };
}

export const PACKAGE_CURRENCY_CODE = PACKAGE_CURRENCY;
