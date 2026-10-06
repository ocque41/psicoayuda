import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FeedProfessional } from "@/lib/feed";

vi.mock("@/app/actions-chat", () => ({ createConversation: () => undefined }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/c/[conversationId]/actions", () => ({
  joinWaitlistFromChat: vi.fn(),
  ensureProInboxToken: vi.fn(),
}));

import { WaitlistPromptCard } from "@/app/c/[conversationId]/waitlist-prompt-card";
import { FeedProfessionalCard } from "@/app/profesionales/professional-card";
import { ProChatList } from "@/components/pro-chat-list";

const professional: FeedProfessional = {
  id: "fictional-pro",
  name: "Profesional ficticio",
  city: null,
  country: null,
  languages: ["es"],
  supportAreas: [],
  shortBio: null,
  photo: null,
  phone: "+584120000000",
  landline: null,
  email: "fictional@example.com",
  emailPublic: false,
  crisisExperience: false,
  nonClinicalHelper: false,
  offersPaidServices: false,
  inPersonAvailable: false,
  acceptingRequests: true,
  currentActiveRequests: 0,
  maxActiveRequests: 3,
};
describe("integración de UI de chat/lista", () => {
  it("el contacto en Nido está visible aunque exista teléfono; conserva medios y enlace general", () => {
    const html = renderToStaticMarkup(
      <FeedProfessionalCard professional={professional} />,
    );
    expect(html).toContain("Contactar ahora");
    expect(html).toContain("https://wa.me/");
    expect(html).not.toContain("Prefiero escribir por aquí");
    expect(html).toContain('href="/lista-de-espera"');
    expect(html).not.toContain("fictional@example.com");
  });
  it("la bandeja monta icono y cajón accesible sin depender del admin-shell", () => {
    const html = renderToStaticMarkup(
      <ProChatList
        initial={[]}
        activeId="fictional-chat"
        professionalId="fictional-pro"
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('inert=""');
    expect(html).toContain('aria-expanded="false"');
  });
  it("la tarjeta exige motivo general y no ofrece envío al profesional", () => {
    const person = renderToStaticMarkup(
      // biome-ignore lint/a11y/useValidAriaRole: role es la identidad del chat, no un atributo ARIA del DOM
      <WaitlistPromptCard
        conversationId="fictional-chat"
        role="seeker"
        asPersona={false}
        signup={null}
        onJoined={() => undefined}
      />,
    );
    expect(person).toContain('name="generalReason"');
    expect(person).toContain("ajeno al terremoto");
    const pro = renderToStaticMarkup(
      // biome-ignore lint/a11y/useValidAriaRole: role es la identidad del chat, no un atributo ARIA del DOM
      <WaitlistPromptCard
        conversationId="fictional-chat"
        role="professional"
        asPersona={false}
        signup={null}
        onJoined={() => undefined}
      />,
    );
    expect(pro).not.toContain("<form");
  });
});
