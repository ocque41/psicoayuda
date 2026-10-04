"use client";

import Link from "next/link";
import { BirdGuide, type BirdGuideStep } from "@/components/demo/bird-guide";
import { PracticeCalendar } from "@/components/practice/calendar";
import { WorkspaceIcon } from "@/components/workspace/icon";
import { WorkspaceNav } from "@/components/workspace/nav";
import { SettingsPanel } from "@/components/workspace/settings-panel";
import {
  type ReviewWindow,
  reviewHref,
} from "@/lib/practice/review-navigation";
import styles from "./crm-review.module.css";

const windows: Record<
  ReviewWindow,
  {
    title: string;
    description: string;
    detail: string;
    links: { label: string; window: ReviewWindow }[];
  }
> = {
  agenda: {
    title: "Tu agenda, con espacio para cada encuentro",
    description:
      "Mes, semana, día o lista; cada sesión abre la ficha correspondiente.",
    detail:
      "Las citas se guardan en UTC, conservan la zona horaria y comprueban conflictos al reservar. El calendario muestra hasta 200 citas del período.",
    links: [
      { label: "Ver pacientes", window: "pacientes" },
      { label: "Ver servicios", window: "servicios" },
    ],
  },
  pacientes: {
    title: "Cada persona tiene su lugar",
    description: "Fichas, sesiones y seguimiento reunidos en una ventana.",
    detail:
      "El profesional crea y consulta sus propias fichas. Las notas privadas se guardan cifradas por sesión, con revisión para evitar sobrescribir cambios de otra pestaña.",
    links: [
      { label: "Ver agenda", window: "agenda" },
      { label: "Ver mensajes", window: "mensajes" },
    ],
  },
  mensajes: {
    title: "Conversaciones que acompañan",
    description:
      "Chats y mensajes pendientes, vinculados a la ficha cuando corresponde.",
    detail:
      "Los chats clínicos conservan el cifrado de extremo a extremo. El profesional puede liberar un cupo sin borrar la conversación y recibe avisos de mensajes en su bandeja.",
    links: [{ label: "Ver pacientes", window: "pacientes" }],
  },
  servicios: {
    title: "Una consulta a tu manera",
    description: "Sesiones, paquetes y acuerdos con condiciones claras.",
    detail:
      "Cada servicio define duración, moneda, importe, sesiones y cancelación. Los acuerdos conservan sus condiciones y las reservas comprueban los créditos del ciclo. Ayuda Terremoto es gratuita.",
    links: [
      { label: "Ver cobros", window: "cobros" },
      { label: "Ver agenda", window: "agenda" },
    ],
  },
  cobros: {
    title: "Registros claros, por moneda",
    description: "Pagos externos, referencias e historial de correcciones.",
    detail:
      "Los pagos externos son confirmaciones manuales del profesional. Las correcciones conservan el historial y el paciente vinculado puede consultar sus pagos. Los importes de distintas monedas se presentan por separado.",
    links: [{ label: "Ver servicios", window: "servicios" }],
  },
  ajustes: {
    title: "Elige el ritmo de tu consulta",
    description: "Horario, avisos y conexiones en apartados independientes.",
    detail:
      "Los formularios de preferencias conservan sus borradores al cambiar de apartado. Las conexiones muestran su estado y solicitan autorización individual cuando están disponibles.",
    links: [{ label: "Ver agenda", window: "agenda" }],
  },
  soporte: {
    title: "El equipo, cerca de tu consulta",
    description: "Preguntas y seguimiento en un buzón privado.",
    detail:
      "El profesional ve sus consultas, respuestas y estados, con historial paginado. El equipo de soporte tiene permisos separados de credenciales y de las fichas clínicas.",
    links: [{ label: "Ver ajustes", window: "ajustes" }],
  },
  plan: {
    title: "Tu espacio profesional",
    description: "Prueba y estado del software en una ventana propia.",
    detail:
      "El software tiene una prueba sin tarjeta. La facturación se habilita por separado de los cobros de atención; su estado real se consulta en Consola.",
    links: [{ label: "Ver servicios", window: "servicios" }],
  },
  perfil: {
    title: "La primera impresión también importa",
    description: "Presentación pública, disponibilidad y credenciales.",
    detail:
      "Los cambios materiales de credenciales vuelven a revisión y vencen los ámbitos conservando su historial. La publicación de nuevos profesionales puede seguirse desde Admisión.",
    links: [{ label: "Ver ajustes", window: "ajustes" }],
  },
};

