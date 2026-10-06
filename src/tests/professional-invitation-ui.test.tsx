import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  adminNavigation,
  admissionNavigation,
  paolaPreviewNavigation,
} from "@/components/admin/navigation";
import {
  ProfessionalInvitationPanel,
  type ProfessionalInvitationPanelProps,
} from "@/components/professional-invitation-panel";
import { WorkspaceNav } from "@/components/workspace/nav";
import { MEMBERSHIP_PLAN, TRIAL_DAYS } from "@/lib/practice/membership-plan";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pro/invitaciones",
  useSearchParams: () => new URLSearchParams(),
}));

const registrationUrl = "https://ejemplo.test/pro?modo=registro";
const message = `Prueba Nido.\nCrea tu cuenta: ${registrationUrl}`;
const props: ProfessionalInvitationPanelProps = {
  registrationUrl,
  message,
  whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}`,
  emailUrl: `mailto:?subject=Invitación&body=${encodeURIComponent(message)}`,
};

describe("preparación de invitaciones profesionales", () => {
  it("muestra el enlace y mensaje completos con campos etiquetados y seleccionables", () => {
    const html = renderToStaticMarkup(
      <ProfessionalInvitationPanel {...props} />,
    );
    expect(html).toContain('aria-label="Preparar una invitación"');
    expect(html).toMatch(
      /<label for="[^"]+-link">Enlace para crear una cuenta/,
    );
    expect(html).toMatch(/<input[^>]*readOnly=""[^>]*value=/);
    expect(html).toMatch(/<textarea[^>]*readOnly=""/);
    expect(html).toContain(registrationUrl);
    expect(html).toContain("Copiar enlace");
    expect(html).toContain("Copiar mensaje");
    expect(html).toContain('role="status" aria-atomic="true"');
  });

  it("conserva los destinos preparados y ofrece WhatsApp con protección de pestaña", () => {
    const html = renderToStaticMarkup(
      <ProfessionalInvitationPanel {...props} />,
    );
    expect(html).toContain(`href="${props.whatsappUrl}"`);
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("se abre en otra pestaña");
    expect(html).toContain(`href="${props.emailUrl.replaceAll("&", "&amp;")}"`);
    expect(html).not.toContain("<form");
  });

  it("usa la oferta centralizada del software y escapa la vista del mensaje", () => {
    const html = renderToStaticMarkup(
      <ProfessionalInvitationPanel
        {...props}
        message={'Texto ficticio <script>alert("ficticio")</script>'}
      />,
    );
    expect(html).toContain(`${TRIAL_DAYS} días de prueba sin tarjeta`);
    expect(html).toContain(`${MEMBERSHIP_PLAN.priceLabel}/mes al contratar.`);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("19 USD");
    expect(html).not.toContain("99 USD");
  });
});

describe("invitaciones como ventana propia y permisos de navegación", () => {
  it("Paola conserva tres destinos propios y la vista de Paola no manda invitaciones al CRM", () => {
    expect(admissionNavigation.map(({ href }) => href)).toEqual([
      "/admin/admision",
      "/admin/invitaciones",
      "/pro/consulta",
    ]);
    expect(paolaPreviewNavigation.map(({ href }) => href)).toEqual([
      "/admin/admision?vista=paola",
      "/admin/invitaciones?vista=paola",
      "/admin/crm",
    ]);
    expect(adminNavigation.find(({ id }) => id === "invitaciones")?.href).toBe(
      "/admin/invitaciones",
    );
    expect(admissionNavigation.some(({ id }) => id === "cuentas")).toBe(false);
  });

  it("marca la ventana profesional, sin abrir la consulta ni añadirla a pacientes", () => {
    const professional = renderToStaticMarkup(
      <WorkspaceNav audience="professional" />,
    );
    expect(professional).toMatch(
      /<a(?=[^>]*href="\/pro\/invitaciones")(?=[^>]*aria-current="page")[^>]*>/,
    );
    expect(professional).toContain("Invitar colegas");
    const patient = renderToStaticMarkup(<WorkspaceNav audience="patient" />);
    expect(patient).not.toContain("Invitar colegas");
    expect(patient).not.toContain("/pro/invitaciones");
  });

  it("la revisión del CRM no convierte invitaciones en otra copia de Agenda", () => {
    const review = renderToStaticMarkup(
      <WorkspaceNav audience="professional" adminReview />,
    );
    expect(review).not.toContain("/pro/invitaciones");
    expect(review).not.toContain("Invitar colegas");
    expect(review.match(/href="\/admin\/crm\?ventana=agenda"/g)).toHaveLength(
      1,
    );
  });
});
