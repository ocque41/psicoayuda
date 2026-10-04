import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminNavigation, isAdminView } from "@/components/admin/navigation";
import { AdminDashboard, type AdminSearchParams } from "../dashboard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ view: string }>;
}): Promise<Metadata> {
  const { view } = await params;
  return {
    title:
      adminNavigation.find((item) => item.id === view)?.label ||
      "Administración",
    robots: { index: false, follow: false },
  };
}

export default async function AdminSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const [{ view }, query] = await Promise.all([params, searchParams]);
  if (!isAdminView(view) || view === "resumen") notFound();
  return <AdminDashboard view={view} query={query} />;
}
