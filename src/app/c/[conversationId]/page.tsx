import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuickExit } from "@/components/quick-exit";
import { loadChatView } from "@/lib/chat-view";
import {
  formatEuros,
  listActivePackagesForProfessional,
} from "@/lib/payments/packages";
import { ChatRoom } from "./chat-room";
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
  if (!view) notFound();

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

  return (
    <section className="section">
      <div className="container">
        {view.role === "seeker" ? <QuickExit /> : null}
        <ChatRoom
          conversationId={view.conversationId}
          role={view.role}
          otherName={view.otherName}
          open={view.open}
          canSwitchView={view.canSwitchView}
          paymentLinks={paymentLinks}
          proPublicKey={view.proPublicKey}
        />
      </div>
    </section>
  );
}
