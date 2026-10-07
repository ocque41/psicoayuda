import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyNotice } from "@/components/emergency-notice";
import {
  EmergencyPriorityBar,
  EmergencyResourcesDirectory,
} from "@/components/emergency-resources";
import { HelpRequestForm } from "@/components/help-request-form";
import { QuickExit, QuickExitNote } from "@/components/quick-exit";
import { SupportDirectory } from "@/components/support-directory";
import { WaitlistCallout } from "@/components/waitlist-callout";
import { getCachedFeedProfessionals } from "@/lib/feed";
import { publishedOrganizations } from "@/lib/organizations";
import {
  getCachedPublishedPartners,
  partnersToOrganizations,
} from "@/lib/partners";

const title = "Ayuda Terremoto: solicitar acompañamiento gratuito";
const description =
  "Solicita acompañamiento voluntario gratuito por el terremoto en Venezuela, según disponibilidad. Este programa es distinto de las consultas acordadas con profesionales.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/ayuda" },
  openGraph: {
    title: `${title} | Nido`,
    description,
    url: "/ayuda",
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | Nido`,
    description,
  },
};

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{
    profesional?: string;
    acceso?: string;
    q?: string;
    tipo?: string;
    tema?: string;
    disp?: string;
    pago?: string;
  }>;
}) {
  const { profesional, acceso, q, tipo, tema, disp, pago } = await searchParams;
  const professionals = await getCachedFeedProfessionals();
  const organizations = [
    ...publishedOrganizations,
    ...partnersToOrganizations(await getCachedPublishedPartners()),
  ];
  const initialFilters = {
    q,
    type: tipo,
    topic: tema,
    onlyAvailable: disp === "1",
    paid: pago === "1",
  };

  let preferred: { id: string; name: string; nonClinical: boolean } | null =
    null;
  if (profesional) {
    const found = professionals.find((person) => person.id === profesional);
    if (found)
      preferred = {
        id: found.id,
        name: found.name,
        nonClinical: found.nonClinicalHelper,
      };
  }

  return (
    <section className="section">
      <QuickExit />
      <div className="container">
        <EmergencyPriorityBar />
        <h1>Ayuda Terremoto: solicita acompañamiento gratuito</h1>
        <p className="lead">
          Ayuda Terremoto es un programa separado de acompañamiento voluntario
          gratuito para personas afectadas por el terremoto en Venezuela, según
          disponibilidad. Solicitar apoyo no garantiza cupo ni plazo de
          respuesta. Para consultas por otros motivos, explora el{" "}
          <Link href="/profesionales">directorio de profesionales</Link> y
          acuerda con cada persona las condiciones de atención.
        </p>
        <ul className="trust-strip" aria-label="Condiciones del programa">
          <li>Ayuda Terremoto gratuita</li>
          <li>Según disponibilidad</li>
          <li>Sin crear cuenta</li>
          <li>Recorrido separado</li>
        </ul>
        <EmergencyNotice />

        {acceso === "invalido" ? (
          <div className="notice" role="alert">
            <p style={{ margin: 0 }}>
              Ese enlace de acceso ya no es válido (pudo expirar o ya se usó).{" "}
              Si dejaste un correo, puedes{" "}
              <Link href="/acceso">pedir un enlace nuevo aquí</Link>. Si aún no
              tienes una conversación, envía tu solicitud aquí abajo.
            </p>
          </div>
        ) : null}

        <p className="muted" style={{ marginTop: 8 }}>
          ¿Ya escribiste antes y quieres retomar tu conversación?{" "}
          <Link href="/acceso">Entra con tu correo</Link>.
        </p>

        {professionals.length > 0 || organizations.length > 0 ? (
          <>
            <h2>Quiénes pueden acompañarte</h2>
            <p className="lead">
              Perfiles revisados y organizaciones aliadas. El directorio también
              muestra otros servicios; no todos son gratuitos. Consulta el tipo
              de apoyo y las condiciones de cada opción. Puedes contactar con
              una persona o enviar una solicitud general mediante el formulario
              de abajo.
            </p>
            <SupportDirectory
              itemListPath="/ayuda"
              professionals={professionals}
              organizations={organizations}
              initialFilters={initialFilters}
            />
          </>
        ) : null}

        <WaitlistCallout />
        <QuickExitNote />

        <h2 id="formulario">
          O cuéntanos y envía tu solicitud a varios a la vez
        </h2>
        <p className="lead">
          Al completar el formulario podrás enviar tu solicitud a las personas
          disponibles o elegir a quién. El acompañamiento de Ayuda Terremoto es
          gratuito; las consultas por otros motivos tienen condiciones propias.
        </p>
        <HelpRequestForm
          preferredProfessionalId={preferred?.id}
          preferredProfessionalName={preferred?.name}
          preferredProfessionalNonClinical={preferred?.nonClinical}
        />
        <p className="reassurance">
          Detrás de Nido hay psicólogas y psicólogos voluntarios reales que dan
          su tiempo para acompañar a personas como tú.
        </p>

        <EmergencyResourcesDirectory />
      </div>
    </section>
  );
}
