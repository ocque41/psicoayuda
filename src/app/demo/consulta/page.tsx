import type { Metadata } from "next";
import { getServerSession } from "@/lib/auth-server";
import { PracticeEntry } from "./practice-entry";

export const metadata: Metadata = {
  title: "Entra a tu consulta · Nido",
  description:
    "Entra en tu cuenta para organizar tu agenda, fichas y conversaciones reales.",
  robots: { index: false, follow: false },
};
export default async function PracticeEntryPage() {
  const session = await getServerSession();
  return (
    <PracticeEntry
      signedIn={Boolean(session?.user.id)}
      googleEnabled={Boolean(
        process.env.GOOGLE_CLIENT_ID?.trim() &&
          process.env.GOOGLE_CLIENT_SECRET?.trim(),
      )}
    />
  );
}
