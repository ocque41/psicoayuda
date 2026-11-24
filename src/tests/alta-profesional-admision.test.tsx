import { like } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { professionalScreenings, professionals, user } from "@/db/schema";
import { SCREENING_VERSION } from "@/lib/screening/questions";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import ProDashboard from "@/app/pro/dashboard/page";
import { RegistroPasos } from "@/components/registro-pasos";

const prefix = "test-alta-admision-";
const createdAt = "2026-11-24T12:00:00.000Z";
const candidate = {
  userId: `${prefix}user`,
  professionalId: `${prefix}pro`,
  email: `${prefix}candidata@example.test`,
};

async function cleanup() {
  await db
    .delete(professionalScreenings)
    .where(like(professionalScreenings.professionalId, `${prefix}%`));
  await db.delete(professionals).where(like(professionals.id, `${prefix}%`));
  await db.delete(user).where(like(user.id, `${prefix}%`));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    id: candidate.userId,
    name: "Candidata ficticia",
    email: candidate.email,
    emailVerified: true,
  });
  // Lo mismo que deja el formulario de alta: un perfil clínico pendiente.
  await db.insert(professionals).values({
    id: candidate.professionalId,
    userId: candidate.userId,
    email: candidate.email,
    fullName: "Candidata ficticia",
    languages: '["es"]',
    supportAreas: "[]",
    status: "pending_verification",
    nonClinicalHelper: false,
    conductAcceptedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  });
  mocks.session.mockResolvedValue({
    user: {
      id: candidate.userId,
      email: candidate.email,
      emailVerified: true,
      name: "Candidata ficticia",
    },
    session: { id: `${prefix}session` },
  });
});
afterAll(cleanup);

const dashboard = () => ProDashboard({ searchParams: Promise.resolve({}) });

describe("alta profesional: formulario de perfil y cuestionario de admisión", () => {
  it("el acceso anuncia los tres pasos, con el cuestionario como último", () => {
    const html = renderToStaticMarkup(<RegistroPasos actual={1} />);
    expect(html).toContain('aria-label="Paso 1 de 3"');
    expect(html).toContain("Crea tu cuenta");
    expect(html).toContain("Completa tu perfil");
    expect(html).toContain("Responde el cuestionario");
    expect(html.match(/Paso \d de 3/g)).toHaveLength(4);
  });

  it("tras enviar el perfil, una candidatura nueva va al cuestionario y no al panel profesional", async () => {
    await expect(dashboard()).rejects.toThrow("redirect:/pro/cuestionario");
  });

  it("con el cuestionario enviado espera la revisión sin herramientas de profesional aprobado", async () => {
    await db.insert(professionalScreenings).values({
      professionalId: candidate.professionalId,
      version: SCREENING_VERSION,
      answersJson: "{}",
      flagsJson: "[]",
      exclusions: "",
      score: 0,
      maxScore: 0,
      submittedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
    const html = renderToStaticMarkup(await dashboard());
    expect(html).toContain("Actualizar mi información");
    expect(html).not.toContain("Solicitudes para ti");
    expect(html).not.toContain("Tu disponibilidad");
    expect(html).not.toContain("Añadir método de pago");
  });
});
