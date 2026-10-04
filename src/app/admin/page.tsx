import type { Metadata } from "next";
import { normalizeAdminSearch } from "@/components/admin/search-params";
import { AdminDashboard, type AdminSearchParams } from "./dashboard";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  const query = normalizeAdminSearch(await searchParams);
  // Preserve older filtered URLs and account-action return messages.
  const view = query.cuenta
    ? "cuentas"
    : query.contacto_estado || query.contacto_origen || query.contacto_motivo
      ? "contactos"
      : query.estado || query.urgencia || query.q || query.page
        ? "solicitudes"
        : "resumen";
  return <AdminDashboard view={view} query={query} />;
}
