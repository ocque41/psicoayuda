import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PushRevocationPanel } from "@/components/push/push-revocation-panel";
import { getServerSession } from "@/lib/auth-server";
import { authorizedPushAccount } from "@/lib/push/preferences";

export const metadata: Metadata = {
  title: "Retirar mis avisos",
  robots: { index: false, follow: false },
};
export default async function PushManagementPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
} = {}) {
  const role =
    (await searchParams)?.role === "patient" ? "patient" : "professional";
  const session = await getServerSession();
  if (
    !session?.user.emailVerified ||
    !session.session.id ||
    !(await authorizedPushAccount({
      userId: session.user.id,
      sessionId: session.session.id,
      role,
    }))
  )
    redirect("/entrar");
  return (
    <main className="section">
      <div className="container practice-shell">
        <h1>Tus avisos</h1>
        <PushRevocationPanel audience={role} />
        <Link href={role === "patient" ? "/mi" : "/pro"}>
          Volver a mi cuenta
        </Link>
      </div>
    </main>
  );
}
