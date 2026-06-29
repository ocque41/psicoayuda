import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in";
import { getServerSession } from "@/lib/auth-server";

export default async function ProPage() {
  const session = await getServerSession();

  return (
    <section className="section">
      <div className="container">
        <h1>Este es tu lugar para ayudar</h1>
        <p className="lead">
          Si eres psicólogo/a o profesional de la salud mental, aquí puedes
          acompañar a quien más lo necesita. Atiendes en remoto, en la medida
          de tu tiempo, sin coste para nadie. Gracias por estar aquí.
        </p>
        <p className="muted">
          El acceso usa Google. Después de entrar, completas una verificación
          mínima de tu credencial antes de recibir solicitudes.
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
