import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pacto del voluntario y tu protección",
  description:
    "Cinco compromisos mutuos entre Nido y los profesionales voluntarios: servicio gratis, confidencialidad, límites claros y protecciones que cuidan a quien ayuda.",
  alternates: { canonical: "/pacto-voluntario" },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <h1>Pacto del voluntario y tu protección</h1>
        <p className="lead">
          Cuando aceptas acompañar a alguien a través de Nido, haces cinco
          promesas. Nosotros hacemos las mismas cinco de vuelta. Este pacto no
          es solo una lista de reglas: es la manera en que nos cuidamos
          mutuamente para que puedas ayudar con tranquilidad a quien más lo
          necesita.
        </p>

        <div className="notice">
          <p>
            <strong>Cómo encaja Nido en todo esto:</strong> Nido solo{" "}
            <strong>conecta</strong>. La atención ocurre fuera de la app, entre
            tú y la persona, por el medio que ustedes acuerden. Nido no es la
            consulta, no presencia las sesiones y{" "}
            <strong>no guarda historias clínicas</strong>. Lo que conversen es
            de ustedes.
          </p>
        </div>

        <h2>Las cinco atestaciones, como compromisos mutuos</h2>
        <p>
          Antes de recibir tu primera solicitud aceptas estas cinco
          afirmaciones. Aquí te contamos qué significa cada una para ti y qué
          asumimos nosotros del otro lado.
        </p>

        <div className="grid grid-2">
          <article className="card">
            <h3>1. El servicio es gratuito</h3>
            <p>
              <strong>Tú te comprometes a:</strong> acompañar sin cobrar nada a
              la persona, ni en dinero ni en especie, por la ayuda que ofreces a
              través de Nido.
            </p>
            <p>
              <strong>Nosotros nos comprometemos a:</strong> mantener Nido como
              un proyecto sin fines de lucro. Nunca te pediremos pagar por
              participar ni lucraremos con tu tiempo donado.
            </p>
          </article>

          <article className="card">
            <h3>2. No captar clientes pagos</h3>
            <p>
              <strong>Tú te comprometes a:</strong> no usar el espacio de Nido
              para conseguir pacientes de pago ni derivar a la persona a tu
              consulta privada como condición para seguir acompañándola.
            </p>
            <p>
              <strong>Nosotros nos comprometemos a:</strong> proteger ese
              vínculo de confianza. La persona llegó buscando apoyo gratuito y
              así lo cuidamos, sin presiones comerciales de ningún lado.
            </p>
          </article>

          <article className="card">
            <h3>3. Confidencialidad</h3>
            <p>
              <strong>Tú te comprometes a:</strong> guardar reserva sobre lo que
              la persona te confíe y manejar su información con el cuidado que
              exige tu ética profesional.
            </p>
            <p>
              <strong>Nosotros nos comprometemos a:</strong> pedir la mínima
              información necesaria y no vender datos. El chat de Nido se
              guarda, cifrado en tránsito, solo mientras la conversación está
              activa para que la persona pueda retomarla, y se elimina al
              anonimizar la solicitud (ver la{" "}
              <a href="/privacidad">política de privacidad</a>). Lo que ocurra
              por fuera de la app, fuera se queda.
            </p>
          </article>

          <article className="card">
            <h3>4. No es un servicio de emergencia</h3>
            <p>
              <strong>Tú te comprometes a:</strong> entender que Nido es
              acompañamiento, no una línea de crisis, y a orientar a la persona
              hacia recursos de emergencia cuando la situación lo amerite.
            </p>
            <p>
              <strong>Nosotros nos comprometemos a:</strong> ser claros con todo
              el mundo en que Nido no promete atención inmediata ni tiempos de
              respuesta. Nadie debe esperar de ti lo que la plataforma no
              ofrece.
            </p>
          </article>

          <article className="card">
            <h3>5. Solo dentro de tu competencia</h3>
            <p>
              <strong>Tú te comprometes a:</strong> trabajar dentro de tus áreas
              de formación y experiencia, y a derivar con honestidad cuando un
              caso exceda lo que puedes atender bien.
            </p>
            <p>
              <strong>Nosotros nos comprometemos a:</strong> verificar
              credenciales de forma manual, respetar tus límites y nunca
              presionarte para asumir casos fuera de tu competencia.
            </p>
          </article>
        </div>

        <h2>El “no es emergencia” también te protege a ti</h2>
        <p>
          Decir con claridad que Nido no es un servicio de emergencia no es solo
          honestidad con quien pide ayuda: es una protección para ti.
        </p>
        <div className="reassurance">
          <ul>
            <li>
              Nadie llega esperando que estés disponible las 24 horas, que
              respondas en minutos ni que resuelvas una crisis en tiempo real.
            </li>
            <li>
              Las expectativas quedan dichas desde el primer momento, para la
              persona y para ti. Eso reduce la carga y el riesgo de asumir más
              de lo que puedes sostener.
            </li>
            <li>
              Tu rol es acompañar dentro de tu competencia y orientar hacia
              recursos adecuados cuando haga falta, no cargar con una urgencia
              vital sobre tus hombros.
            </li>
          </ul>
        </div>
        <p>
          Si en algún momento una persona está en peligro inmediato, lo correcto
          es orientarla hacia ayuda urgente. Para eso existen estas referencias:
        </p>
        <p>
          <Link className="button secondary" href="/emergencia">
            Ver qué hacer ante una emergencia
          </Link>{" "}
          <Link className="button secondary" href="/recursos">
            Recursos y líneas de atención
          </Link>
        </p>

        <h2>Dos cosas que te recomendamos (sin obligarte)</h2>
        <p>
          Estas no son condiciones para ser voluntario, sino buenas prácticas
          que te cuidan a ti y a la persona que acompañas.
        </p>

        <div className="grid grid-2">
          <article className="card">
            <h3>Una póliza de responsabilidad civil profesional</h3>
            <p>
              Como en cualquier ejercicio de tu profesión, contar con un seguro
              de responsabilidad civil profesional te da respaldo y
              tranquilidad. Es una recomendación, no un requisito de Nido.
            </p>
            <p className="hint">
              Texto pendiente de revisión por un profesional del derecho en
              Venezuela.
            </p>
          </article>

          <article className="card">
            <h3>Un consentimiento informado con la persona</h3>
            <p>
              Acordar por escrito el encuadre del acompañamiento —qué es, qué no
              es y sus límites— protege a ambas partes. Ofreceremos una
              plantilla orientativa para que la adaptes; tú decides cómo y
              cuándo usarla con cada persona.
            </p>
            <p className="hint">
              Texto pendiente de revisión por un profesional del derecho en
              Venezuela.
            </p>
          </article>
        </div>

        <div className="notice">
          <p>
            La relación de cuidado se da entre tú y la persona, fuera de la app.
            Por eso el encuadre, la confidencialidad y el consentimiento los
            sostienes tú con tu ética y tu criterio profesional. Nido te conecta
            y te respalda; no sustituye tu juicio clínico.
          </p>
          <p className="hint">
            Esta página es informativa y está pendiente de revisión por un
            profesional del derecho en Venezuela.
          </p>
        </div>

        <h2>¿Listo para acompañar?</h2>
        <p>
          Si compartes estos compromisos, este es tu lugar. Aquí ayudas a quien
          más lo necesita, dentro de límites claros y con respaldo.
        </p>
        <p>
          <Link className="button human" href="/pro">
            Quiero ser voluntario
          </Link>
        </p>
        <p className="muted">
          ¿Tienes dudas antes de empezar? Mira{" "}
          <Link href="/como-funciona">cómo funciona</Link>, nuestras{" "}
          <Link href="/preguntas-frecuentes">preguntas frecuentes</Link> o{" "}
          <Link href="/seguridad">cómo cuidamos la seguridad</Link>.
        </p>
      </div>
    </section>
  );
}
