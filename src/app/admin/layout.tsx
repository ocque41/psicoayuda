import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PatientSessionBoundary } from "@/components/patient/session-boundary";
import { getServerSession } from "@/lib/auth-server";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();
  // Cada página conserva su comprobación de rol. El límite retira los datos
  // del documento abierto cuando la sesión o la cuenta dejan de ser propias.
  if (!session?.user.id) return children;
  return (
    <PatientSessionBoundary
      key={session.user.id}
      ownerId={session.user.id}
      audience="administration"
    >
      {children}
    </PatientSessionBoundary>
  );
}
