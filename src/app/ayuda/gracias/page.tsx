import type { Metadata } from "next";
import Link from "next/link";
import { sendRequestToProfessionals } from "@/app/actions-offers";
import { FocusHeading } from "@/components/focus-heading";
import { needLabels } from "@/lib/constants";
import { getFeedProfessionals } from "@/lib/feed";

export const metadata: Metadata = {
  title: "Recibimos tu mensaje",
  robots: { index: false, follow: true },
};

function label(map: Record<string, string>, code: string) {
  return map[code] ?? code;
}

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{
    solicitud?: string;
    enviado?: string;
    sin_seleccion?: string;
    sin_correo?: string;
  }>;
}) {
  const params = await searchParams;
  const solicitud = params.solicitud ?? "";
  // Param no confiable: descarta NaN para no pintar "… a NaN profesionales".
  const sentParsed = params.enviado ? Number(params.enviado) : null;
  const sent =
    sentParsed !== null && Number.isFinite(sentParsed) ? sentParsed : null;
  const professionals = solicitud ? await getFeedProfessionals() : [];

  return (
    <section className="section">
      <div className="container">
        <FocusHeading>Recibimos tu mensaje. No estás solo/a.</FocusHeading>

        {sent !== null && sent > 0 ? (
          <div className="notice">
            <p style={{ margin: 0 }}>
              <strong>
                Enviamos tu solicitud a {sent}{" "}
                {sent === 1 ? "profesional" : "profesionales"}.
              </strong>{" "}
              En cuanto alguien la acepte, te escribiremos a tu correo con un
              enlace para entrar a la conversación. No necesitas crear cuenta.
              Revisa también tu carpeta de spam.
            </p>
          </div>
        ) : sent === 0 ? (
          <div className="notice">
            <p style={{ margin: 0 }}>
              <strong>
                Ahora mismo no hay profesionales disponibles para recibir tu
                solicitud.
              </strong>{" "}
              Tu solicitud quedó registrada y nuestro equipo la revisará.
              Mientras tanto, mira los{" "}
              <Link href="/recursos">recursos de apoyo</Link> o, si estás en
              peligro, las{" "}
              <Link href="/emergencia">líneas de ayuda inmediata</Link>.
            </p>
          </div>
        ) : (
          <>
            {params.sin_seleccion ? (
              <p className="form-error" role="alert">
                Selecciona al menos un profesional, o usa “Enviar a todos”.
              </p>
            ) : null}

            {params.sin_correo ? (
              <div className="notice" role="alert">
                <p style={{ margin: 0 }}>
                  Para difundir tu solicitud necesitamos un correo donde
                  avisarte cuando alguien acepte. Vuelve a{" "}
                  <Link href="/ayuda">tu solicitud</Link> y agrégalo, o{" "}
                  <Link href="/profesionales">
                    habla directo por chat con un profesional
                  </Link>{" "}
                  (sin correo, ahora mismo).
                </p>
              </div>
            ) : null}

            <h2>Envía tu solicitud a las personas voluntarias</h2>
            <p className="muted">
              Puedes enviarla a todas las personas disponibles —responde quien
              pueda acompañarte— o elegir tú a quién. Solo comparten contigo el
              tipo de apoyo y la urgencia; tu correo se entrega únicamente a
              quien acepte.
            </p>

            {solicitud && professionals.length > 0 ? (
              <form action={sendRequestToProfessionals} className="offer-form">
                <input type="hidden" name="helpRequestId" value={solicitud} />
                <p>
                  <button
                    type="submit"
                    name="mode"
                    value="all"
                    className="button human"
                  >
                    Enviar a todos ({professionals.length})
                  </button>
                </p>
                <fieldset className="card">
                  <legend>O elige a quién enviar</legend>
                  <ul className="offer-list">
                    {professionals.map((p) => (
                      <li key={p.id}>
                        <label className="offer-option">
                          <input
                            type="checkbox"
                            name="professionalIds"
                            value={p.id}
                          />
                          <span>
                            <strong>{p.name}</strong>
                            {p.nonClinicalHelper ? (
                              <span
                                className="badge badge-new"
                                style={{
                                  marginLeft: 6,
                                  verticalAlign: "middle",
                                }}
                                title="Acompaña de forma no clínica; no es un profesional con licencia."
                              >
                                Auxiliar no clínico
                              </span>
                            ) : null}
                            {p.supportAreas.length > 0 ? (
                              <span className="muted">
                                {" "}
                                ·{" "}
                                {p.supportAreas
                                  .map((a) => label(needLabels, a))
                                  .join(", ")}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p>
                    <button
                      type="submit"
                      name="mode"
                      value="selected"
                      className="button secondary"
                    >
                      Enviar a los seleccionados
                    </button>
                  </p>
                </fieldset>
              </form>
            ) : (
              <p className="muted">
                Por ahora no hay profesionales disponibles. Tu solicitud quedó
                registrada y nuestro equipo la revisará; mientras tanto, mira
                los <Link href="/recursos">recursos</Link>.
              </p>
            )}
          </>
        )}

        <h2>Qué sigue ahora</h2>
        <ol className="steps">
          <li>Una persona voluntaria verificada revisará tu solicitud.</li>
          <li>Te escribirá a tu correo con un enlace a la conversación.</li>
          <li>Suele tomar unas horas, no es inmediato; revisa tu spam.</li>
        </ol>

        <p className="safety-note">
          Nido no es un servicio de emergencias. Si estás en peligro inmediato,
          llama al <strong>911</strong> o busca ayuda presencial ahora.{" "}
          <Link href="/emergencia">Más líneas de ayuda →</Link>
        </p>

        <p className="reassurance">
          Detrás de Nido hay psicólogas y psicólogos voluntarios reales que dan
          su tiempo para acompañar a personas como tú.
        </p>
      </div>
    </section>
  );
}
