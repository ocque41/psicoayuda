import Link from "next/link";
import { EMERGENCY_CONTACTS } from "@/lib/resources";

export function EmergencyNotice() {
  // Número de emergencia desde la fuente única y verificada (no se hardcodea).
  const phone = EMERGENCY_CONTACTS[0]?.contacts.find((contact) =>
    contact.href?.startsWith("tel:"),
  );

  return (
    <div className="notice" role="note">
      <span aria-hidden="true">🛟</span>
      <span>
        <strong>Si es una emergencia ahora mismo</strong> y sientes que tu vida
        o la de alguien corre riesgo, llama de inmediato al{" "}
        {phone ? (
          <a href={phone.href}>
            <strong>{phone.value}</strong>
          </a>
        ) : (
          <strong>911</strong>
        )}{" "}
        (emergencias en Venezuela) o al número de emergencias de tu país si
        estás fuera, o acude a un centro cercano. Este espacio coordina apoyo
        psicológico por correo y no atiende crisis en tiempo real.{" "}
        <Link href="/emergencia">Ver líneas de ayuda</Link>.
      </span>
    </div>
  );
}
