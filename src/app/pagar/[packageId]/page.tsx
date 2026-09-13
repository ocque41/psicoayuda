import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatEuros, getPayablePackage } from "@/lib/payments/packages";
import { PayButton } from "./pay-button";

export const metadata: Metadata = {
  title: "Pagar sesiones",
  robots: { index: false, follow: false },
};

export default async function PayPackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ packageId: string }>;
  searchParams: Promise<{ cancelado?: string; c?: string }>;
}) {
  const { packageId } = await params;
  const { cancelado, c } = await searchParams;

  const payable = await getPayablePackage(packageId);
  if (!payable) notFound();
  const { pkg, professional } = payable;

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 620 }}>
        <p>
          <Link className="button secondary" href="/ayuda">
            ← Volver
          </Link>
        </p>

        <h1>Pagar paquete de sesiones</h1>
        <p className="muted">
          Estás pagando directamente a {professional.name}. Nido procesa el pago
          de forma segura con Stripe; no guardamos los datos de tu tarjeta.
        </p>

        {cancelado === "1" ? (
          <p className="status-message" role="status">
            Cancelaste el pago: no se cobró nada. Puedes intentarlo de nuevo
            cuando quieras.
          </p>
        ) : null}

        <div className="card" style={{ marginTop: "var(--space-5)" }}>
          <h2 style={{ marginTop: 0 }}>{pkg.title}</h2>
          {pkg.description ? <p>{pkg.description}</p> : null}
          <ul>
            <li>
              <strong>{pkg.sessionsCount}</strong>{" "}
              {pkg.sessionsCount === 1 ? "sesión" : "sesiones"}
            </li>
            {pkg.validityDays ? (
              <li>
                Válidas por <strong>{pkg.validityDays} días</strong>
              </li>
            ) : null}
            <li>
              Profesional: <strong>{professional.name}</strong>
              {professional.city ? ` · ${professional.city}` : ""}
            </li>
          </ul>
          <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: "12px 0" }}>
            {formatEuros(pkg.priceCents)}
          </p>
          <PayButton
            packageId={pkg.id}
            conversationId={c && /^[a-zA-Z0-9_-]{8,64}$/.test(c) ? c : null}
          />
        </div>

        <p className="hint" style={{ marginTop: "var(--space-5)" }}>
          La ayuda por el terremoto en Nido sigue siendo gratis. Este pago es
          por un paquete de sesiones que acordaste con el profesional; al
          terminar recibirás un recibo por correo y el profesional coordinará
          contigo las sesiones.
        </p>
      </div>
    </section>
  );
}
