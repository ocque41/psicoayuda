import type { Metadata } from "next";
import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";
import { EmergencyNotice } from "@/components/emergency-notice";
import { QuickExit, QuickExitNote } from "@/components/quick-exit";
import { getAbuseContactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Recursos de salud mental en Venezuela",
  description:
    "Recursos de salud mental y apoyo emocional para Venezuela, e información sobre cómo funciona el acompañamiento psicológico voluntario y gratuito de Nido.",
  alternates: { canonical: "/recursos" },
  openGraph: {
    title: "Recursos de salud mental en Venezuela | Nido",
    description:
      "Recursos de salud mental para Venezuela y cómo funciona el acompañamiento psicológico voluntario y gratuito de Nido.",
    url: "/recursos",
  },
};

export default function ResourcesPage() {
  const abuseEmail = getAbuseContactEmail();

  return (
    <section className="section">
      <div className="container">
        <QuickExit />
        <h1>Recursos de salud mental y apoyo psicológico en Venezuela</h1>
        <p className="lead">
          Aquí reunimos cómo conseguir apoyo psicológico gratuito a distancia en
          Venezuela y qué tener en cuenta antes de empezar.
        </p>
        <EmergencyNotice />

        <div className="card">
          <h2>Cómo recibir apoyo psicológico gratis con Nido</h2>
          <p>
            Cuéntanos cómo estás en un formulario breve. No necesitas crear
            cuenta ni dar tu ubicación. Una persona voluntaria verificada
            revisará tu mensaje y te escribirá a tu correo para acompañarte a
            distancia, sin coste.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
        </div>

        <div className="card">
          <h2>¿Cuándo buscar apoyo psicológico?</h2>
          <p>
            No hace falta estar en crisis para pedir ayuda. Hablar con alguien
            puede servir si te sientes con tristeza o angustia que no se va, si
            atraviesas un duelo, si el estrés o el insomnio te superan, o si
            simplemente necesitas que alguien te escuche. Pedir apoyo es un acto
            de cuidado, no de debilidad.
          </p>
        </div>

        <CrisisResources variant="full" />

        <div className="card">
          <h2>Qué hace Nido</h2>
          <p>
            Nido ayuda a conectar solicitudes con profesionales voluntarios
            verificados. No atiende emergencias en tiempo real y no reemplaza
            atención médica presencial. ¿Eres profesional de la salud mental?{" "}
            <Link href="/pro">Únete como voluntario/a</Link>.
          </p>
        </div>

        <div className="card">
          <h2>Guías de apoyo</h2>
          <p>
            Lecturas breves y cálidas, escritas con cuidado, para distintos
            momentos.
          </p>

          <h3>Cómo te sientes</h3>
          <ul>
            <li>
              <Link href="/recursos/ansiedad-despues-del-terremoto">
                Ansiedad y miedo después del terremoto: qué hacer
              </Link>
            </li>
            <li>
              <Link href="/recursos/depresion-senales-y-ayuda">
                Depresión: señales y cómo pedir ayuda en Venezuela
              </Link>
            </li>
            <li>
              <Link href="/recursos/ataque-de-panico-que-hacer">
                Ataque de pánico: qué hacer en el momento
              </Link>
            </li>
            <li>
              <Link href="/recursos/insomnio-como-dormir-mejor">
                Insomnio: cómo dormir mejor cuando la mente no para
              </Link>
            </li>
            <li>
              <Link href="/recursos/soledad-que-hacer">
                Soledad: qué hacer cuando te sientes solo/a
              </Link>
            </li>
            <li>
              <Link href="/recursos/autoestima-como-mejorarla">
                Autoestima baja: cómo empezar a quererte mejor
              </Link>
            </li>
            <li>
              <Link href="/recursos/estres-economico-y-salud-mental">
                Estrés económico: cómo cuidar tu salud mental
              </Link>
            </li>
            <li>
              <Link href="/recursos/estres-postraumatico-tept">
                Estrés postraumático (TEPT): cuándo el susto no se va
              </Link>
            </li>
            <li>
              <Link href="/recursos/duelo-perdida-de-un-ser-querido">
                Duelo: cómo sobrellevar la pérdida de un ser querido
              </Link>
            </li>
          </ul>

          <h3>Cómo conseguir apoyo</h3>
          <ul>
            <li>
              <Link href="/recursos/psicologo-online-gratis-venezuela">
                Psicólogo online gratis en Venezuela: cómo empezar
              </Link>
            </li>
            <li>
              <Link href="/recursos/apoyo-emocional-anonimo">
                Apoyo emocional gratis y anónimo, sin dar tu nombre
              </Link>
            </li>
          </ul>

          <h3>Acompañar y situaciones concretas</h3>
          <ul>
            <li>
              <Link href="/recursos/acompanar-a-alguien-en-crisis">
                Cómo acompañar a alguien que está pasando por un mal momento
              </Link>
            </li>
            <li>
              <Link href="/recursos/ayuda-psicologica-para-ninos">
                Ayuda psicológica gratis para niñas, niños y adolescentes
              </Link>
            </li>
            <li>
              <Link href="/recursos/venezolanos-en-el-exterior">
                Apoyo psicológico para venezolanos en el exterior
              </Link>
            </li>
          </ul>
        </div>

        <div className="card">
          <h2>Si eres menor de edad</h2>
          <p>
            También mereces ayuda y eres bienvenido/a. Pedir apoyo no te mete en
            problemas. Si puedes, busca a una persona adulta de confianza que te
            acompañe. Y si estás en peligro ahora mismo, mira las{" "}
            <Link href="/emergencia">líneas de ayuda inmediata</Link>: algunas
            atienden especialmente a niñas, niños y adolescentes.
          </p>
        </div>

        <div className="card">
          <h2>Reportar abuso</h2>
          <p>
            Para reportar abuso, uso indebido o una conducta insegura, escribe
            a: <a href={`mailto:${abuseEmail}`}>{abuseEmail}</a>.
          </p>
        </div>

        <QuickExitNote />
      </div>
    </section>
  );
}
