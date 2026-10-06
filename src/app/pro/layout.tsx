import type { ReactNode } from "react";
import { PatientSessionBoundary } from "@/components/patient/session-boundary";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function ProfessionalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();
  // /pro también presenta el acceso público. Cada página conserva su guard
  // de permisos; este límite protege la presentación de la cuenta ya abierta.
  if (!session?.user.id) return children;
  return (
    <PatientSessionBoundary
      key={session.user.id}
      ownerId={session.user.id}
      audience="professional"
    >
      {children}
    </PatientSessionBoundary>
  );
}
