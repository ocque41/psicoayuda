import type { Metadata } from "next";
import Link from "next/link";
import { FaqJsonLd } from "@/components/structured-data";
import { HOME_FAQ } from "@/lib/site";
export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description:
    "Cómo encontrar un profesional, volver a tu conversación y solicitar Ayuda Terremoto en Nido.",
  alternates: { canonical: "/preguntas-frecuentes" },
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
  const items = [...HOME_FAQ, waitlistFaq, ...professionalFaq];
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
          <Link href="/lista-de-espera">Lista general de espera</Link> ·{" "}
          <Link href="/para-psicologos">Soy profesional</Link> ·{" "}
          <Link href="/contacto">Hablar con el equipo</Link>
        </p>
        <FaqJsonLd items={items} />
      </div>
    </section>
  );
}
