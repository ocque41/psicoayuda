import type { Metadata } from "next";
import Link from "next/link";
import { FaqJsonLd } from "@/components/structured-data";
import {
  PUBLIC_OPEN_GRAPH,
  PUBLIC_TWITTER,
} from "@/lib/public-social-metadata";
import { HOME_FAQ, SITE_LOCALE, SITE_NAME } from "@/lib/site";

const title = "Preguntas frecuentes";
const description =
  "Cómo encontrar un profesional, volver a tu conversación y solicitar Ayuda Terremoto en Nido.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/preguntas-frecuentes" },
  openGraph: {
    ...PUBLIC_OPEN_GRAPH,
    type: "website",
    locale: SITE_LOCALE,
    siteName: SITE_NAME,
    title: `${title} | ${SITE_NAME}`,
    description,
    url: "/preguntas-frecuentes",
  },
  twitter: {
    ...PUBLIC_TWITTER,
    card: "summary_large_image",
    title: `${title} | ${SITE_NAME}`,
    description,
  },
};
const conversationAccessFaq = {
  question: "¿Cómo vuelvo a mi conversación y a mis mensajes?",
  answer:
    "Guarda el enlace privado y vuelve desde el mismo navegador mientras conserves la sesión. Si dejaste correo para esa conversación, puedes solicitar un enlace desde la página de acceso. Si ya la vinculaste a tu cuenta, también puedes entrar desde ella. Si el dispositivo no tiene las claves de tus mensajes cifrados, el código de recuperación sirve para restaurarlas desde un respaldo que las contenga. El código no concede acceso al chat ni recupera claves ausentes del respaldo.",
};
const professionalFaq = [
  {
    question: "¿Cómo creo mi espacio profesional?",
    answer:
      "Registra tu cuenta, completa tu perfil y facilita las credenciales para su revisión. Una vez aprobado, puedes organizar pacientes, agenda y servicios. El equipo te acompaña desde la sección de soporte.",
  },
  {
    question: "¿Qué hago si una persona no responde?",
    answer:
      "Revisa tu bandeja y las vías de contacto acordadas. En Tu consulta puedes liberar un cupo sin borrar la conversación. Conserva la posibilidad de retomarla y consulta al equipo si necesitas ayuda.",
  },
  {
    question: "¿Puedo pausar mi perfil o darme de baja?",
    answer:
      "Sí. Puedes pausar nuevas solicitudes desde tu perfil y ajustar el horario de recepción desde Horario. En la configuración de tu cuenta puedes solicitar la eliminación; no hace falta escribir a un correo personal.",
  },
];
const waitlistFaq = {
  question: "¿Puedo anotarme en una lista de espera?",
  answer:
    "Sí. La lista general de espera recoge solicitudes de apoyo por motivos distintos del terremoto para que el equipo las revise según disponibilidad. No garantiza un cupo ni un plazo de respuesta. Puedes seguir explorando el catálogo y las organizaciones aliadas. Ayuda Terremoto mantiene su recorrido gratuito separado.",
};
export default function Page() {
  const items = [
    ...HOME_FAQ,
    conversationAccessFaq,
    waitlistFaq,
    ...professionalFaq,
  ];
  return (
    <section className="section">
      <div className="container">
        <h1>Preguntas frecuentes</h1>
        {items.map((item) => (
          <details className="card" key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
        <p>
          <Link href="/profesionales">Encontrar mi psicólogo</Link> ·{" "}
          <Link href="/acceso">Pedir enlace de acceso</Link> ·{" "}
          <Link href="/lista-de-espera">Lista general de espera</Link> ·{" "}
          <Link href="/para-psicologos">Soy profesional</Link> ·{" "}
          <Link href="/contacto">Hablar con el equipo</Link>
        </p>
        <FaqJsonLd items={items} />
      </div>
    </section>
  );
}
