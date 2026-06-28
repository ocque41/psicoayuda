import { EmergencyNotice } from "@/components/emergency-notice";
import { HelpRequestForm } from "@/components/help-request-form";

export default function HelpPage() {
  return (
    <section className="section">
      <div className="container">
        <h1>Pedir ayuda</h1>
        <EmergencyNotice />
        <p className="muted">
          No cuentes una historia larga. Solo necesitamos datos mínimos para
          intentar conectarte con una persona voluntaria verificada.
        </p>
        <HelpRequestForm />
      </div>
    </section>
  );
}
