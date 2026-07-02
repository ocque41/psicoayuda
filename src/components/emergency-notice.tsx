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
        <strong>¿Es una emergencia?</strong> Si tu vida o la de alguien corre
        riesgo, llama ya al{" "}
        {phone ? (
          <a href={phone.href}>
            <strong>{phone.value}</strong>
          </a>
        ) : (
          <strong>911</strong>
        )}{" "}
        (o al de tu país). Aquí coordinamos apoyo por correo, no atendemos
        crisis en tiempo real.{" "}
        <Link href="/emergencia">Ver líneas de ayuda</Link>.
      </span>
    </div>
  );
}
