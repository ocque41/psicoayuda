/**
 * Indicador "Paso X de 2" del alta de voluntarios. Los pasos con nombre y la
 * expectativa clara de lo que falta suben la finalización de los flujos
 * multi-paso; nuestro embudo real perdía a más de la mitad de las cuentas
 * entre crearse y completar el perfil.
 */
export function RegistroPasos({ actual }: { actual: 1 | 2 }) {
  const pasos = ["Crea tu cuenta", "Completa tu perfil"];
  return (
    <ol className="registro-pasos" aria-label={`Paso ${actual} de 2`}>
      {pasos.map((titulo, i) => {
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
              <span className="registro-paso-etiqueta">Paso {n} de 2</span>
              <span className="registro-paso-titulo">{titulo}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
