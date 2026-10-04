import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSessionReturn } from "@/components/account-session-return";
import { accountSessionDestination } from "@/lib/account-session-callback";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Preparando tu espacio · Nido",
  robots: { index: false, follow: false },
};

export default async function AccountSessionReady({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const session = await getServerSession();
  if (!session?.user.id) redirect("/entrar");
  const { destino } = await searchParams;
  return (
    <AccountSessionReturn destination={accountSessionDestination(destino)} />
  );
}
