import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProChatList } from "@/components/pro-chat-list";
import { QuickExit } from "@/components/quick-exit";
import { conversationExists, loadChatView } from "@/lib/chat-view";
import { conversationsForProfessional } from "@/lib/offers";
import {
  formatEuros,
  listActivePackagesForProfessional,
} from "@/lib/payments/packages";
import { sortProChats, toProChatSummaries } from "@/lib/pro-chats";
import { getWaitlistSignupForConversation } from "@/lib/waitlist-store";
import { ChatRoom } from "./chat-room";
import { ConversationAccessPanel } from "./conversation-access-panel";
import { ConversationDeletedNotice } from "./conversation-deleted-notice";

export const metadata: Metadata = {
  title: "Conversación segura",
  // Nunca indexar una conversación privada.
  robots: { index: false, follow: false },
};

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ como?: string }>;
}) {
  const { conversationId } = await params;
  const { como } = await searchParams;
  // El profesional puede pedir la vista de la persona (`?como=persona`). Él
  // decide; nunca se adivina: la misma preferencia viaja al WebSocket para que
  // lo que escribe se registre con la identidad que está viendo.
  const view = await loadChatView(conversationId, como === "persona");
  if (!view) {
    // Sin credencial en ESTE navegador: si la conversación existe, no es un 404
    // (la página está, solo es privada) → pantalla de acceso con enlace mágico.
    if (!(await conversationExists(conversationId))) notFound();
    return (
      <section className="section">
        <div className="container">
          <ConversationAccessPanel />
        </div>
      </section>
    );
  }

  // Papelera: el hilo se borró pero se puede recuperar durante 7 días. No se
  // sirve contenido ni se monta la sala (el WebSocket también lo rechaza).
  if (view.deleted) {
    return (
      <section className="section">
        <div className="container">
          {view.role === "seeker" ? <QuickExit /> : null}
          <ConversationDeletedNotice
            conversationId={view.conversationId}
            purgeAfter={view.purgeAfter}
            asPersona={view.role === "seeker" && view.canSwitchView}
          />
        </div>
      </section>
    );
  }

  // El profesional puede insertar el link de pago de uno de sus paquetes en el
  // mensaje (el link queda atado a esta conversación). Solo si tiene paquetes.
  const paymentLinks =
    view.role === "professional" && view.professionalId
      ? (await listActivePackagesForProfessional(view.professionalId)).map(
          (pkg) => ({
            id: pkg.id,
            title: pkg.title,
            priceLabel: formatEuros(pkg.priceCents),
          }),
        )
      : [];

  // Anotación de lista de espera nacida de esta conversación (si existe): la
  // tarjeta del chat muestra "Anotado" a las dos partes en vez del formulario.
  const waitlistSignup = await getWaitlistSignupForConversation(
    view.conversationId,
  );

  // El profesional ve, junto a la sala, TODAS sus conversaciones con la
  // actividad al día: cambiar de persona es un toque, sin volver al panel.
  const proChats = view.professionalId
    ? sortProChats(
        toProChatSummaries(
          await conversationsForProfessional(view.professionalId),
        ),
      )
    : null;

  const room = (
    <>
      {view.role === "seeker" ? <QuickExit /> : null}
      <ChatRoom
        conversationId={view.conversationId}
        role={view.role}
        otherName={view.otherName}
        open={view.open}
        canSwitchView={view.canSwitchView}
        paymentLinks={paymentLinks}
        proPublicKey={view.proPublicKey}
        waitlistSignup={waitlistSignup}
      />
    </>
  );

  if (!proChats) {
    return (
      <section className="section">
        <div className="container">{room}</div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container panel-container">
        <div className="chat-shell">
          <ProChatList initial={proChats} activeId={view.conversationId} />
          <div className="chat-shell-main">{room}</div>
        </div>
      </div>
    </section>
  );
}
