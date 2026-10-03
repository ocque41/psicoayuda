"use client";

import { BirdGuide, type BirdGuideStep } from "@/components/demo/bird-guide";

export const reminderGuideTopics = [
  {
    id: "consentimiento",
    title: "Tú eliges si quieres avisos",
    description:
      "Los recordatorios por correo empiezan apagados. Para activarlos, verifica el correo de tu cuenta, marca la casilla y guarda. Si el envío todavía no está disponible, verás un aviso aquí. Cada persona elige sus propios recordatorios.",
  },
  {
    id: "anticipaciones",
    title: "Un aviso, o hasta tres",
    description:
      "Elige de uno a tres avisos distintos para cada sesión: desde 15 minutos hasta una semana antes. Usa «Sin aviso» en los espacios que no necesites. Por ejemplo, puedes elegir 24 horas y 1 hora antes.",
  },
  {
    id: "zona",
    title: "La hora, en tu zona",
    description:
      "La zona horaria indica cómo verás la hora en el correo; cambiarla no mueve la sesión. El envío se comprueba cada cinco minutos y puede demorarse: el aviso no garantiza llegar en el minuto exacto.",
  },
  {
    id: "privacidad",
    title: "Sólo lo necesario en el correo",
    description:
      "El aviso llega al correo verificado de tu cuenta y muestra la hora y un enlace para entrar a Nido. No incluye nombres de pacientes, notas ni conversaciones. Si cancelas o reprogramas una sesión, su aviso anterior deja de enviarse; un correo que ya salió no se puede retirar.",
  },
  {
    id: "desactivar",
    title: "Puedes apagarlos cuando quieras",
    description:
      "Desmarca el correo y pulsa «Guardar recordatorios». Puedes hacerlo aunque hayas repetido anticipaciones: no hace falta corregirlas para apagar los avisos. Tus sesiones siguen igual. Si otra ventana cambió tus preferencias, actualiza la página antes de volver a guardar.",
  },
];

export function ReminderGuide({ targetId }: { targetId: string }) {
  const steps: BirdGuideStep[] = reminderGuideTopics.map((topic) => ({
    ...topic,
    targetId,
  }));
  return (
    <BirdGuide
      steps={steps}
      triggerLabel="El pájaro me explica los recordatorios"
      guideLabel="Tus recordatorios"
    />
  );
}
