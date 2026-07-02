import type { Metadata } from "next";
import { EmergencyNotice } from "@/components/emergency-notice";
import {
  EmergencyPriorityBar,
  EmergencyResourcesDirectory,
} from "@/components/emergency-resources";
import { HelpRequestForm } from "@/components/help-request-form";
import { QuickExit, QuickExitNote } from "@/components/quick-exit";
import { DirectoryItemListJsonLd } from "@/components/structured-data";
import { SupportDirectory } from "@/components/support-directory";
import { getFeedProfessionals } from "@/lib/feed";
import {
  type Organization,
  type OrgService,
  publishedOrganizations,
} from "@/lib/organizations";
import {
  getPublishedPartners,
  type Partner,
  type PartnerContact,
} from "@/lib/partners";

export const metadata: Metadata = {
  title: "Pedir ayuda psicológica gratis en Venezuela",
  description:
    "Pide apoyo psicológico gratuito y confidencial en Venezuela. Escríbele a un profesional voluntario o envía tu solicitud a todos, sin crear cuenta.",
  alternates: { canonical: "/ayuda" },
  openGraph: {
    title: "Pedir ayuda psicológica gratis en Venezuela | Nido",
    description:
      "Escríbele a un profesional voluntario o envía tu solicitud a todos, sin crear cuenta. Una persona voluntaria te acompañará.",
    url: "/ayuda",
  },
};

// Los aliados verificados viven en D1 (`partners`, los mismos del carrusel). Aquí
// los adaptamos al tipo `Organization` para que TAMBIÉN salgan en el buscador de
// /ayuda (bajo "Todos", "Organizaciones" y el filtro de psicología). El contacto
// se resuelve a un único enlace (WhatsApp/tel/web/Instagram); la ficha completa,
// con todas las vías, vive en /alianzas.
function partnersToOrganizations(partners: Partner[]): Organization[] {
  const psychology: OrgService = "psicologia";
  return partners.map((partner): Organization => {
    const contactValue = (type: PartnerContact["type"]) =>
      partner.contacts.find((contact) => contact.type === type)?.value;
    const website = contactValue("website");
    const instagram = contactValue("instagram");
    const url = website
      ? /^https?:\/\//i.test(website)
        ? website
        : `https://${website}`
      : instagram
        ? `https://instagram.com/${instagram.replace(/^@/, "")}`
        : undefined;
    return {
      id: partner.id,
      name: partner.name,
      tagline: partner.specialty || undefined,
      logo: partner.logo || undefined,
      phone: contactValue("whatsapp") ?? contactValue("phone"),
      email: contactValue("email"),
      url,
      specialties: [],
      services: [psychology],
      virtual24h: false,
    };
  });
}

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
  }>;
}) {
  const { profesional, acceso, q, tipo, tema, disp } = await searchParams;
  const professionals = await getFeedProfessionals();
  const organizations = [
    ...publishedOrganizations,
    ...partnersToOrganizations(await getPublishedPartners()),
  ];
  const initialFilters = {
    q,
    type: tipo,
    topic: tema,
    onlyAvailable: disp === "1",
  };
  const itemNames = [
    ...professionals.map((professional) => professional.name),
    ...organizations.map((organization) => organization.name),
  ];

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
        <h1>Cuéntanos cómo estás. Vamos a leerte.</h1>
        <ul className="trust-strip" aria-label="Garantías">
          <li>Gratis</li>
          <li>Confidencial</li>
          <li>Sin crear cuenta</li>
          <li>Voluntarios verificados</li>
        </ul>
        <EmergencyNotice />

        {acceso === "invalido" ? (
          <div className="notice" role="alert">
            <p style={{ margin: 0 }}>
              Ese enlace de acceso ya no es válido (pudo expirar a las 72 horas
              o ya se usó). Si aún necesitas apoyo, vuelve a enviar tu solicitud
              aquí abajo y te enviaremos un enlace nuevo.
            </p>
          </div>
        ) : null}

        {professionals.length > 0 || organizations.length > 0 ? (
          <>
            <h2>Quiénes pueden acompañarte</h2>
            <p className="lead">
              Voluntarios verificados y organizaciones aliadas. Escríbele
              directo a quien prefieras, o{" "}
              <strong>envía tu solicitud a todas a la vez</strong> más abajo.
            </p>
            <DirectoryItemListJsonLd path="/ayuda" names={itemNames} />
            <SupportDirectory
              professionals={professionals}
              organizations={organizations}
              initialFilters={initialFilters}
            />
          </>
        ) : null}

        <QuickExitNote />

        <h2 id="formulario">
          O cuéntanos y envía tu solicitud a varios a la vez
        </h2>
        <p className="lead">
          Completar esto toma menos de un minuto. Al terminar podrás enviar tu
          solicitud a todas las personas disponibles o elegir a quién.
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
