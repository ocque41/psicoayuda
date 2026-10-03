import type { Metadata } from "next";
import Link from "next/link";
import { WorkspaceIcon } from "@/components/workspace/icon";
import { ProductPreview } from "@/components/workspace/product-preview";

export const metadata: Metadata = {
  title: "Nido para psicólogos",
  description:
    "Agenda, pacientes, notas, mensajes y servicios en un espacio para tu consulta. Crea tu perfil y empieza con Nido.",
  alternates: { canonical: "/para-psicologos" },
};
export default function ProfessionalLanding() {
  return (
    <div className="nido-marketing professional-marketing">
      <section className="marketing-hero">
        <div className="container marketing-hero-grid">
          <div className="marketing-hero-copy">
            <p className="eyebrow">
              <span className="marketing-live-dot" aria-hidden="true" />
              Nido para psicólogos
            </p>
            <h1>
              Tu atención,
              <br />
              <span>donde importa.</span>
            </h1>
            <p className="lead">
              Dale orden a tu consulta. Un espacio para gestionar tu agenda,
              conocer nuevos pacientes y dar continuidad a cada acompañamiento.
            </p>
            <div className="marketing-hero-actions">
              <Link
                className="button"
                href="/entrar?modo=registro&rol=profesional"
              >
                Crear mi perfil<span aria-hidden="true">↗</span>
              </Link>
              <Link className="marketing-text-link" href="/pro">
                Entrar a mi consulta<span aria-hidden="true">→</span>
              </Link>
            </div>
            <p>
              <Link className="marketing-text-link" href="/demo/consulta">
                Explorar mi consulta con el pajarito
                <span aria-hidden="true">→</span>
              </Link>
            </p>
            <div className="marketing-trust">
              <span>
                <WorkspaceIcon name="calendar" />
                Prueba de 90 días
              </span>
              <span>
                <WorkspaceIcon name="payment" />
                Sin tarjeta
              </span>
            </div>
            <p className="marketing-hero-context">
              Revisamos tu perfil y tus credenciales antes de recibir
              solicitudes. El ámbito de ejercicio se confirma por país.
            </p>
          </div>
          <ProductPreview professional />
        </div>
      </section>
      <section
        className="marketing-principles"
        aria-label="Organiza tu práctica"
      >
        <div className="container">
          <span>Tu consulta, conectada.</span>
          <p>Una ficha por paciente.</p>
          <p>Un próximo paso claro.</p>
          <p>A tu manera de trabajar.</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="marketing-section-heading">
            <div>
              <p className="eyebrow">De lo disperso a lo sencillo</p>
              <h2>
                Todo empieza
                <br />
                por tu paciente.
              </h2>
            </div>
            <p>
              Abre una ficha y encuentra el contexto que necesitas para
              organizar la siguiente sesión.
            </p>
          </div>
          <div className="marketing-feature-grid">
            <article>
              <WorkspaceIcon name="calendar" />
              <h3>Una agenda con contexto</h3>
              <p>
                Programa encuentros, consulta tu mes y presenta cada sesión en
                la zona horaria correspondiente.
              </p>
            </article>
            <article>
              <WorkspaceIcon name="people" />
              <h3>Una ficha, un próximo paso</h3>
              <p>
                Organiza el contacto, sesiones, notas y seguimiento. Abre su
                conversación desde la misma ficha.
              </p>
            </article>
            <article>
              <WorkspaceIcon name="leaf" />
              <h3>Servicios a tu manera</h3>
              <p>
                Define duración, sesiones, paquetes y condiciones para la forma
                en que acompañas.
              </p>
            </article>
            <article>
              <WorkspaceIcon name="message" />
              <h3>Mensajes que siguen contigo</h3>
              <p>
                Conserva las conversaciones y libera los cupos sin respuesta
                para atender nuevas solicitudes.
              </p>
            </article>
            <article>
              <WorkspaceIcon name="payment" />
              <h3>Cobros en orden</h3>
              <p>
                Registra los pagos que acuerdas por fuera de Nido y consulta sus
                importes por moneda.
              </p>
            </article>
            <article>
              <WorkspaceIcon name="help" />
              <h3>Un equipo para orientarte</h3>
              <p>
                Pregunta por tu perfil, tu verificación o la plataforma y recibe
                respuestas dentro de tu consulta.
              </p>
            </article>
          </div>
          <p className="marketing-feature-note">
            Las llamadas integradas y los cobros con tarjeta dependen de la
            disponibilidad y configuración de sus proveedores. Su estado y las
            opciones disponibles se muestran en tu consulta.
          </p>
        </div>
      </section>
      <section className="section marketing-how">
        <div className="container">
          <div className="marketing-section-heading">
            <div>
              <p className="eyebrow">Un inicio acompañado</p>
              <h2>
                Tu próximo espacio
                <br />
                empieza aquí.
              </h2>
            </div>
            <p>
              Un recorrido de preguntas breves, con tiempo para revisar cada
              respuesta antes de enviarla.
            </p>
          </div>
          <div className="marketing-steps">
            <article>
              <div className="marketing-step-symbol">
                <WorkspaceIcon name="profile" />
                <span>01</span>
              </div>
              <h3>Presenta tu práctica</h3>
              <p>
                Cuéntanos cómo acompañas, tus áreas de trabajo y las formas de
                encontrarte.
              </p>
            </article>
            <article>
              <div className="marketing-step-symbol">
                <WorkspaceIcon name="people" />
                <span>02</span>
              </div>
              <h3>Completa la revisión</h3>
              <p>
                El equipo revisa tu identidad y credenciales, y confirma el
                ámbito de cada país solicitado.
              </p>
            </article>
            <article>
              <div className="marketing-step-symbol">
                <WorkspaceIcon name="calendar" />
                <span>03</span>
              </div>
              <h3>Organiza tu consulta</h3>
              <p>
                Configura horario y servicios. Dale a tus pacientes un espacio
                claro para continuar.
              </p>
            </article>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container professional-start">
          <p className="eyebrow">Más claridad para acompañar</p>
          <h2>
            Haz espacio para
            <br />
            tu forma de trabajar.
          </h2>
          <p>Empieza con 90 días del software. Sin tarjeta para probar.</p>
          <Link className="button" href="/entrar?modo=registro&rol=profesional">
            Crear mi perfil profesional<span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
