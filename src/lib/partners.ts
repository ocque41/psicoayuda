import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { partners } from "@/db/schema";
import { toIntlNumber } from "@/lib/phone";
import { withUtm } from "@/lib/utm";

/**
 * Organizaciones ALIADAS verificadas de Nido (carrusel de la portada + escaparate
 * de /alianzas). Viven en D1 (`partners`) y las gestiona el equipo desde /admin:
 * crear, editar, cambiar el logo, reordenar u ocultar. Antes eran una constante
 * en código; se movieron a BD cuando pasaron a ser varias y las mantiene el equipo.
 *
 * IMPORTANTE: solo se publican organizaciones verificadas. Teléfonos, logo y datos
 * se toman de la fuente oficial de cada aliado.
 */

export type PartnerContactType =
  | "whatsapp"
  | "phone"
  | "instagram"
  | "website"
  | "email";

export type PartnerContact = {
  /** Etiqueta opcional (ej. el nombre de la psicóloga de esa línea). */
  label?: string;
  type: PartnerContactType;
  /** Valor libre: teléfono, @usuario, URL o correo. */
  value: string;
};

export type Partner = {
  id: string;
  name: string;
  specialty: string;
  description: string;
  /** URL, data URL o ruta local; "" si no hay (el carrusel muestra el nombre). */
  logo: string;
  contacts: PartnerContact[];
  status: "published" | "hidden";
  sortOrder: number;
};

type PartnerRow = typeof partners.$inferSelect;

function parseContacts(raw: string | null | undefined): PartnerContact[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: PartnerContactType[] = [
      "whatsapp",
      "phone",
      "instagram",
      "website",
      "email",
    ];
    return parsed.flatMap((item): PartnerContact[] => {
      if (!item || typeof item !== "object") return [];
      const { label, type, value } = item as Record<string, unknown>;
      if (typeof value !== "string" || !value.trim()) return [];
      if (!valid.includes(type as PartnerContactType)) return [];
      return [
        {
          label: typeof label === "string" && label.trim() ? label : undefined,
          type: type as PartnerContactType,
          value,
        },
      ];
    });
  } catch {
    return [];
  }
}

function toPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty ?? "",
    description: row.description ?? "",
    logo: row.logo ?? "",
    contacts: parseContacts(row.contacts),
    status: row.status === "hidden" ? "hidden" : "published",
    sortOrder: row.sortOrder,
  };
}

/** Aliados visibles en la web (published), ordenados. Tolera la ausencia de BD. */
export async function getPublishedPartners(): Promise<Partner[]> {
  try {
    const rows = await db
      .select()
      .from(partners)
      .where(eq(partners.status, "published"))
      .orderBy(asc(partners.sortOrder), asc(partners.createdAt));
    return rows.map(toPartner);
  } catch {
    // En build/prerender la BD D1 no existe (igual que el feed de profesionales):
    // devolvemos vacío y la lista se rellena en runtime.
    return [];
  }
}

/** Todos los aliados (cualquier estado) para el panel /admin, ordenados. */
export async function getAllPartnersForAdmin(): Promise<Partner[]> {
  const rows = await db
    .select()
    .from(partners)
    .orderBy(asc(partners.sortOrder), asc(partners.createdAt));
  return rows.map(toPartner);
}

/** Enlace directo de una vía de contacto (wa.me / tel: / instagram / web / mailto). */
export function partnerContactHref(contact: PartnerContact): string | null {
  const value = contact.value.trim();
  const utm = { campaign: "aliados", content: "partner-contact" } as const;
  switch (contact.type) {
    case "whatsapp": {
      const intl = toIntlNumber(value);
      return intl
        ? withUtm(`https://wa.me/${intl}`, { ...utm, medium: "whatsapp" })
        : null;
    }
    case "phone": {
      const intl = toIntlNumber(value);
      return intl ? `tel:+${intl}` : `tel:${value.replace(/\s+/g, "")}`;
    }
    case "instagram":
      return withUtm(`https://instagram.com/${value.replace(/^@/, "")}`, utm);
    case "website":
      return withUtm(
        /^https?:\/\//i.test(value) ? value : `https://${value}`,
        utm,
      );
    case "email":
      return `mailto:${value}`;
    default:
      return null;
  }
}

const CONTACT_ACTION: Record<PartnerContactType, string> = {
  whatsapp: "Escribir por WhatsApp",
  phone: "Llamar",
  instagram: "Ver en Instagram",
  website: "Visitar su web",
  email: "Escribir un correo",
};

/** Texto legible de una vía de contacto para mostrar en un botón/enlace. */
export function partnerContactText(contact: PartnerContact): string {
  const action = CONTACT_ACTION[contact.type];
  const detail =
    contact.type === "instagram"
      ? `@${contact.value.replace(/^@/, "")}`
      : contact.value;
  const base = `${action} · ${detail}`;
  return contact.label ? `${contact.label} — ${base}` : base;
}

/** ¿El enlace sale del sitio? (para decidir target/rel en los componentes). */
export function isExternalHref(href: string): boolean {
  return /^(https?:|tel:|mailto:)/i.test(href);
}

/**
 * Destino del clic en el carrusel: si el aliado tiene UNA sola vía, va directo a
 * ella; si tiene varias (o ninguna directa), lleva a su ficha en /alianzas donde
 * están todas.
 */
export function partnerCarouselHref(partner: Partner): string {
  const [primary] = partner.contacts;
  if (partner.contacts.length === 1 && primary) {
    return partnerContactHref(primary) ?? `/alianzas#${partner.id}`;
  }
  return `/alianzas#${partner.id}`;
}
