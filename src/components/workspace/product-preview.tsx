import { WorkspaceIcon } from "./icon";

/** Original illustrative product composition; no real patient or performance data. */
export function ProductPreview({
  professional = false,
}: {
  professional?: boolean;
}) {
  return (
    <div
      className={`product-preview${professional ? " product-preview-professional" : ""}`}
      aria-hidden="true"
    >
      <div className="preview-orbit preview-orbit-one" />
      <div className="preview-orbit preview-orbit-two" />
      <svg
        className="preview-botanical"
        width="390"
        height="480"
        viewBox="0 0 390 480"
        fill="none"
      >
        <title>Composición decorativa de hojas</title>
        <path
          d="M199 434C225 334 239 198 171 81"
          stroke="#71856A"
          strokeWidth="2"
        />
        <path
          d="M215 345C277 348 319 304 325 246C274 243 227 284 215 345Z"
          fill="#AFC2A1"
        />
        <path
          d="M228 271C167 267 124 225 125 170C182 172 225 217 228 271Z"
          fill="#758B6A"
        />
        <path
          d="M205 177C254 157 275 119 271 63C220 83 199 119 205 177Z"
          fill="#C8D7BA"
        />
        <path
          d="M194 125C157 118 128 88 124 42C165 48 191 83 194 125Z"
          fill="#91A580"
        />
        <path
          d="m215 345 84-73m-71-1-76-71m53-23 46-82m-57 30-52-64"
          stroke="#536D4E"
          strokeWidth="1.2"
          opacity=".65"
        />
        <path
          d="M305 417C271 397 235 397 196 415C155 394 116 397 81 419C151 457 242 459 305 417Z"
          fill="#CFBCA0"
        />
        <path
          d="M106 420C171 398 243 403 282 423M118 432C177 416 229 420 267 434"
          stroke="#AA9272"
          strokeWidth="1.3"
        />
      </svg>
      <div className="preview-main-card">
        <div className="preview-card-top">
          <span className="preview-logo">
            <WorkspaceIcon name="leaf" />
          </span>
          <span>
            {professional ? "Tu consulta" : "Tu espacio"}
            <small>Nido</small>
          </span>
          <span className="preview-status-dot" />
        </div>
        <div className="preview-card-heading">
          <p>
            {professional
              ? "Agenda con contexto"
              : "Un próximo paso, a tu ritmo"}
          </p>
          <span>↗</span>
        </div>
        <div className="preview-calendar-week">
          {["L", "M", "M", "J", "V", "S", "D"].map((label, i) => (
            <span
              key={`${label}-${i === 0 ? "lun" : i === 1 ? "mar" : i === 2 ? "mie" : i === 3 ? "jue" : i === 4 ? "vie" : i === 5 ? "sab" : "dom"}`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="preview-calendar-dates">
          {[14, 15, 16, 17, 18, 19, 20].map((date) => (
            <span className={date === 17 ? "is-highlighted" : ""} key={date}>
              {date}
              {date === 17 ? <small /> : null}
            </span>
          ))}
        </div>
        <div className="preview-session">
          <span className="preview-session-icon">
            <WorkspaceIcon name="message" />
          </span>
          <div>
            <strong>
              {professional
                ? "Cada paciente, en su lugar"
                : "Tu próxima conversación"}
            </strong>
            <small>
              {professional
                ? "Sesiones · Notas · Seguimiento"
                : "Un espacio para escucharte"}
            </small>
          </div>
          <span>↗</span>
        </div>
        <p className="preview-caption">Vista ilustrativa del espacio Nido</p>
      </div>
      <div className="preview-floating-note">
        <span>✦</span>
        <p>
          {professional ? "Más claridad." : "Sin tener todas"}
          <br />
          <strong>
            {professional ? "Más tiempo para acompañar." : "las respuestas."}
          </strong>
        </p>
      </div>
      <div className="preview-bottom-note">
        <WorkspaceIcon name="leaf" />
        <span>
          {professional
            ? "Tu atención, donde importa"
            : "Tú decides el siguiente paso"}
        </span>
      </div>
    </div>
  );
}
