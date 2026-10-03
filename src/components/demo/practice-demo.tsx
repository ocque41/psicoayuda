"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { BirdGuide, type BirdGuideStep } from "./bird-guide";
import styles from "./practice-demo.module.css";

const patients = [
  {
    id: "ana",
    name: "Ana",
    initials: "AL",
    color: "sage",
    description: "Próximo encuentro por organizar",
  },
  {
    id: "luis",
    name: "Luis",
    initials: "LM",
    color: "sand",
    description: "Sesión de ejemplo confirmada",
  },
  {
    id: "carmen",
    name: "Carmen",
    initials: "CR",
    color: "rose",
    description: "Seguimiento de ejemplo",
  },
];
const steps: BirdGuideStep[] = [
  {
    id: "inicio",
    targetId: "demo-home",
    title: "Tu consulta empieza aquí",
    description:
      "Te acompaño a conocer tu espacio. Todo lo que ves en este recorrido son datos de ejemplo.",
  },
  {
    id: "agenda",
    targetId: "demo-agenda",
    title: "Haz espacio para cada encuentro",
    description:
      "Elige un día y prueba a programar una sesión. La agenda reúne el horario y el paciente, con un próximo paso claro.",
  },
  {
    id: "pacientes",
    targetId: "demo-pacientes",
    title: "Una ficha, todo su contexto",
    description:
      "Elige una persona de ejemplo. Su ficha reúne los encuentros, las notas y la conversación que necesitas para continuar.",
  },
  {
    id: "notas",
    targetId: "demo-notas",
    title: "Prepara el próximo paso",
    description:
      "Prueba a escribir y guardar una nota de ejemplo. En tu consulta, tus notas profesionales tienen su propio espacio privado.",
  },
  {
    id: "mensajes",
    targetId: "demo-mensajes",
    title: "La conversación sigue contigo",
    description:
      "Añade un mensaje de ejemplo y conoce cómo se organiza el chat. Esta demostración no envía mensajes a ninguna persona.",
  },
  {
    id: "cobros",
    targetId: "demo-cobros",
    title: "Los registros, con todo claro",
    description:
      "Prueba a registrar un pago de ejemplo. Los importes se muestran por moneda y separados de las condiciones de cada encuentro.",
  },
  {
    id: "cierre",
    targetId: "demo-cierre",
    title: "Ahora, a tu manera",
    description:
      "Puedes seguir explorando o crear tu perfil profesional. Tu práctica real empezará con el recorrido de incorporación y revisión.",
  },
];
const icons: Record<string, string> = {
  inicio: "M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7",
  agenda: "M5 5h14v16H5zM8 3v4m8-4v4M5 10h14M8 14h2m4 0h2m-8 3h2",
  pacientes:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7m2 10v-2a4 4 0 0 0-3-3.9",
  notas: "M5 3h14v18H5zM8 8h8m-8 4h8m-8 4h5",
  mensajes:
    "M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4zM7 9h10m-10 4h6",
  cobros: "M3 6h18v14H3zM3 10h18m-14 6h4",
};
type DemoSession = { id: string; patient: string; date: string };
type DemoReceipt = {
  id: string;
  amountCents: number;
  currency: string;
  method: string;
};
const money = (amountCents: number, currency: string) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency }).format(
    amountCents / 100,
  );

