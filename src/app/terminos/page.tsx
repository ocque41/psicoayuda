import type { Metadata } from "next";
import Link from "next/link";
import { getAbuseContactEmail, getPrivacyContactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Términos de Servicio",
  description:
    "Términos de uso de Nido, la plataforma que conecta a personas con profesionales de psicología y permite organizar el acompañamiento.",
  alternates: { canonical: "/terminos" },
};

export default function TermsPage() {
  const contactEmail = getPrivacyContactEmail();
  const abuseEmail = getAbuseContactEmail();

  return (
    <section className="section">
      <div className="container legal">
        <h1>Términos de Servicio</h1>
        <p className="muted">Última actualización: 2 de octubre de 2026</p>
        <p>
          Estos términos regulan el uso de Nido para encontrar profesionales de
          psicología, contactar con ellos y organizar el acompañamiento. Ayuda
          Terremoto es un programa separado de acompañamiento voluntario
          gratuito.
        </p>
        <p>Al usar Nido, aceptas estos términos.</p>

        <section className="card">
          <h2>1. Naturaleza del servicio</h2>
          <p>
            <strong>Nido solo conecta.</strong> No presta terapia ni atención
            psicológica y no forma parte de la relación clínica. La atención la
            brinda la psicóloga o el psicólogo elegido, mediante los canales
            acordados, que es responsable de la atención que ofrezca.
          </p>
          <p>
            Nido es una plataforma de conexión y coordinación. No es un servicio
            de emergencias, no es un hospital, no es una clínica, no garantiza
            atención inmediata y no reemplaza diagnóstico, tratamiento médico,
            psicoterapia formal ni atención presencial.
          </p>
          <p>
            El directorio permite iniciar el contacto. Las condiciones de la
            consulta se acuerdan con el profesional antes de contratarla. El
            software profesional tiene su propia prueba y suscripción, separada
            del precio de las sesiones. Ayuda Terremoto no condiciona el
            acompañamiento a ningún pago.
          </p>
        </section>

        <section className="card">
          <h2>Condiciones de sesiones y software</h2>
          <p>
            Antes de aceptar un acompañamiento, revisa el importe, moneda,
            duración, sesiones incluidas, vigencia y condiciones de cancelación
            acordadas con tu profesional. Si se habilita una suscripción con
            tarjeta, se indica expresamente su renovación y cómo cancelarla.
            Cancelar futuras renovaciones no implica el reembolso automático de
            sesiones ya abonadas. Las ausencias y cambios de fecha no generan
            penalizaciones automáticas en Nido.
          </p>
          <p>
            Los pagos externos se coordinan directamente con el profesional.
            Nido registra su confirmación sin custodiar ese dinero. Cuando un
            cobro por tarjeta esté habilitado para el profesional, lo procesa
            Stripe; la plataforma no recibe los datos de la tarjeta. Los
            reembolsos e incidencias requieren revisión y las condiciones
            acordadas no limitan los derechos legalmente aplicables.
          </p>
          <p>
            La prueba del software profesional dura 90 días desde su activación
            y no inicia cobros por sí sola. Contratar una suscripción requiere
            aceptar el importe y la frecuencia. Los servicios de videollamada y
            captura tienen sus propias condiciones de disponibilidad. Ninguna
            suscripción garantiza un número de pacientes.
          </p>
          <p>
            Cada profesional debe acreditar su habilitación y verificar las
            condiciones para atender en el país donde se encuentre el paciente.
            La atención a menores requiere confirmar la representación y las
            condiciones de consentimiento aplicables.
          </p>
        </section>

        <section className="card">
          <h2>2. Emergencias</h2>
          <p>
            Si estás en peligro inmediato, llama a emergencias locales o busca
            ayuda presencial ahora.
          </p>
          <p>
            Nido no debe usarse para situaciones que requieran respuesta
            inmediata, rescate, protección física, atención médica urgente o
            intervención de emergencia.
          </p>
        </section>

        <section className="card">
          <h2>3. Personas que solicitan ayuda</h2>
          <p>Al enviar una solicitud, declaras que:</p>
          <ul>
            <li>Proporcionas un correo electrónico de contacto válido.</li>
            <li>
              Entiendes que Nido intentará conectarte con un profesional
              voluntario disponible.
            </li>
            <li>
              Entiendes que no hay garantía de respuesta inmediata ni de
              disponibilidad.
            </li>
            <li>
              Aceptas que un coordinador o profesional aprobado pueda
              contactarte usando la información proporcionada.
            </li>
          </ul>
          <p>
            No debes enviar información falsa, abusiva, amenazante o que ponga
            en riesgo a otras personas.
          </p>
        </section>

        <section className="card">
          <h2>4. Profesionales voluntarios</h2>
          <p>Los profesionales que se registran declaran que:</p>
          <ul>
            <li>La información enviada es verdadera.</li>
            <li>
              Sus credenciales, licencia o formación profesional son reales.
            </li>
            <li>Solo ofrecerán apoyo dentro de sus competencias.</li>
            <li>
              No cobrarán por la ayuda de la emergencia ni condicionarán el
              apoyo gratuito a la contratación de servicios pagos.
            </li>
            <li>
              Si ofrecen servicios pagos por otros temas, no presionarán a nadie
              para contratarlos ni harán publicidad engañosa.
            </li>
            <li>Mantendrán confidencialidad sobre la información recibida.</li>
            <li>Cumplirán las leyes y normas profesionales aplicables.</li>
          </ul>
          <p>
            Nido puede aprobar, rechazar, suspender o eliminar cuentas
            profesionales a su criterio, especialmente si hay dudas sobre
            identidad, credenciales, conducta o seguridad.
          </p>
        </section>

        <section className="card">
          <h2>5. Verificación</h2>
          <p>
            La verificación de profesionales reduce riesgos, pero no garantiza
            calidad, disponibilidad, resultados, conducta profesional ni
            idoneidad para cada situación.
          </p>
          <p>
            Nido puede revisar credenciales manualmente y solicitar información
            adicional antes de aprobar a un profesional.
          </p>
        </section>

        <section className="card">
          <h2>6. Uso prohibido</h2>
          <ul>
            <li>Cobrar a personas contactadas mediante Nido.</li>
            <li>Usar la plataforma para fraude, abuso, acoso o explotación.</li>
            <li>Suplantar identidad.</li>
            <li>Enviar información falsa.</li>
            <li>
              Usar datos de personas solicitantes para publicidad, venta,
              campañas políticas, spam o fines ajenos al apoyo solicitado.
            </li>
            <li>
              Extraer, copiar o publicar datos personales de la plataforma.
            </li>
            <li>
              Presentar Nido como servicio oficial de emergencia si no lo es.
            </li>
          </ul>
        </section>

        <section className="card">
          <h2>7. Limitación de responsabilidad</h2>
          <p>
            Nido se ofrece de buena fe como herramienta de conexión y
            organización. En la medida permitida por la ley, Nido no se hace
            responsable por falta de disponibilidad, retrasos, errores,
            interrupciones, decisiones de profesionales, resultados de
            conversaciones o acciones tomadas fuera de la plataforma.
          </p>
          <p>
            Nada en estos términos excluye responsabilidades que no puedan
            excluirse legalmente.
          </p>
        </section>

        <section className="card">
          <h2>8. Privacidad</h2>
          <p>
            El uso de datos personales se describe en la{" "}
            <Link href="/privacidad">Política de Privacidad</Link>.
          </p>
        </section>

        <section className="card">
          <h2>9. Cambios al servicio</h2>
          <p>
            Podemos modificar, pausar o cerrar Nido si es necesario por razones
            técnicas, de seguridad, legales, operativas o de sostenibilidad.
          </p>
        </section>

        <section className="card">
          <h2>10. Contacto</h2>
          <p>
            Para preguntas sobre estos términos, escribe a:{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
          <p>
            Para reportar abuso o uso indebido, escribe a:{" "}
            <a href={`mailto:${abuseEmail}`}>{abuseEmail}</a>.
          </p>
        </section>
      </div>
    </section>
  );
}
