import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyNotice } from "@/components/emergency-notice";
import { getFeedProfessionals } from "@/lib/feed";
import { FeedProfessionalCard } from "./professional-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Psicólogas y psicólogos voluntarios disponibles",
  description:
    "Mira las psicólogas y psicólogos voluntarios verificados de Nido y con quién puedes hablar. Gratis, a distancia y sin crear cuenta.",
  alternates: { canonical: "/profesionales" },
};

export default async function ProfesionalesPage() {
  const professionals = await getFeedProfessionals();

  return (
    <section className="section">
      <div className="container">
        <h1>Personas voluntarias listas para acompañarte</h1>
        <ul className="trust-strip" aria-label="Garantías">
          <li>Gratis</li>
          <li>Confidencial</li>
          <li>Sin crear cuenta</li>
          <li>Verificados</li>
        </ul>
        <p className="lead">
          Estas psicólogas y psicólogos dan su tiempo para acompañarte, a
          distancia. Cada tarjeta muestra si la persona está disponible y cuánto
          suele tardar en responder.
        </p>
        <EmergencyNotice />

        {professionals.length === 0 ? (
          <div className="card">
            <p>
              Aún estamos sumando voluntarios verificados. Mientras tanto, puedes{" "}
              <Link href="/ayuda">dejar tu solicitud</Link> y una persona del
              equipo te contactará por correo.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-2">
              {professionals.map((professional) => (
                <FeedProfessionalCard
                  key={professional.id}
                  professional={professional}
                />
              ))}
            </div>
            <p className="reassurance">
              El chat directo con cada voluntario llega muy pronto. Mientras
              tanto, puedes <Link href="/ayuda">pedir apoyo</Link> y te
              conectamos con alguien afín a lo que necesitas.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
