"use client";
import { BirdGuide } from "@/components/demo/bird-guide";

export const pushGuideTopics = [
  {
    id: "eleccion",
    title: "Tú eliges cada aviso",
    description:
      "Puedes recibir avisos de mensajes, de próximas sesiones y, si eres profesional, un recordatorio para revisar las notas después de una sesión. Empiezan apagados. Elige los que quieras y pulsa «Activar en este dispositivo». El permiso del navegador y tus elecciones en Nido son necesarios; cada dispositivo se activa por separado.",
  },
  {
    id: "telefono",
    title: "También con Nido cerrado",
    description:
      "Estos avisos pueden llegar aunque cierres Nido. En iPhone o iPad, usa una versión compatible y añade Nido a la pantalla de inicio desde el menú Compartir. Abre ese icono y activa los avisos aquí. Si el navegador bloqueó el permiso, cámbialo en los ajustes del dispositivo; Nido no puede hacerlo por ti.",
  },
  {
    id: "descanso",
    title: "Tu horario de descanso cuenta",
    description:
      "Elige tu zona horaria y las horas en las que no quieres avisos. Los mensajes y el recordatorio de notas esperan al final del descanso, hasta un día. Un aviso de una cita se descarta si la cita comienza antes de que termine tu descanso. Cambiar estas opciones no mueve ninguna sesión.",
  },
  {
    id: "privacidad",
    title: "Un aviso discreto",
    description:
      "El aviso sólo dice que tienes una novedad en Nido. No muestra nombres, conversaciones, notas ni el motivo de una sesión. Al abrirlo, entrarás a tu espacio con sus permisos habituales. El sistema del teléfono decide el sonido y la visibilidad en la pantalla bloqueada.",
  },
  {
    id: "limites",
    title: "Puede demorarse",
    description:
      "Nido comprueba los avisos periódicamente y el teléfono puede demorar la entrega por conexión, batería o sus ajustes. No uses los avisos para urgencias. Un mensaje que ya leíste o una cita cancelada o cambiada se comprueba de nuevo antes de enviar. Un aviso que ya salió no se puede retirar.",
  },
  {
    id: "baja",
    title: "Puedes apagarlos cuando quieras",
    description:
      "«Desactivar este dispositivo» borra su permiso de envío en Nido y retira su suscripción del navegador. «Desactivar todos mis dispositivos» detiene los avisos de este espacio. Al cerrar sesión dejan de enviarse avisos nuevos y tendrás que activarlos de nuevo al entrar. Si cambias de cuenta o de espacio y el navegador conserva otra suscripción, puedes retirarla de este navegador y activar la actual. No modifica las preferencias de la otra cuenta. Aunque tu perfil esté suspendido, «Retirar mis avisos» en los controles de cuenta permite darte de baja. El correo y sus preferencias se gestionan por separado.",
  },
];
export function PushGuide({ targetId }: { targetId: string }) {
  return (
    <BirdGuide
      steps={pushGuideTopics.map((topic) => ({ ...topic, targetId }))}
      triggerLabel="El pájaro me explica estos avisos"
      guideLabel="Avisos con Nido cerrado"
    />
  );
}
