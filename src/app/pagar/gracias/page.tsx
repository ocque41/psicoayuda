import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { formatEuros } from "@/lib/payments/packages";

export const metadata: Metadata = {
  title: "Pago recibido",
  robots: { index: false, follow: false },
};

export default async function PaymentThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ sesion?: string }>;
}) {
  const { sesion } = await searchParams;
  const payment =
    sesion && /^cs_[a-zA-Z0-9_]+$/.test(sesion)
      ? await db.query.payments.findFirst({
          where: eq(payments.stripeCheckoutSessionId, sesion),
        })
      : null;

  const paid = payment?.status === "paid";

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 620 }}>
        <h1>{paid ? "Pago confirmado" : "Pago recibido"}</h1>

        {payment ? (
          <div className="card">
            {paid ? (
              <p>
                Confirmamos tu pago de{" "}
                <strong>{formatEuros(payment.amountCents)}</strong> por{" "}
                <strong>{payment.packageTitle ?? "tu paquete"}</strong>
                {payment.professionalName
                  ? ` con ${payment.professionalName}`
                  : ""}
                . Te enviamos el recibo por correo; el profesional se pondrá en
                contacto para coordinar las sesiones.
              </p>
            ) : (
              <p>
                Estamos confirmando tu pago con Stripe. En unos minutos
                recibirás el recibo por correo; si no llega, escríbenos por la
                página de contacto.
              </p>
            )}
          </div>
        ) : (
          <p>
            Si completaste un pago, en unos minutos recibirás el recibo por
            correo. Si tienes dudas, escríbenos por la página de contacto.
          </p>
        )}

        <p style={{ marginTop: "var(--space-5)" }}>
          <Link className="button human" href="/">
            Volver al inicio
          </Link>
        </p>

        <p className="hint" style={{ marginTop: "var(--space-5)" }}>
          La ayuda por el terremoto en Nido sigue siendo gratis. Si necesitas
          apoyo ahora, puedes{" "}
          <Link href="/ayuda">pedir acompañamiento sin costo</Link>.
        </p>
      </div>
    </section>
  );
}
