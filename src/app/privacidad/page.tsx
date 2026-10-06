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
        <p className="muted">Última actualización: 6 de octubre de 2026</p>
        <p>
          Nido conecta a personas que buscan apoyo psicológico con profesionales
          y ofrece herramientas para organizar su consulta. Ayuda Terremoto
          mantiene su programa separado de acompañamiento gratuito. Nido no es
          un servicio de emergencias, no reemplaza atención médica, no garantiza
          disponibilidad inmediata y no ofrece diagnóstico ni tratamiento médico
          por sí mismo.
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
            <li>
              El contenido de tus conversaciones por chat con un profesional. Va
              cifrado de extremo a extremo: se cifra en tu dispositivo y se
              descifra solo en el de la otra persona, así que ni Nido puede
              leerlo. Se guarda mientras la conversación exista (es permanente
              hasta que tú o el profesional la borren); puedes retomarla incluso
              desde otro dispositivo, con un enlace de acceso a tu correo y tu
              código de recuperación.
            </li>
            <li>
              Un identificador técnico derivado de tu dirección IP (un código no
              reversible, no tu IP en claro), usado solo para prevenir abuso y
              limitar solicitudes repetidas.
            </li>
          </ul>
          <p>
            No pedimos documento de identidad, dirección exacta, historia
            clínica, diagnóstico ni información de pago. El formulario no te
            pide relatos detallados; lo que decidas escribir dentro del chat se
            guarda como parte de esa conversación privada entre tú y el
            profesional.
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
          <h2>3. Mensajes enviados al equipo</h2>
          <p>
            Si usas el formulario de contacto público, guardamos el motivo que
            eliges, tu nombre si decides darlo, tu correo, el mensaje, su estado
            de revisión y las fechas de seguimiento. También guardamos un código
            irreversible de la conexión, separado del usado en las solicitudes
            de ayuda, únicamente para limitar envíos repetidos. No guardamos tu
            dirección IP en claro.
          </p>
          <p>
            Si escribes desde el panel profesional, el nombre y correo se toman
            de tu cuenta para evitar suplantaciones. No debes incluir datos
            privados de las personas que acompañas.
          </p>
        </section>

        <section className="card">
          <h2>4. Cómo usamos los datos</h2>
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
          <h2>5. Quién puede ver los datos</h2>
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
          <h2>6. Ubicación</h2>
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
          <h2>Cuenta personal, consulta, notas y llamadas</h2>
          <p>
            Si creas una cuenta de paciente, guardamos tu nombre o alias, país,
            zona horaria, preferencias y los vínculos que hayas confirmado con
            tus conversaciones. Un correo sin verificar no da acceso a un chat.
            Tu panel muestra tus sesiones, solicitudes y pagos registrados;
            puedes descargar esos datos desde Preferencias.
          </p>
          <p>
            El profesional puede guardar notas privadas de su consulta. Se
            almacenan cifradas y su lectura en la aplicación se limita a ese
            profesional. Este cifrado protege el almacenamiento y es distinto
            del cifrado de extremo a extremo del chat. Soporte no puede leerlas
            desde su panel. Su conservación y las solicitudes sobre esos
            registros se coordinan con el profesional y el canal de privacidad.
          </p>
          <p>
            El profesional puede registrar una ficha mínima con tu conocimiento:
            nombre o alias, correo, país, zona horaria, estado del
            acompañamiento, sesiones y registros de pagos acordados. Estas
            fichas se guardan en la plataforma y no tienen el cifrado de extremo
            a extremo de los mensajes del chat. El acceso operativo se limita al
            profesional de la consulta; el equipo de soporte no recibe acceso a
            sus fichas clínicas desde su panel.
          </p>
          <p>
            Con tu conocimiento y autorización, el profesional también puede
            añadir sexo, fecha de nacimiento, motivo de consulta y notas
            generales a tu ficha. Son datos opcionales, se almacenan cifrados y
            solo el profesional de esa consulta puede abrirlos desde su cuenta.
            Las notas generales de la ficha se mantienen separadas de las notas
            de cada sesión. Este cifrado de almacenamiento es distinto del
            cifrado de extremo a extremo del chat.
          </p>
          <p>
            El orientador procesa el texto en tu navegador para sugerir áreas y
            perfiles. No guarda ese relato ni lo envía a un proveedor de IA.
            Puedes usar el directorio sin utilizar el orientador.
          </p>
          <p>
            Cuando se habiliten las llamadas integradas, el proveedor Daily
            procesa el audio y vídeo para realizar el encuentro. Las llamadas no
            tienen la misma protección de extremo a extremo que el chat. La
            grabación y la transcripción están desactivadas inicialmente: cada
            una requiere el permiso opcional y separado de ambas partes para esa
            sesión, con información sobre su finalidad y proveedores antes de
            activarla. Puedes continuar sin aceptar ninguna captura.
          </p>
          <p>
            Si cambias una preferencia durante una llamada, se cierra la sala
            para aplicar el cambio. Los archivos disponibles tienen un acceso
            privado y temporal. Se ocultan a los 30 días después del cierre de
            la ventana de la sesión y se programa su eliminación en el
            proveedor; una incidencia de borrado requiere seguimiento del
            equipo. No se utilizan para entrenar modelos ni se incorporan
            automáticamente a tu historia clínica. Puedes solicitar su
            eliminación antes de ese plazo.
          </p>
        </section>

        <section className="card">
          <h2>7. Retención y eliminación</h2>
          <p>
            Guardamos los datos solo durante el tiempo necesario para operar la
            plataforma, coordinar solicitudes, prevenir abuso y cumplir
            obligaciones legales si aplican.
          </p>
          <p>
            Las conversaciones de chat son permanentes: se conservan hasta que
            tú o el profesional las borren desde su lado. Borrar lleva la
            conversación a una papelera con deshacer de 7 días: durante ese
            plazo cualquiera de las dos partes puede recuperarla desde el
            enlace; al vencer, eliminamos todo su contenido (incluido el
            historial de mensajes) y el enlace deja de funcionar, sin vuelta
            atrás.
          </p>
          <p>
            <strong>Cifrado de extremo a extremo del chat.</strong> Los mensajes
            se cifran en el dispositivo de quien escribe y solo se descifran en
            el de la otra parte. Nido no puede leer el contenido, ni siquiera al
            guardarlo, y tampoco puede recuperarlo si se pierde la clave. Cada
            persona recibe un código de recuperación que es la única manera de
            leer su historial en un dispositivo nuevo; si se pierde, los
            mensajes ya cifrados dejan de poder leerse en ese dispositivo nuevo.
            El servidor sí conserva metadatos técnicos (quién participa, fechas
            y tamaño de los mensajes) para hacer funcionar el chat; nunca el
            texto.
          </p>
          <p>
            Las solicitudes de ayuda (el formulario) se cierran después de 90
            días sin actividad y se anonimizan después de 180 días, tomando la
            actividad del chat como reloj. El contenido del chat no se anonimiza
            automáticamente: vive en la conversación hasta que alguien la borre.
          </p>
          <p>
            Si compras un paquete de sesiones, guardamos el registro del pago
            (importe, concepto, fecha y correo de quien paga) para contabilidad
            y soporte. Los datos de tu tarjeta los procesa Stripe directamente:
            Nido nunca los ve ni los guarda. Si borras una conversación, el
            registro contable de los pagos ya hechos se conserva.
          </p>
          <p>
            Los mensajes enviados al equipo no se eliminan ni anonimizan de
            forma automática en la versión actual. Se conservan para dar
            seguimiento, incluso si una persona profesional borra su cuenta; en
            ese caso se desvinculan de su perfil. Puedes pedir que revisemos o
            eliminemos tus mensajes escribiendo al correo de privacidad.
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
          <h2>8. Seguridad</h2>
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
          <h2>9. Niñas, niños y adolescentes</h2>
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
          <h2>10. Emergencias</h2>
          <p>
            Nido no atiende emergencias en tiempo real. Si una persona está en
            peligro inmediato, debe llamar a emergencias locales o buscar ayuda
            presencial inmediata.
          </p>
        </section>

        <section className="card">
          <h2>11. Cambios a esta política</h2>
          <p>
            Podemos actualizar esta política. Si los cambios son importantes,
            los publicaremos en esta página.
          </p>
        </section>

        <section className="card">
          <h2>12. Contacto</h2>
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
