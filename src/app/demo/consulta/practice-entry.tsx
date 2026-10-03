"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { practiceEntryDestination } from "./destination";

export function PracticeEntry({
  signedIn,
  googleEnabled,
}: {
  signedIn: boolean;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState("/pro/consulta");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    function resolve() {
      const href = practiceEntryDestination(window.location.hash);
      setDestination(href);
      setReady(true);
      if (signedIn) router.replace(href);
    }
    resolve();
    window.addEventListener("hashchange", resolve);
    return () => window.removeEventListener("hashchange", resolve);
  }, [router, signedIn]);

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 560 }}>
        <p className="eyebrow">Nido · Tu consulta</p>
        <h1>Entra a tu consulta real</h1>
        <p className="lead">
          Tu agenda, tus fichas y tus conversaciones, en tu cuenta. El pajarito
          te acompaña dentro de cada espacio.
        </p>
        {signedIn ? (
          <p role="status">
            Abriendo tu consulta… <Link href={destination}>Continuar →</Link>
          </p>
        ) : ready ? (
          <AuthPanel callbackURL={destination} googleEnabled={googleEnabled} />
        ) : (
          <p role="status">Preparando el acceso…</p>
        )}
        <p className="hint">
          La consulta requiere un perfil profesional clínico aprobado. Si tu
          perfil está pendiente, podrás continuar su revisión en tu panel.
        </p>
        <p>
          <Link href="/para-psicologos">Conocer Nido para profesionales →</Link>
        </p>
        <noscript>
          <a href="/pro/consulta">Entrar a la consulta</a>
        </noscript>
      </div>
    </section>
  );
}
