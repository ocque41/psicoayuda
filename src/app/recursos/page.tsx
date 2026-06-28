import { EmergencyNotice } from "@/components/emergency-notice";

export default function ResourcesPage() {
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
          <h2>Qué hace PsicoAyuda</h2>
          <p>
            PsicoAyuda ayuda a conectar solicitudes con profesionales
            voluntarios verificados. No atiende emergencias en tiempo real y no
            reemplaza atención médica presencial.
          </p>
        </div>
      </div>
    </section>
  );
}
