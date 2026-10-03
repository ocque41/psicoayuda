import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import styles from "@/components/onboarding/onboarding.module.css";
import { getServerSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "Entra en tu espacio",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; cuenta?: string }>;
}) {
  const session = await getServerSession();
  if (session?.user.id) redirect("/empezar");
  const { modo, cuenta } = await searchParams;
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  return (
    <section className="section">
      <div className="container">
        <div className={styles.scene}>
          <div style={{ width: "min(100%, 480px)", marginInline: "auto" }}>
            <p className={styles.eyebrow}>Tu lugar, a tu ritmo</p>
            <h1 className={styles.title}>
              {modo === "registro"
                ? "Crea tu espacio en Nido"
                : "Qué bueno que estés aquí"}
            </h1>
            <p className={styles.description}>
              Entra para reunir tu agenda y tus conversaciones. Al crear tu
              cuenta eliges tu recorrido.
            </p>
            {cuenta === "borrada" ? (
              <p className="status-message" role="status">
                Tu cuenta se borró correctamente.
              </p>
            ) : null}
            <AuthPanel
              callbackURL="/empezar"
              defaultMode={modo === "registro" ? "signup" : "signin"}
              googleEnabled={googleEnabled}
            />
            <p className={styles.account}>
              Al continuar, puedes consultar{" "}
              <Link href="/privacidad">cómo cuidamos tus datos</Link>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
