"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BirdGuide, type BirdGuideStep } from "@/components/demo/bird-guide";
import styles from "./practice-guide.module.css";

const navigation: BirdGuideStep = {
  id: "espacios",
  targetId: "practice-navigation",
  title: "Cada tarea tiene su espacio",
  description:
    "Agenda, pacientes, mensajes, cobros y preferencias se abren desde esta navegación. Puedes cambiar de espacio cuando lo necesites.",
};

const guides: Record<string, { label: string; steps: BirdGuideStep[] }> = {
  "/pro/consulta": {
    label: "Agenda",
    steps: [
      navigation,
      {
        id: "agenda",
        targetId: "calendario",
        title: "Tu agenda real",
        description:
          "Consulta el mes y elige un día para ver tus sesiones. Si aún no tienes ninguna, crea una ficha en Pacientes; después programa el encuentro desde esa ficha.",
      },
      {
        id: "primer-paso",
        targetId: "practice-guide-actions",
        title: "Prepara el primer encuentro",
        description:
          "Crea la ficha con autorización de la persona y define un servicio con su duración. Abre después la ficha y utiliza Programar sesión. La agenda mostrará el encuentro cuando se guarde.",
      },
    ],
  },
  "/pro/pacientes": {
    label: "Pacientes",
    steps: [
      navigation,
      {
        id: "fichas",
        targetId: "patients-list-title",
        title: "Encuentra una ficha propia",
        description:
          "Busca por nombre o seguimiento y abre la ficha que necesitas. Allí encontrarás sus sesiones y los enlaces a sus notas privadas y conversación, si está vinculada.",
      },
      {
        id: "crear",
        targetId: "patient-create-title",
        title: "Crea tu primera ficha",
        description:
          "Introduce los datos mínimos de contacto, país y zona horaria. Confirma que tienes autorización y pulsa Crear ficha. Si ya tienes una conversación, también puedes vincularla desde Mensajes.",
      },
      {
        id: "notas",
        targetId: "practice-guide-actions",
        title: "Las notas empiezan en una sesión",
        description:
          "Abre una ficha, programa una sesión y utiliza Abrir notas en ese encuentro. Cada nota nueva queda asociada a esa sesión propia; los apuntes anteriores conservan su historial.",
      },
    ],
  },
  "/pro/mensajes": {
    label: "Mensajes",
    steps: [
      navigation,
      {
        id: "mensajes",
        targetId: "messages-list-title",
        title: "Retoma una conversación",
        description:
          "Las conversaciones que te pertenecen aparecen aquí. Abre el chat para leer y responder. Si no hay ninguna, aparecerán cuando una persona contacte contigo.",
      },
      {
        id: "vincular",
        targetId: "messages-list-title",
        title: "Conecta conversación y ficha",
        description:
          "En una conversación sin ficha, despliega Vincular a una ficha y confirma la autorización de la persona. Si ya está vinculada, abre su ficha para organizar las sesiones.",
      },
    ],
  },
  "/pro/cobros": {
    label: "Cobros",
    steps: [
      navigation,
      {
        id: "cobros",
        targetId: "practice-receipt-filters",
        title: "Revisa tus registros por periodo",
        description:
          "Elige mes y moneda para consultar los pagos externos registrados. Los importes de distintas monedas se muestran separados. Si no hay registros en el periodo, la lista estará vacía.",
      },
      {
        id: "registro",
        targetId: "practice-receipt-actions",
        title: "Registra desde la ficha",
        description:
          "Abre Pacientes, elige una ficha y revisa su sección Cobros. Registrar un pago externo conserva lo que confirmas manualmente; Nido no realiza ese cobro. Ayuda Terremoto mantiene todas sus sesiones gratuitas.",
      },
    ],
  },
  "/pro/ajustes": {
    label: "Preferencias",
    steps: [
      navigation,
      {
        id: "horario",
        targetId: "practice-settings",
        title: "Revisa la hora de tu consulta",
        description:
          "Elige tu zona horaria y el horario de recepción de nuevas ofertas. Revisa los valores antes de guardar tus preferencias.",
      },
      {
        id: "avisos",
        targetId: "reminders-professional",
        title: "Decide si quieres recordatorios",
        description:
          "Revisa los avisos por correo y sus anticipaciones. Se activan sólo si tú lo eliges; puedes apagarlos desde este mismo panel. La guía de recordatorios explica cada opción.",
      },
      {
        id: "calendario",
        targetId: "practice-calendar-settings",
        title: "Lleva tus horarios a otro calendario",
        description:
          "Puedes descargar la agenda ICS para importarla manualmente. Esa copia no se actualiza sola. El panel indica si la conexión directa con Google está disponible y requiere tu autorización.",
      },
    ],
  },
};

const patientGuide = {
  label: "Ficha",
  steps: [
    navigation,
    {
      id: "sesiones",
      targetId: "sesiones",
      title: "Organiza un encuentro en esta ficha",
      description:
        "Programar sesión usa los servicios que has creado y la zona horaria de tu consulta. Si aún no tienes servicios, utiliza el enlace para crear el primero y vuelve a la ficha.",
    },
    {
      id: "notas",
      targetId: "notas",
      title: "Apuntes privados por sesión",
      description:
        "Selecciona una sesión propia mediante Abrir notas para escribir sus apuntes. Puedes guardar varias notas para un mismo encuentro. Los cambios sin guardar requieren tu atención antes de salir.",
    },
  ],
};

/** Sólo se monta mediante PracticeNav, después del control de acceso de la página.
 * El recorrido usa contenido estático: nunca recibe pacientes, notas ni sesiones. */
export function PracticeGuide() {
  const pathname = usePathname();
  const guide =
    guides[pathname] ||
    (/^\/pro\/pacientes\/[^/]+$/.test(pathname) ? patientGuide : null);
  if (!guide) return null;
  const patientPage = guide === patientGuide;
  return (
    <section
      className={styles.guide}
      aria-label={`Ayuda para ${guide.label.toLowerCase()}`}
    >
      <BirdGuide
        key={pathname}
        steps={guide.steps}
        guideLabel={guide.label}
        triggerLabel="Conocer este espacio con el pajarito"
        onStepChange={
          pathname === "/pro/ajustes"
            ? (step) => {
                window.dispatchEvent(
                  new CustomEvent("nido:settings-target", {
                    detail: step.targetId,
                  }),
                );
              }
            : undefined
        }
      />
      <div id="practice-guide-actions" className={styles.actions}>
        {patientPage ? (
          <>
            <Link href="#sesiones">Programar sesión →</Link>
            <Link href="#notas">Abrir notas por sesión →</Link>
          </>
        ) : (
          <>
            <Link href="/pro/pacientes#crear-paciente">Crear ficha →</Link>
            <Link href="/pro/pacientes">Abrir una ficha para programar →</Link>
          </>
        )}
        <Link href="/pro/servicios">Preparar mis servicios →</Link>
      </div>
    </section>
  );
}
