import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PatientSessionBoundary } from "@/components/patient/session-boundary";
import { getServerSession } from "@/lib/auth-server";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tu espacio · Nido",
  robots: { index: false, follow: false },
};
export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session?.user.id) redirect("/entrar");
  return (
    <PatientSessionBoundary key={session.user.id} ownerId={session.user.id}>
      {children}
    </PatientSessionBoundary>
  );
}