export function PracticeDemo({ initialMonth }: { initialMonth: string }) {
  const [active, setActive] = useState("inicio");
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState("09");
  const [patientId, setPatientId] = useState("ana");
  const [sessions, setSessions] = useState<DemoSession[]>([
    { id: "ejemplo-1", patient: "ana", date: `${initialMonth}-09T10:00` },
    { id: "ejemplo-2", patient: "luis", date: `${initialMonth}-13T16:00` },
  ]);
  const [drafts, setDrafts] = useState<Record<string, string>>({
    ana: "Una nota de ejemplo para preparar el próximo encuentro.",
  });
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState([
    {
      id: "chat-1",
      patient: "ana",
      role: "patient",
      text: "Hola, ¿podemos confirmar nuestra sesión de ejemplo?",
    },
    {
      id: "chat-2",
      patient: "ana",
      role: "professional",
      text: "Claro. A las diez está reservado para nuestro encuentro de ejemplo.",
    },
  ]);
  const [messageDraft, setMessageDraft] = useState("");
  const [receipts, setReceipts] = useState<DemoReceipt[]>([
    {
      id: "pago-1",
      amountCents: 2500,
      currency: "USD",
      method: "Pago externo de ejemplo",
    },
  ]);
  const [notice, setNotice] = useState<{
    area: string;
    message: string;
  } | null>(null);
  const [modal, setModal] = useState<"session" | "receipt" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const modalOpener = useRef<HTMLElement | null>(null);
  const chat = useRef<HTMLDivElement>(null);
  const latestMessageId = messages.at(-1)?.id;
  const patient = patients.find((p) => p.id === patientId) || patients[0];
  const [year, monthNumber] = month.split("-").map(Number);
  const monthDate = new Date(Date.UTC(year, monthNumber - 1, 1));
  const firstDay = (monthDate.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat("es-VE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthDate);
  const selectedSessions = sessions
    .filter((s) => s.date.startsWith(`${month}-${selectedDay}`))
    .sort((a, b) => a.date.localeCompare(b.date));
  useEffect(() => {
    if (latestMessageId && chat.current)
      chat.current.scrollTop = chat.current.scrollHeight;
  }, [latestMessageId]);
  useEffect(() => {
    if (modal && dialog.current && !dialog.current.open)
      dialog.current.showModal();
    if (!modal && dialog.current?.open) dialog.current.close();
  }, [modal]);
  function openModal(kind: "session" | "receipt", opener: HTMLElement) {
    modalOpener.current = opener;
    setModal(kind);
  }
  function closeModal() {
    setModal(null);
  }
  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    if (next.getUTCFullYear() < 2000 || next.getUTCFullYear() > 2099) return;
    setMonth(next.toISOString().slice(0, 7));
    setSelectedDay("09");
  }
  function saveExample(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (modal === "session") {
      const date = String(form.get("date") || ""),
        selectedPatient = String(form.get("patient") || "ana");
      if (
        !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date) ||
        !patients.some((p) => p.id === selectedPatient)
      )
        return;
      const start = Date.parse(`${date}:00Z`);
      if (!Number.isFinite(start)) return;
      if (
        sessions.some(
          (s) => Math.abs(Date.parse(`${s.date}:00Z`) - start) < 50 * 60_000,
        )
      ) {
        setNotice({
          area: "modal",
          message:
            "Ese horario coincide con otra sesión de 50 minutos. Elige otro horario.",
        });
        return;
      }
      setSessions((previous) => [
        ...previous,
        { id: crypto.randomUUID(), patient: selectedPatient, date },
      ]);
      setMonth(date.slice(0, 7));
      setSelectedDay(date.slice(8, 10));
      setNotice({
        area: "agenda",
        message:
          "Sesión de ejemplo guardada. Ya aparece en la agenda de esta demo.",
      });
    } else {
      const amount = Number(form.get("amount")),
        currency = String(form.get("currency") || "USD");
      if (
        !Number.isFinite(amount) ||
        amount < 0.01 ||
        amount > 9999 ||
        !["USD", "EUR", "VES"].includes(currency)
      )
        return;
      setReceipts((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          amountCents: Math.round(amount * 100),
          currency,
          method: "Registro externo de ejemplo",
        },
      ]);
      setNotice({
        area: "cobros",
        message: "Registro de ejemplo añadido. Esta demo no mueve dinero.",
      });
    }
    closeModal();
  }
  return (
    <section className={`section ${styles.demo}`}>
      <div className="container">
        <div className={styles.intro} id="demo-home">
          <div>
            <p className="eyebrow">Un recorrido por tu próxima consulta</p>
            <h1>Hazte un lugar en Nido.</h1>
            <p className="lead">
              Explora tu práctica con ejemplos. Nuestro pajarito te acompaña, un
              paso a la vez.
            </p>
          </div>
          <div className={styles.guideStart}>
            <BirdGuide
              steps={steps}
              onStepChange={(step) => setActive(step.id)}
            />
            <span className={styles.demoBadge}>Demo · datos de ejemplo</span>
          </div>
        </div>
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <p className={styles.sidebarTitle}>
              Tu consulta <span>de ejemplo</span>
            </p>
            <nav
              aria-label="Secciones de la demostración"
              className={styles.menu}
            >
              {steps.slice(0, 6).map((step) => (
                <a
                  key={step.id}
                  href={`#${step.targetId}`}
                  aria-current={active === step.id ? "location" : undefined}
                  onClick={() => setActive(step.id)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d={icons[step.id]} />
                  </svg>
                  <span>
                    {step.id === "inicio"
                      ? "Mi consulta"
                      : step.title === "Haz espacio para cada encuentro"
                        ? "Agenda"
                        : step.id === "pacientes"
                          ? "Pacientes"
                          : step.id === "notas"
                            ? "Notas"
                            : step.id === "mensajes"
                              ? "Mensajes"
                              : "Cobros"}
                  </span>
                </a>
              ))}
            </nav>
            <p className={styles.localHint}>
              Puedes probar los controles. Los ejemplos se conservan mientras
              estés en esta página.
            </p>
            <Link href="/pro/consulta" className={styles.back}>
              Volver a mi consulta ↗
            </Link>
          </aside>
          <div className={styles.panels}>
            <section
              className={styles.panel}
              id="demo-agenda"
              aria-labelledby="demo-agenda-title"
            >
              <div className={styles.panelHead}>
                <div>
                  <p className="kicker">Tu próximo encuentro</p>
                  <h2 id="demo-agenda-title">Una agenda con contexto.</h2>
                </div>
                <button
                  type="button"
                  className="button human"
                  onClick={(e) => {
                    setNotice(null);
                    openModal("session", e.currentTarget);
                  }}
                >
                  Programar sesión
                </button>
              </div>
              <div className={styles.calendarHeader}>
                <button
                  type="button"
                  aria-label="Mes anterior"
                  onClick={() => shiftMonth(-1)}
                >
                  ←
                </button>
                <h3>{monthLabel}</h3>
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  onClick={() => shiftMonth(1)}
                >
                  →
                </button>
              </div>
              <fieldset
                className={styles.calendar}
                aria-label={`Calendario de ejemplo, ${monthLabel}`}
              >
                {[
                  "Lunes",
                  "Martes",
                  "Miércoles",
                  "Jueves",
                  "Viernes",
                  "Sábado",
                  "Domingo",
                ].map((day) => (
                  <span className={styles.weekday} key={day} title={day}>
                    {day.charAt(0)}
                  </span>
                ))}
                {Array.from({ length: firstDay }, (_, i) => `offset-${i}`).map(
                  (offset) => (
                    <span key={offset} aria-hidden="true" />
                  ),
                )}
                {Array.from({ length: days }, (_, i) => {
                  const day = String(i + 1).padStart(2, "0"),
                    hasSession = sessions.some((s) =>
                      s.date.startsWith(`${month}-${day}`),
                    );
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selectedDay === day}
                      aria-label={`${i + 1} de ${monthLabel}${hasSession ? ", con sesión de ejemplo" : ""}`}
                      onClick={() => setSelectedDay(day)}
                    >
                      <span>{i + 1}</span>
                      {hasSession ? <i aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </fieldset>
              <div className={styles.dayList}>
                <p className="kicker">
                  Día {Number(selectedDay)} · zona de ejemplo: América/Caracas
                </p>
                {selectedSessions.length ? (
                  selectedSessions.map((s) => (
                    <div key={s.id} className={styles.session}>
                      <span className={styles.sessionTime}>
                        {s.date.slice(11)}
                      </span>
                      <div>
                        <strong>
                          {patients.find((p) => p.id === s.patient)?.name} ·
                          ejemplo
                        </strong>
                        <p>Sesión en línea · 50 minutos</p>
                      </div>
                      <span className="workspace-tag">Confirmada</span>
                    </div>
                  ))
                ) : (
                  <p className={styles.empty}>
                    Este día tiene espacio para un próximo encuentro.
                  </p>
                )}
              </div>
              {notice?.area === "agenda" ? (
                <p role="status" className={styles.notice}>
                  {notice.message}
                </p>
              ) : null}
            </section>
            <section
              className={styles.panel}
              id="demo-pacientes"
              aria-labelledby="demo-patients-title"
            >
              <p className="kicker">Personas primero</p>
              <h2 id="demo-patients-title">Todo empieza por tu paciente.</h2>
              <p className="hint">
                Elige una ficha de ejemplo para organizar sus notas y próximos
                pasos.
              </p>
              <div className={styles.patientCards}>
                {patients.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={styles.patientCard}
                    aria-pressed={patientId === p.id}
                    onClick={() => {
                      setPatientId(p.id);
                      setMessageDraft("");
                      setNotice(null);
                    }}
                  >
                    <span className={`${styles.avatar} ${styles[p.color]}`}>
                      {p.initials}
                    </span>
                    <strong>{p.name} · ejemplo</strong>
                    <span>{p.description}</span>
                    <span className={styles.openPatient}>Abrir ficha ↗</span>
                  </button>
                ))}
              </div>
              <div className={styles.patientContext}>
                <span className={styles.avatar}>{patient.initials}</span>
                <div>
                  <strong>La ficha de {patient.name}</strong>
                  <p>
                    Notas de ejemplo y un próximo paso claro, en el mismo lugar.
                  </p>
                </div>
                <span className="workspace-tag">
                  En acompañamiento · ejemplo
                </span>
              </div>
            </section>
            <section
              className={styles.panel}
              id="demo-notas"
              aria-labelledby="demo-notes-title"
            >
              <p className="kicker">Tu espacio para preparar</p>
              <h2 id="demo-notes-title">Una nota para continuar.</h2>
              <p className="hint">
                Ficha de {patient.name} · usa texto de ejemplo para probar esta
                demostración.
              </p>
              <form
                className="practice-form"
                method="post"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSavedNotes((previous) => ({
                    ...previous,
                    [patientId]: drafts[patientId] || "",
                  }));
                  setNotice({
                    area: "notas",
                    message: "Nota de ejemplo guardada en esta demo.",
                  });
                }}
              >
                <label>
                  Nota de ejemplo
                  <textarea
                    value={drafts[patientId] || ""}
                    maxLength={1500}
                    rows={5}
                    onChange={(e) => {
                      setDrafts((previous) => ({
                        ...previous,
                        [patientId]: e.target.value,
                      }));
                      setNotice(null);
                    }}
                    placeholder="Escribe una nota de ejemplo…"
                    required
                  />
                </label>
                <button type="submit" className="button human">
                  Guardar nota de ejemplo
                </button>
              </form>
              {notice?.area === "notas" ? (
                <p role="status" className={styles.notice}>
                  {notice.message}
                </p>
              ) : savedNotes[patientId] ? (
                <p className="hint">
                  Hay una nota de ejemplo guardada en esta ficha.
                </p>
              ) : null}
            </section>
            <section
              className={styles.panel}
              id="demo-mensajes"
              aria-labelledby="demo-chat-title"
            >
              <div className={styles.panelHead}>
                <div>
                  <p className="kicker">Un hilo para seguir cerca</p>
                  <h2 id="demo-chat-title">La conversación, en su lugar.</h2>
                </div>
                <span className="workspace-tag">Chat de ejemplo</span>
              </div>
              <div
                className={styles.chat}
                ref={chat}
                role="log"
                aria-label={`Conversación ficticia con ${patient.name}`}
                aria-live="polite"
              >
                {messages
                  .filter((m) => m.patient === patientId)
                  .map((m) => (
                    <div
                      className={`${styles.bubble} ${m.role === "professional" ? styles.outgoing : ""}`}
                      key={m.id}
                    >
                      <small>
                        {m.role === "professional"
                          ? "Tú · ejemplo"
                          : `${patient.name} · ejemplo`}
                      </small>
                      <p>{m.text}</p>
                    </div>
                  ))}
                {!messages.some((m) => m.patient === patientId) ? (
                  <p className={styles.empty}>
                    Puedes iniciar una conversación de ejemplo con{" "}
                    {patient.name}.
                  </p>
                ) : null}
              </div>
              <form
                className={styles.composer}
                method="post"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = messageDraft.trim();
                  if (!text) return;
                  setMessages((previous) => [
                    ...previous,
                    {
                      id: crypto.randomUUID(),
                      patient: patientId,
                      role: "professional",
                      text,
                    },
                  ]);
                  setMessageDraft("");
                  setNotice({
                    area: "mensajes",
                    message:
                      "Mensaje añadido a la demostración. No se ha enviado a ninguna persona.",
                  });
                }}
              >
                <label>
                  Mensaje de ejemplo
                  <input
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    maxLength={500}
                    required
                    placeholder="Prueba a confirmar un horario…"
                  />
                </label>
                <button type="submit" className="button human">
                  Añadir mensaje
                </button>
              </form>
              {notice?.area === "mensajes" ? (
                <p role="status" className={styles.notice}>
                  {notice.message}
                </p>
              ) : null}
            </section>
            <section
              className={styles.panel}
              id="demo-cobros"
              aria-labelledby="demo-payments-title"
            >
              <div className={styles.panelHead}>
                <div>
                  <p className="kicker">Más claridad, menos dispersión</p>
                  <h2 id="demo-payments-title">Tus registros, en orden.</h2>
                </div>
                <button
                  type="button"
                  className="button human"
                  onClick={(e) => {
                    setNotice(null);
                    openModal("receipt", e.currentTarget);
                  }}
                >
                  Registrar pago de ejemplo
                </button>
              </div>
              <div className={styles.totals}>
                {[...new Set(receipts.map((r) => r.currency))].map(
                  (currency) => (
                    <div key={currency}>
                      <span>{currency} · registrado en la demo</span>
                      <strong>
                        {money(
                          receipts
                            .filter((r) => r.currency === currency)
                            .reduce((sum, r) => sum + r.amountCents, 0),
                          currency,
                        )}
                      </strong>
                    </div>
                  ),
                )}
              </div>
              <div className={styles.receipts}>
                {receipts.map((receipt, index) => (
                  <article key={receipt.id}>
                    <div>
                      <strong>
                        {money(receipt.amountCents, receipt.currency)}
                      </strong>
                      <p>{receipt.method}</p>
                    </div>
                    <span className="workspace-tag">
                      Registro {index + 1} · ejemplo
                    </span>
                  </article>
                ))}
              </div>
              {notice?.area === "cobros" ? (
                <p role="status" className={styles.notice}>
                  {notice.message}
                </p>
              ) : null}
              <p className="hint">
                Esta demo no realiza cobros. En tu consulta puedes registrar
                pagos externos y consultar su historial; las opciones integradas
                dependen de su configuración.
              </p>
            </section>
            <section
              className={`${styles.panel} ${styles.finish}`}
              id="demo-cierre"
              aria-labelledby="demo-finish-title"
            >
              <p className="kicker">A tu manera de acompañar</p>
              <h2 id="demo-finish-title">
                Tu atención merece su propio lugar.
              </h2>
              <p>
                Ya puedes imaginar tu consulta aquí. Crea tu perfil y completa
                la revisión para empezar a organizar tu práctica.
              </p>
              <div className={styles.finishActions}>
                <Link
                  href="/entrar?modo=registro&rol=profesional"
                  className="button primary"
                >
                  Crear mi perfil profesional ↗
                </Link>
                <Link href="/pro/consulta" className="button secondary">
                  Entrar a mi consulta
                </Link>
              </div>
            </section>
          </div>
        </div>
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby="demo-dialog-title"
          onCancel={(e) => {
            e.preventDefault();
            closeModal();
          }}
          onClose={() => {
            setModal(null);
            modalOpener.current?.focus();
          }}
        >
          <div className={styles.dialogHeader}>
            <div>
              <p className="kicker">Solo en esta demostración</p>
              <h2 id="demo-dialog-title">
                {modal === "session"
                  ? "Un próximo encuentro."
                  : "Un registro claro."}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Cerrar formulario de ejemplo"
            >
              ×
            </button>
          </div>
          <form
            className="practice-form"
            method="post"
            onSubmit={saveExample}
            key={modal}
          >
            {modal === "session" ? (
              <>
                <label>
                  Paciente de ejemplo
                  <select name="patient" defaultValue={patientId}>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · ejemplo
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fecha y hora de ejemplo
                  <input
                    name="date"
                    type="datetime-local"
                    min="2000-01-01T00:00"
                    max="2099-12-31T23:59"
                    defaultValue={`${month}-${selectedDay}T11:00`}
                    required
                  />
                </label>
                <p className="hint">
                  Sesión en línea de 50 minutos. Zona de ejemplo:
                  América/Caracas.
                </p>
              </>
            ) : (
              <>
                <label>
                  Importe de ejemplo
                  <input
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max="9999"
                    step="0.01"
                    defaultValue="30"
                    required
                  />
                </label>
                <label>
                  Moneda
                  <select name="currency" defaultValue="USD">
                    <option value="USD">USD · dólares</option>
                    <option value="EUR">EUR · euros</option>
                    <option value="VES">VES · bolívares</option>
                  </select>
                </label>
                <p className="hint">
                  Es un registro ficticio para explorar el resumen de cobros.
                </p>
              </>
            )}
            {notice?.area === "modal" ? (
              <p role="alert" className="form-error">
                {notice.message}
              </p>
            ) : null}
            <button type="submit" className="button human">
              {modal === "session"
                ? "Guardar sesión de ejemplo"
                : "Guardar registro de ejemplo"}
            </button>
          </form>
        </dialog>
      </div>
    </section>
  );
}
