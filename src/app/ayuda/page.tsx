import { EmergencyNotice } from "@/components/emergency-notice";
import { HelpRequestForm } from "@/components/help-request-form";

export default function HelpPage() {
  return (
    <section className="section">
      <div className="container">
        <h1>Cuéntanos cómo estás. Vamos a leerte.</h1>
        <ul className="trust-strip" aria-label="Garantías">
          <li>Gratis</li>
          <li>Confidencial</li>
          <li>Sin crear cuenta</li>
          <li>Voluntarios verificados</li>
        </ul>
        <p className="lead">
          Diste un paso importante al llegar aquí. Completar esto toma menos de
          un minuto y una persona voluntaria revisará tu mensaje.
        </p>
        <EmergencyNotice />
        <HelpRequestForm />
        <p className="reassurance">
          Detrás de Nido hay psicólogas y psicólogos voluntarios reales que
          dan su tiempo para acompañar a personas como tú.
        </p>
      </div>
    </section>
  );
}
