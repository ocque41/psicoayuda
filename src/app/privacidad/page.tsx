import type { Metadata } from "next";
import { getAbuseContactEmail, getPrivacyContactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description:
    "Cómo Nido recopila, usa y protege los datos de quienes piden ayuda y de los profesionales voluntarios. Pedimos la mínima información necesaria.",
  alternates: { canonical: "/privacidad" },
};

export default function PrivacyPage() {
  const privacyEmail = getPrivacyContactEmail();
  const abuseEmail = getAbuseContactEmail();

  return (
    <section className="section">
      <div className="container legal">
        <h1>Política de Privacidad</h1>
        <p className="muted">Última actualización: 29 de junio de 2026</p>
        <p>
          Nido es una plataforma gratuita para conectar personas que necesitan
          apoyo psicológico remoto con profesionales voluntarios verificados.
          Nido no es un servicio de emergencias, no reemplaza atención médica,
          no garantiza disponibilidad inmediata y no ofrece diagnóstico ni
          tratamiento médico por sí mismo.
        </p>

        <section className="card">
          <h2>1. Datos que recopilamos de personas que solicitan ayuda</h2>
          <p>Cuando una persona solicita ayuda, podemos recopilar:</p>
          <ul>
            <li>Correo electrónico de contacto.</li>
            <li>Idioma preferido.</li>
            <li>Ciudad, estado o país, si la persona los proporciona.</li>
            <li>
              Ubicación aproximada, solo si la persona acepta compartirla desde
              el navegador.
            </li>
            <li>Categoría general de necesidad.</li>
            <li>Nivel de urgencia indicado por la persona.</li>
            <li>Fecha y hora de la solicitud.</li>
          </ul>
          <p>
            No pedimos documento de identidad, dirección exacta, historia
            clínica, diagnóstico, información de pago ni relatos detallados
            sobre la situación vivida.
          </p>
        </section>

        <section className="card">
          <h2>2. Datos que recopilamos de profesionales voluntarios</h2>
          <p>Cuando un profesional se registra, podemos recopilar:</p>
          <ul>
            <li>Nombre completo.</li>
            <li>Nombre visible.</li>
            <li>Correo electrónico.</li>
            <li>
              Datos básicos recibidos desde Google Sign-In, como identificador
              de cuenta, correo electrónico, nombre e imagen de perfil si están
              disponibles.
            </li>
            <li>País y ciudad.</li>
            <li>
              Número de licencia, credencial profesional o dato equivalente.
            </li>
            <li>País de emisión de la credencial.</li>
            <li>Idiomas.</li>
            <li>Áreas generales de apoyo.</li>
            <li>Disponibilidad remota.</li>
            <li>Capacidad máxima de solicitudes activas.</li>
            <li>Información de contacto para coordinación.</li>
            <li>Estado de verificación.</li>
          </ul>
          <p>
            Google Sign-In se usa solo para autenticar profesionales
            voluntarios. Las personas que solicitan ayuda no necesitan iniciar
            sesión con Google.
          </p>
        </section>

        <section className="card">
          <h2>3. Cómo usamos los datos</h2>
          <ul>
            <li>Recibir solicitudes de ayuda.</li>
            <li>Sugerir o asignar profesionales voluntarios disponibles.</li>
            <li>
              Verificar profesionales antes de permitirles recibir solicitudes.
            </li>
            <li>
              Coordinar contacto entre la persona solicitante y el profesional.
            </li>
            <li>Prevenir abuso, fraude o uso indebido de la plataforma.</li>
            <li>Mantener registros básicos de seguridad y operación.</li>
          </ul>
          <p>
            No vendemos datos personales. No usamos los datos para publicidad.
            No usamos los datos para entrenar sistemas de inteligencia
            artificial.
          </p>
        </section>

        <section className="card">
          <h2>4. Quién puede ver los datos</h2>
          <ul>
            <li>Administradores o coordinadores de Nido.</li>
            <li>
              Profesionales voluntarios aprobados, solo cuando una solicitud les
              sea asignada o sugerida.
            </li>
            <li>
              Proveedores técnicos necesarios para operar la plataforma, como
              alojamiento, base de datos, autenticación o correo electrónico.
            </li>
          </ul>
          <p>
            Los profesionales no verán solicitudes si no han sido aprobados por
            un administrador.
          </p>
        </section>

        <section className="card">
          <h2>5. Ubicación</h2>
          <p>
            La ubicación es opcional. Si una persona no desea compartir
            ubicación desde el navegador, puede escribir manualmente su ciudad o
            estado.
          </p>
          <p>
            La ubicación solo se usa para orientar la solicitud y mejorar la
            conexión con profesionales disponibles. No pedimos dirección exacta.
          </p>
        </section>

        <section className="card">
          <h2>6. Retención y eliminación</h2>
          <p>
            Guardamos los datos solo durante el tiempo necesario para operar la
            plataforma, coordinar solicitudes, prevenir abuso y cumplir
            obligaciones legales si aplican.
          </p>
          <p>
            Por defecto, las solicitudes inactivas deben cerrarse después de 30
            días y eliminarse o anonimizarse después de 90 días, salvo que sea
            necesario conservar registros mínimos por seguridad, prevención de
            abuso o razones legales.
          </p>
          <p>
            Tienes derecho a solicitar, en cualquier momento, acceder a los
            datos que guardamos sobre ti, corregirlos o pedir que los
            eliminemos. Atenderemos tu solicitud por correo.
          </p>
          <p>
            Una persona puede pedir eliminación de sus datos escribiendo a:{" "}
            <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
          </p>
        </section>

        <section className="card">
          <h2>7. Seguridad</h2>
          <p>
            Aplicamos medidas razonables para proteger los datos, incluyendo
            control de acceso administrativo, autenticación de profesionales,
            validación de formularios y protección de credenciales.
          </p>
          <p>
            Ningún sistema es completamente seguro. Por eso reducimos la
            información recopilada al mínimo necesario.
          </p>
        </section>

        <section className="card">
          <h2>8. Niñas, niños y adolescentes</h2>
          <p>
            Si eres menor de edad, también mereces ayuda y eres bienvenido/a.
            Cuando sea posible, te animamos a apoyarte en una persona adulta de
            confianza. Y si estás en peligro ahora mismo, no esperes: revisa las{" "}
            <a href="/emergencia">líneas de ayuda inmediata</a>, donde hay
            recursos con atención especial a niñas, niños y adolescentes.
          </p>
          <p className="hint">
            El tratamiento de datos de personas menores de edad y la actuación
            ante situaciones de riesgo (en línea con la LOPNNA) están pendientes
            de revisión por un profesional del derecho en Venezuela.
          </p>
        </section>

        <section className="card">
          <h2>9. Emergencias</h2>
          <p>
            Nido no atiende emergencias en tiempo real. Si una persona está en
            peligro inmediato, debe llamar a emergencias locales o buscar ayuda
            presencial inmediata.
          </p>
        </section>

        <section className="card">
          <h2>10. Cambios a esta política</h2>
          <p>
            Podemos actualizar esta política. Si los cambios son importantes,
            los publicaremos en esta página.
          </p>
        </section>

        <section className="card">
          <h2>11. Contacto</h2>
          <p>
            Para preguntas de privacidad o solicitudes de eliminación de datos,
            escribe a: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
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
