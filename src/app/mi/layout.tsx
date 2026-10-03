import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tu espacio · Nido",
  robots: { index: false, follow: false },
};
export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
