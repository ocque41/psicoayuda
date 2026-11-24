/**
 * Indicador "Paso X de 3" del alta profesional. Los pasos con nombre y la
 * expectativa clara de lo que falta suben la finalización de los flujos
 * multi-paso; nuestro embudo real perdía a más de la mitad de las cuentas
 * entre crearse y completar el perfil. El cuestionario de admisión es parte de
 * la solicitud: se anuncia desde el primer paso para que nadie lo pase por alto.
 */
export const REGISTRO_PASOS = [
  "Crea tu cuenta",
  "Completa tu perfil",
  "Responde el cuestionario",
] as const;

export function RegistroPasos({ actual }: { actual: 1 | 2 | 3 }) {
  const total = REGISTRO_PASOS.length;
  return (
    <ol className="registro-pasos" aria-label={`Paso ${actual} de ${total}`}>
      {REGISTRO_PASOS.map((titulo, i) => {
        const n = i + 1;
        const estado =
          n < actual ? "hecho" : n === actual ? "actual" : "pendiente";
        return (
          <li
            key={titulo}
            className={`registro-paso ${estado}`}
            aria-current={n === actual ? "step" : undefined}
          >
            <span className="registro-paso-num" aria-hidden="true">
              {n < actual ? "✓" : n}
            </span>
            <span className="registro-paso-textos">
              <span className="registro-paso-etiqueta">
                Paso {n} de {total}
              </span>
              <span className="registro-paso-titulo">{titulo}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
