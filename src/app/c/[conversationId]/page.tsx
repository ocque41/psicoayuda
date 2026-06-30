import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuickExit } from "@/components/quick-exit";
import { loadChatView } from "@/lib/chat-view";
import { ChatRoom } from "./chat-room";

export const metadata: Metadata = {
  title: "Conversación segura",
  // Nunca indexar una conversación privada.
  robots: { index: false, follow: false },
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const view = await loadChatView(conversationId);
  if (!view) notFound();

  return (
    <section className="section">
      <div className="container">
        {view.role === "seeker" ? <QuickExit /> : null}
        <ChatRoom
          conversationId={view.conversationId}
          role={view.role}
          otherName={view.otherName}
          open={view.open}
        />
      </div>
    </section>
  );
}
