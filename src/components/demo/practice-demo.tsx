"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { playBirdChirp } from "@/lib/practice/bird-chirp";
import { BirdGuide, type BirdGuideStep } from "./bird-guide";
import styles from "./practice-demo.module.css";
import { RemindersDemo, reminderDemoSteps } from "./reminders-demo";

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
      "Elige un encuentro y guarda sus notas de ejemplo. En tu consulta, cada sesión tiene sus propios apuntes privados.",
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
    id: "recordatorios",
    targetId: "demo-recordatorios",
    title: "Tus avisos, a tu manera",
    description:
      "Prueba cómo activar, elegir y apagar los recordatorios. Te explicaré cada paso; esta demo no envía correos.",
  },
  {
    id: "cierre",
    targetId: "demo-cierre",
    title: "Ahora, a tu manera",
    description:
      "Puedes seguir explorando o crear tu perfil profesional. Tu práctica real empezará con el recorrido de incorporación y revisión.",
  },
];
const readingTargets: Record<string, string[]> = {
  inicio: ["demo-home-title", "demo-home-description", "demo-home-reading"],
  agenda: ["demo-agenda-title", "demo-agenda-context"],
  pacientes: ["demo-patients-title", "demo-patients-context"],
  notas: ["demo-notes-title", "demo-notes-context", "demo-notes-privacy"],
  mensajes: ["demo-chat-title", "demo-chat-context"],
  cobros: ["demo-payments-title", "demo-payments-context"],
  recordatorios: ["demo-reminders-title", "demo-reminders-context"],
  cierre: ["demo-finish-title", "demo-finish-context"],
};
const guideSteps = steps
  .flatMap((step) =>
    step.id === "recordatorios" ? [step, ...reminderDemoSteps] : [step],
  )
  .map((step) => ({
    ...step,
    readingTargets: readingTargets[step.id] || step.readingTargets,
  }));
const labels: Record<string, string> = {
  inicio: "Mi consulta",
  agenda: "Agenda",
  pacientes: "Pacientes",
  notas: "Notas",
  mensajes: "Mensajes",
  cobros: "Cobros",
  recordatorios: "Recordatorios",
  cierre: "Tu próximo paso",
};