export function CrmReview({
  window: selected,
  month,
  day,
  timeZone,
}: {
  window: ReviewWindow;
  month: string;
  day: string;
  timeZone: string;
}) {
  const content = windows[selected];
  const steps: BirdGuideStep[] = [
    {
      id: "ventanas",
      targetId: "practice-navigation",
      title: "Una ventana para cada tarea",
      description:
        "Explora la misma navegación de la consulta. En esta revisión los destinos permanecen dentro de Administración.",
    },
    {
      id: "contenido",
      targetId: "crm-review-content",
      title: content.title,
      description: content.detail,
    },
    {
      id: "estado",
      targetId: "crm-review-state",
      title: "Comprueba el estado real",
      description:
        "La consola distingue funciones disponibles, configuración y verificaciones pendientes de cada proveedor.",
    },
  ];
  return (
    <div className={styles.review}>
      <div className={styles.notice} role="note">
        <span className={styles.pill}>Vista de revisión</span>
        <p>
          Explora el diseño y los componentes de la consulta. Esta vista no
          carga fichas, notas ni conversaciones de profesionales.
        </p>
        <Link id="crm-review-state" href="/admin/consola" prefetch={false}>
          Abrir consola ↗
        </Link>
      </div>
      <div className={styles.workspace}>
        <WorkspaceNav audience="professional" adminReview />
        <div className={styles.content} id="crm-review-content" key={selected}>
          <header className="workspace-heading">
            <div>
              <p className="eyebrow">Nido · Consulta profesional</p>
              <h2>{content.title}</h2>
              <p className="lead">{content.description}</p>
            </div>
          </header>
          <div className={styles.actions}>
            <BirdGuide
              key={selected}
              steps={steps}
              guideLabel="Revisión del CRM"
              triggerLabel="Recorrer con el pajarito"
            />
            {content.links.map((link) => (
              <Link
                className="button ghost"
                key={link.window}
                href={reviewHref(link.window)}
                prefetch={false}
              >
                {link.label} →
              </Link>
            ))}
          </div>
          {selected === "agenda" ? (
            <PracticeCalendar
              events={[]}
              month={month}
              initialDay={day}
              timeZone={timeZone}
              emptyHref={reviewHref("pacientes")}
            />
          ) : selected === "ajustes" ? (
            <SettingsPanel
              initialSection="agenda"
              sections={[
                {
                  id: "agenda",
                  label: "Agenda",
                  icon: "calendar",
                  description: "Zona horaria y horario de recepción.",
                  content: (
                    <ReviewCard
                      title="La hora de cada encuentro"
                      text="El profesional selecciona una zona IANA y sus horas de recepción. Las citas conservan su horario aunque cambie la zona de presentación."
                    />
                  ),
                },
                {
                  id: "avisos",
                  label: "Avisos",
                  icon: "message",
                  description: "Preferencias personales de recordatorios.",
                  content: (
                    <ReviewCard
                      title="Avisos elegidos por cada persona"
                      text="Los recordatorios por correo requieren activación personal. La anticipación y las preferencias se guardan por cuenta; la consola muestra la disponibilidad del servicio."
                    />
                  ),
                },
                {
                  id: "conexiones",
                  label: "Conexiones",
                  icon: "settings",
                  description: "Calendario y servicios externos.",
                  content: (
                    <ReviewCard
                      title="Una conexión con autorización"
                      text="La descarga ICS está disponible como copia manual. Google Calendar necesita configuración dedicada y autorización de cada cuenta. Consulta el estado actual en Consola."
                    />
                  ),
                },
                {
                  id: "privacidad",
                  label: "Privacidad",
                  icon: "leaf",
                  description: "Datos y gestión de la cuenta.",
                  content: (
                    <ReviewCard
                      title="Acceso separado por función"
                      text="Cada profesional accede a su consulta. La admisión revisa candidatos; el soporte recibe consultas. Los permisos se comprueban en el servidor en cada operación."
                    />
                  ),
                },
              ]}
            />
          ) : (
            <div className={styles.panel}>
              <span className={styles.emptyIcon}>
                <WorkspaceIcon
                  name={
                    selected === "mensajes" || selected === "soporte"
                      ? "message"
                      : selected === "cobros" || selected === "plan"
                        ? "payment"
                        : selected === "pacientes" || selected === "perfil"
                          ? "profile"
                          : "leaf"
                  }
                />
              </span>
              <h3>
                {selected === "pacientes"
                  ? "Las fichas pertenecen a cada consulta"
                  : selected === "mensajes"
                    ? "Los chats permanecen privados"
                    : "Conoce este espacio"}
              </h3>
              <p>{content.detail}</p>
              {selected === "perfil" ? (
                <Link
                  className="button human"
                  href="/admin/admision"
                  prefetch={false}
                >
                  Revisar nuevas admisiones →
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ title, text }: { title: string; text: string }) {
  return (
    <article className={styles.panel}>
      <h3>{title}</h3>
      <p>{text}</p>
      <Link href="/admin/consola" prefetch={false}>
        Consultar disponibilidad ↗
      </Link>
    </article>
  );
}
