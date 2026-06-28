import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in";
import { getServerSession } from "@/lib/auth-server";

export default async function ProPage() {
  const session = await getServerSession();

  return (
    <section className="section">
      <div className="container">
        <h1>Profesionales voluntarios</h1>
        <p className="muted">
          El acceso profesional usa Google. Después de entrar, completa la
          información mínima para verificación.
        </p>
        {session?.user ? (
          <p>
            <Link className="button" href="/pro/onboarding">
              Continuar onboarding
            </Link>{" "}
            <Link className="button secondary" href="/pro/dashboard">
              Ver dashboard
            </Link>
          </p>
        ) : (
          <GoogleSignInButton />
        )}
      </div>
    </section>
  );
}