const icons: Record<string, string> = {
  inicio: "M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7",
  agenda: "M5 5h14v16H5zM8 3v4m8-4v4M5 10h14M8 14h2m4 0h2m-8 3h2",
  pacientes:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7m2 10v-2a4 4 0 0 0-3-3.9",
  notas: "M5 3h14v18H5zM8 8h8m-8 4h8m-8 4h5",
  mensajes:
    "M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4zM7 9h10m-10 4h6",
  cobros: "M3 6h18v14H3zM3 10h18m-14 6h4",
  recordatorios: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
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
  const [guideStep, setGuideStep] = useState("inicio");
  const activeView = useRef("inicio");
  const focusView = useRef(false);
  const viewTitle = useRef<HTMLHeadingElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState("09");
  const [patientId, setPatientId] = useState("ana");
  const [sessions, setSessions] = useState<DemoSession[]>([
    { id: "ejemplo-1", patient: "ana", date: `${initialMonth}-09T10:00` },
    { id: "ejemplo-2", patient: "luis", date: `${initialMonth}-13T16:00` },
    { id: "ejemplo-3", patient: "ana", date: `${initialMonth}-16T10:00` },
    { id: "ejemplo-4", patient: "carmen", date: `${initialMonth}-20T11:00` },
  ]);
  const [drafts, setDrafts] = useState<Record<string, string>>({
    "ana:ejemplo-1": "Una nota de ejemplo para preparar este encuentro.",
  });
  const [savedNotes, setSavedNotes] = useState<
    Record<string, Array<{ id: string; content: string }>>
  >({});
  const [noteSessions, setNoteSessions] = useState<Record<string, string>>({});
  const patientSessions = sessions
    .filter((session) => session.patient === patientId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const noteSession =
    patientSessions.find((session) => session.id === noteSessions[patientId]) ||
    patientSessions.at(-1);
  const noteKey = noteSession ? `${patientId}:${noteSession.id}` : "";
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
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>(
    {},
  );
  const messageDraft = messageDrafts[patientId] || "";
  const setMessageDraft = (text: string) =>
    setMessageDrafts((previous) => ({ ...previous, [patientId]: text }));
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
  const latestMessageId = messages
    .filter((message) => message.patient === patientId)
    .at(-1)?.id;
  const patient = patients.find((p) => p.id === patientId) || patients[0];
  function navigate(id: string, focus = true) {
    const step = steps.find((candidate) => candidate.id === id);
    if (!step) return;
    focusView.current = focus;
    const url = new URL(window.location.href);
    url.hash = step.targetId;
    if (url.hash !== window.location.hash)
      window.history.pushState(
        { ...window.history.state, nidoDemoView: id },
        "",
        url,
      );
    activeView.current = id;
    setActive(id);
    setGuideStep(id);
    if (focus && active === id)
      viewTitle.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const synchronize = (focus: boolean) => {
      const step = steps.find(
        (candidate) => `#${candidate.targetId}` === window.location.hash,
      );
      const saved = steps.find(
        (candidate) => candidate.id === window.history.state?.nidoDemoView,
      );
      const view =
        window.location.hash === "#contenido"
          ? saved?.id || activeView.current
          : step?.id || "inicio";
      activeView.current = view;
      window.history.replaceState(
        { ...window.history.state, nidoDemoView: view },
        "",
      );
      focusView.current = focus;
      setActive(view);
      setGuideStep(view);
    };
    const onHistory = () => synchronize(true);
    synchronize(false);
    window.addEventListener("hashchange", onHistory);
    window.addEventListener("popstate", onHistory);
    return () => {
      window.removeEventListener("hashchange", onHistory);
      window.removeEventListener("popstate", onHistory);
    };
  }, []);
  useEffect(() => {
    const menu = navigation.current;
    const revealSelected = () => {
      const selected = menu?.querySelector<HTMLElement>(
        '[aria-current="page"]',
      );
      if (!menu || !selected) return;
      const item = selected.getBoundingClientRect();
      const bounds = menu.getBoundingClientRect();
      if (item.left < bounds.left || item.right > bounds.right)
        menu.scrollTo({
          left:
            menu.scrollLeft +
            item.left -
            bounds.left -
            (bounds.width - item.width) / 2,
          behavior: "instant",
        });
    };
    revealSelected();
    const resize = new ResizeObserver(revealSelected);
    if (menu) resize.observe(menu);
    // El destino ya está pintado antes de enfocar su título.
    if (
      focusView.current &&
      viewTitle.current?.textContent === labels[active]
    ) {
      focusView.current = false;
      viewTitle.current.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    return () => resize.disconnect();
  }, [active]);
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
    if (active === "mensajes" && latestMessageId && chat.current)
      chat.current.scrollTop = chat.current.scrollHeight;
  }, [latestMessageId, active]);
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
    <section className={styles.demo}>
      <header className={styles.appbar} data-workspace-header>
        <Link
          className={styles.brand}
          href="/demo/consulta"
          aria-label="Nido · Mi consulta de ejemplo"
          onClick={(event) => {
            if (
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            )
              return;
            event.preventDefault();
            navigate("inicio");
          }}
        >
          <Image src="/brand/nido-icon-128.png" width={40} height={40} alt="" />
          <span>
            Nido<small>Tu consulta</small>
          </span>
        </Link>
        <div className={styles.headerActions}>
          <span className={styles.demoBadge}>Demo · datos de ejemplo</span>
          <BirdGuide
            steps={guideSteps}
            stepId={guideStep}
            onStepChange={(step) => {
              navigate(
                step.id.startsWith("recordatorios-")
                  ? "recordatorios"
                  : step.id,
                false,
              );
              setGuideStep(step.id);
            }}
          />
        </div>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar} data-workspace-navigation>
          <p className={styles.sidebarTitle}>
            Tu espacio <span>Profesional · demo</span>
          </p>
          <nav
            ref={navigation}
            aria-label="Secciones de la demostración"
            className={styles.menu}
          >
            {steps
              .filter((step) => step.id !== "cierre")
              .map((step) => (
                <a
                  key={step.id}
                  href={`#${step.targetId}`}
                  aria-current={active === step.id ? "page" : undefined}
                  onClick={(event) => {
                    if (
                      event.ctrlKey ||
                      event.metaKey ||
                      event.shiftKey ||
                      event.altKey ||
                      event.button !== 0
                    )
                      return;
                    event.preventDefault();
                    navigate(step.id);
                  }}
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
                  <span>{labels[step.id]}</span>
                </a>
              ))}
          </nav>
          <div className={styles.sidebarFooter}>
            <p className={styles.localHint}>
              Tu ejemplo se conserva al cambiar de ventana. Al recargar, la demo
              vuelve a empezar.
            </p>
            <Link href="/pro/consulta" className={styles.back}>
              Entrar a mi consulta ↗
            </Link>
          </div>
        </aside>
        <div className={styles.workspace}>
          <div className={styles.windowHeading}>
            <div>
              <p className="eyebrow">Tu consulta · demo</p>
              <h1 ref={viewTitle} tabIndex={-1}>
                {labels[active]}
              </h1>
            </div>
            <span className={styles.windowHint}>
              Un espacio para cada paso.
            </span>
          </div>
          <div className={styles.panels}>
            <section
              className={`${styles.panel} ${styles.home}`}
              id="demo-home"
              hidden={active !== "inicio"}
              aria-labelledby="demo-home-title"
            >
              <p className="kicker">A tu manera de acompañar</p>
              <h2 id="demo-home-title" className={styles.readingPoint}>
                Todo listo para tu próximo paso.
              </h2>
              <p
                id="demo-home-description"
                className={`${styles.homeDescription} ${styles.readingPoint}`}
              >
                Tu agenda, las personas y sus conversaciones tienen su propio
                lugar. Elige una ventana o deja que nuestro pajarito te
                acompañe.
              </p>
              <div className={styles.overview}>
                <div>
                  <span>Personas de ejemplo</span>
                  <strong>{patients.length}</strong>
                </div>
                <div>
                  <span>Encuentros organizados</span>
                  <strong>{sessions.length}</strong>
                </div>
                <div>
                  <span>Notas guardadas</span>
                  <strong>{Object.keys(savedNotes).length}</strong>
                </div>
              </div>
              <div className={styles.shortcuts}>
                <button type="button" onClick={() => navigate("agenda")}>
                  <span className={styles.shortcutIcon}>↗</span>
                  <strong>Abrir mi agenda</strong>
                  <span>Un día, un encuentro, un próximo paso.</span>
                </button>
                <button type="button" onClick={() => navigate("pacientes")}>
                  <span className={styles.shortcutIcon}>◎</span>
                  <strong>Ver mis pacientes</strong>
                  <span>Cada persona tiene su propio contexto.</span>
                </button>
                <button type="button" onClick={() => navigate("mensajes")}>
                  <span className={styles.shortcutIcon}>↔</span>
                  <strong>Continuar una conversación</strong>
                  <span>Mensajes y borradores, en su lugar.</span>
                </button>
              </div>
              <p
                id="demo-home-reading"
                className={`hint ${styles.readingPoint}`}
              >
                Esta es una demostración con personas ficticias. No envía
                mensajes ni realiza cobros.
              </p>
            </section>
            <section
              className={styles.panel}
              id="demo-agenda"
              hidden={active !== "agenda"}
              aria-labelledby="demo-agenda-title"
            >
              <div className={styles.panelHead}>
                <div>
                  <p className="kicker">Tu próximo encuentro</p>
                  <h2 id="demo-agenda-title" className={styles.readingPoint}>
                    Una agenda con contexto.
                  </h2>
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
              <p
                id="demo-agenda-context"
                className={`hint ${styles.readingPoint}`}
              >
                Elige un día para leer sus encuentros. Puedes programar una
                sesión de ejemplo y volver a revisar la agenda.
              </p>
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
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          setPatientId(s.patient);
                          setNoteSessions((previous) => ({
                            ...previous,
                            [s.patient]: s.id,
                          }));
                          setNotice(null);
                          navigate("notas");
                        }}
                      >
                        Abrir notas
                      </button>
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
              hidden={active !== "pacientes"}
              aria-labelledby="demo-patients-title"
            >
              <p className="kicker">Personas primero</p>
              <h2 id="demo-patients-title" className={styles.readingPoint}>
                Todo empieza por tu paciente.
              </h2>
              <p
                id="demo-patients-context"
                className={`hint ${styles.readingPoint}`}
              >
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
                      setNotice(null);
                    }}
                  >
                    <span className={`${styles.avatar} ${styles[p.color]}`}>
                      {p.initials}
                    </span>
                    <strong>{p.name} · ejemplo</strong>
                    <span>{p.description}</span>
                    <span className={styles.openPatient}>
                      Seleccionar ficha →
                    </span>
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
                <div className={styles.contextActions}>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => navigate("notas")}
                  >
                    Abrir notas
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => navigate("mensajes")}
                  >
                    Abrir conversación
                  </button>
                </div>
              </div>
            </section>
            <section
              className={styles.panel}
              id="demo-notas"
              hidden={active !== "notas"}
              aria-labelledby="demo-notes-title"
            >
              <p className="kicker">Tu espacio para preparar</p>
              <h2 id="demo-notes-title" className={styles.readingPoint}>
                Notas por sesión.
              </h2>
              <p
                id="demo-notes-context"
                className={`hint ${styles.readingPoint}`}
              >
                El pajarito te puede invitar a dejar tus apuntes al terminar un
                encuentro: «Tu sesión terminó. ¿Quieres dejar tus notas?».
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={async () => {
                  const played = await playBirdChirp();
                  setNotice({
                    area: "notas",
                    message: played
                      ? "Así suena el pajarito de Nido. Solo sonará si activas el sonido."
                      : "Este dispositivo no pudo reproducir el canto. Puedes seguir usando las notas.",
                  });
                }}
              >
                Escuchar pajarito
              </button>
              <label className={styles.patientSwitcher}>
                Paciente de ejemplo
                <select
                  value={patientId}
                  onChange={(event) => {
                    setPatientId(event.target.value);
                    setNotice(null);
                  }}
                >
                  {patients.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · ejemplo
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.patientSwitcher}>
                Sesión de ejemplo · zona América/Caracas
                <select
                  value={noteSession?.id || ""}
                  disabled={!patientSessions.length}
                  onChange={(event) => {
                    setNoteSessions((previous) => ({
                      ...previous,
                      [patientId]: event.target.value,
                    }));
                    setNotice(null);
                  }}
                >
                  {!patientSessions.length ? (
                    <option value="">Sin sesiones de ejemplo</option>
                  ) : null}
                  {patientSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.date.slice(0, 10)} · {session.date.slice(11)}
                    </option>
                  ))}
                </select>
              </label>
              <p
                id="demo-notes-privacy"
                className={`hint ${styles.readingPoint}`}
              >
                Ficha de {patient.name} · cada encuentro conserva sus propios
                borradores y notas. Usa texto ficticio.
              </p>
              {!noteSession ? (
                <p className={styles.empty}>
                  Programa una sesión de ejemplo en la agenda para escribir sus
                  notas.
                </p>
              ) : null}
              <form
                className="practice-form"
                method="post"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!noteKey) return;
                  setSavedNotes((previous) => ({
                    ...previous,
                    [noteKey]: [
                      ...(previous[noteKey] || []),
                      {
                        id: crypto.randomUUID(),
                        content: drafts[noteKey] || "",
                      },
                    ],
                  }));
                  setDrafts((previous) => ({ ...previous, [noteKey]: "" }));
                  setNotice({
                    area: "notas",
                    message: "Nota de ejemplo guardada para esta sesión.",
                  });
                }}
              >
                <label>
                  Nota de ejemplo
                  <textarea
                    value={drafts[noteKey] || ""}
                    disabled={!noteSession}
                    maxLength={1500}
                    rows={5}
                    onChange={(e) => {
                      setDrafts((previous) => ({
                        ...previous,
                        [noteKey]: e.target.value,
                      }));
                      setNotice(null);
                    }}
                    placeholder="Escribe una nota de ejemplo…"
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="button human"
                  disabled={!noteSession}
                >
                  Guardar nota de ejemplo
                </button>
              </form>
              {notice?.area === "notas" ? (
                <p role="status" className={styles.notice}>
                  {notice.message}
                </p>
              ) : null}
              {savedNotes[noteKey]?.length ? (
                savedNotes[noteKey].map((note, index) => (
                  <article className="card" key={note.id}>
                    <h3>
                      Nota de ejemplo {index + 1} ·{" "}
                      {noteSession?.date.slice(0, 10)}
                    </h3>
                    <p style={{ whiteSpace: "pre-wrap" }}>{note.content}</p>
                  </article>
                ))
              ) : noteSession ? (
                <p className="hint">
                  Esta sesión todavía no tiene notas de ejemplo guardadas.
                </p>
              ) : null}
            </section>
            <section
              className={styles.panel}
              id="demo-mensajes"
              hidden={active !== "mensajes"}
              aria-labelledby="demo-chat-title"
            >
              <div className={styles.panelHead}>
                <div>
                  <p className="kicker">Un hilo para seguir cerca</p>
                  <h2 id="demo-chat-title" className={styles.readingPoint}>
                    La conversación, en su lugar.
                  </h2>
                </div>
                <span className="workspace-tag">Chat de ejemplo</span>
                <label className={styles.patientSwitcher}>
                  Paciente de ejemplo
                  <select
                    value={patientId}
                    onChange={(event) => {
                      setPatientId(event.target.value);
                      setNotice(null);
                    }}
                  >
                    {patients.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · ejemplo
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p
                id="demo-chat-context"
                className={`hint ${styles.readingPoint}`}
              >
                Lee la conversación de ejemplo y prueba a añadir una respuesta.
                El borrador se conserva al cambiar de ventana.
              </p>
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
              hidden={active !== "cobros"}
              aria-labelledby="demo-payments-title"
            >
              <div className={styles.panelHead}>
                <div>
                  <p className="kicker">Más claridad, menos dispersión</p>
                  <h2 id="demo-payments-title" className={styles.readingPoint}>
                    Tus registros, en orden.
                  </h2>
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
              <p
                id="demo-payments-context"
                className={`hint ${styles.readingPoint}`}
              >
                Esta demo no realiza cobros. En tu consulta puedes registrar
                pagos externos y consultar su historial; las opciones integradas
                dependen de su configuración.
              </p>
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
            </section>
            <section
              className={styles.panel}
              id="demo-recordatorios"
              hidden={active !== "recordatorios"}
              aria-labelledby="demo-reminders-title"
            >
              <RemindersDemo />
            </section>
            <section
              className={`${styles.panel} ${styles.finish}`}
              id="demo-cierre"
              hidden={active !== "cierre"}
              aria-labelledby="demo-finish-title"
            >
              <p className="kicker">A tu manera de acompañar</p>
              <h2 id="demo-finish-title" className={styles.readingPoint}>
                Tu atención merece su propio lugar.
              </h2>
              <p id="demo-finish-context" className={styles.readingPoint}>
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
            const opener = modalOpener.current;
            if (opener?.isConnected && opener.getClientRects().length)
              opener.focus({ preventScroll: true });
            else viewTitle.current?.focus({ preventScroll: true });
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
