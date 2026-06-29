import { EmergencyNotice } from "@/components/emergency-notice";
import { getAbuseContactEmail } from "@/lib/contact";

export default function ResourcesPage() {
  const abuseEmail = getAbuseContactEmail();

  return (
    <section className="section">
      <div className="container">
        <h1>Recursos</h1>
        <EmergencyNotice />
        <div className="card">
          <h2>Recursos verificados para Venezuela</h2>
          <p className="muted">
            Pendiente: agregar recursos verificados por coordinación antes de
            publicar. No se incluyen teléfonos no verificados.
          </p>
          {/* TODO: Insertar recursos de emergencia y apoyo en Venezuela solo después de verificarlos. */}
        </div>
        <div className="card">
          <h2>Qué hace Nido</h2>
          <p>
            Nido ayuda a conectar solicitudes con profesionales
            voluntarios verificados. No atiende emergencias en tiempo real y no
            reemplaza atención médica presencial.
          </p>
        </div>
        <div className="card">
          <h2>Menores de edad</h2>
          <p>
            Nido no está diseñada como servicio dirigido a menores. Si una
            persona menor de edad necesita ayuda, debe buscar apoyo de un adulto
            responsable, servicios locales de emergencia o instituciones
            competentes.
          </p>
        </div>
        <div className="card">
          <h2>Reportar abuso</h2>
          <p>
            Para reportar abuso, uso indebido o una conducta insegura, escribe
            a: <a href={`mailto:${abuseEmail}`}>{abuseEmail}</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
