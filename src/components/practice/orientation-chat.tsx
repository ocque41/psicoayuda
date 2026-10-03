"use client";
import Link from "next/link";
import { useState } from "react";
import {
  type OrientationInput,
  type OrientationProfile,
  recommend,
} from "@/lib/practice/orientation";
export function OrientationChat({
  profiles,
  countries,
}: {
  profiles: OrientationProfile[];
  countries: string[];
}) {
  const [text, setText] = useState("");
  const [country, setCountry] = useState("Venezuela");
  const [language, setLanguage] = useState("es");
  const [ageGroup, setAgeGroup] =
    useState<OrientationInput["ageGroup"]>("adult");
  const [forWhom, setForWhom] = useState<OrientationInput["forWhom"]>("self");
  const [danger, setDanger] = useState<
    OrientationInput["immediateDanger"] | ""
  >("");
  const [result, setResult] = useState<ReturnType<typeof recommend> | null>(
    null,
  );
  const showCrisis =
    danger === "yes" || danger === "unsure" || result?.safetySignal;
  return (
    <div className="orientation-chat">
      <div className="orientation-message">
        <p>
          Hola. Puedo ayudarte a encontrar un profesional según lo que buscas y
          dónde estás. Puedes escribir poco o saltar directamente al directorio.
        </p>
        <p className="hint">
          Soy un asistente de orientación. No hago diagnósticos ni doy terapia.
          Lo que escribas aquí se procesa en este navegador y se elimina al
          salir; no se envía a un servicio de IA.
        </p>
      </div>
      <form
        className="practice-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!danger) return;
          setResult(
            recommend(
              {
                text,
                country,
                language,
                ageGroup,
                immediateDanger: danger,
                forWhom,
              },
              profiles,
            ),
          );
        }}
      >
        <label>
          ¿Buscas apoyo para ti o para alguien más?
          <select
            value={forWhom}
            onChange={(e) => {
              setForWhom(e.target.value as OrientationInput["forWhom"]);
              setResult(null);
            }}
          >
            <option value="self">Para mí</option>
            <option value="other">Para alguien más</option>
          </select>
        </label>
        <label>
          ¿La persona corre peligro inmediato o podría hacerse daño ahora?
          <select
            value={danger}
            required
            onChange={(e) => {
              setDanger(e.target.value as OrientationInput["immediateDanger"]);
              setResult(null);
            }}
          >
            <option value="" disabled>
              Elige una respuesta
            </option>
            <option value="no">No</option>
            <option value="unsure">No estoy seguro/a</option>
            <option value="yes">Sí</option>
          </select>
        </label>
        {showCrisis ? (
          <div className="card" role="alert">
            <h2>Busca ayuda humana ahora</h2>
            <p>
              Si hay peligro inmediato, contacta los servicios de emergencia de
              tu ubicación o acude a urgencias. Busca a una persona de confianza
              que pueda acompañarte mientras llega ayuda.
            </p>
            <p>
              Nido no atiende emergencias y este asistente no puede confirmar tu
              seguridad. No esperes una respuesta del catálogo.
            </p>
            <Link className="button human" href="/emergencia">
              Ver recursos por ubicación
            </Link>
          </div>
        ) : null}
        <label>
          País donde la persona recibirá atención
          <select
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setResult(null);
            }}
          >
            {countries.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Edad
          <select
            value={ageGroup}
            onChange={(e) => {
              setAgeGroup(e.target.value as OrientationInput["ageGroup"]);
              setResult(null);
            }}
          >
            <option value="adult">18 años o más</option>
            <option value="minor">Menor de 18 años</option>
          </select>
        </label>
        <label>
          Idioma
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setResult(null);
            }}
          >
            <option value="es">Español</option>
            <option value="en">Inglés</option>
          </select>
        </label>
        <label>
          ¿Qué te gustaría trabajar? (opcional)
          <textarea
            rows={4}
            maxLength={1500}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            placeholder="Por ejemplo: me cuesta dormir y estoy pasando por una ruptura."
          />
        </label>
        <p className="hint">
          Evita nombres completos, teléfonos, documentos y detalles íntimos. No
          hace falta contar toda tu historia para buscar apoyo.
        </p>
        <button className="button human" type="submit">
          Buscar profesionales afines
        </button>
      </form>
      {result && !result.safetySignal ? (
        <div className="orientation-message" aria-live="polite">
          <h2>Un próximo paso para ti</h2>
          {result.needsHumanReview ? (
            <p>
              Por lo que comentas, conviene hablar con una persona del equipo
              para revisar quién puede acompañarte.{" "}
              <Link href="/contacto">Pedir orientación humana</Link>
            </p>
          ) : null}
          {result.recommendations.length ? (
            <>
              <p>
                Estas opciones coinciden con las áreas que mencionas, el idioma
                y un ámbito de atención revisado por el equipo. La
                compatibilidad se confirma al hablar con el profesional.
              </p>
              {result.recommendations.map((p) => (
                <article className="card" key={p.id}>
                  <h3>{p.name}</h3>
                  <p>{p.reasons.join(" · ")}</p>
                  <Link
                    className="button secondary"
                    href={`/profesionales?q=${encodeURIComponent(p.name)}`}
                  >
                    Ver su perfil y contactar
                  </Link>
                </article>
              ))}
            </>
          ) : (
            <p>
              No tengo una coincidencia suficiente con los datos revisados.
              Puedes explorar los perfiles y consultar al equipo para encontrar
              opciones.
            </p>
          )}
          <Link href="/profesionales">Explorar todo el directorio →</Link>
        </div>
      ) : null}
      <p>
        <Link href="/profesionales">Prefiero elegir por mi cuenta →</Link>
      </p>
    </div>
  );
}
