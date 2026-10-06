"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import { playBirdChirp } from "@/lib/practice/bird-chirp";
import type { SessionNotesReminderView } from "@/lib/practice/session-notes-reminder";

export function SessionNotesReminder({
  reminder,
  endedLabel,
}: {
  reminder: SessionNotesReminderView;
  endedLabel: string;
}) {
  const id = useId();
  const [playing, setPlaying] = useState(false);
  const [soundNotice, setSoundNotice] = useState("");
  return (
    <aside className="card" aria-labelledby={`${id}-title`}>
      <div className="workspace-section-heading">
        <Image src="/brand/nido-icon-64.png" alt="" width={40} height={40} />
        <div>
          <p className="eyebrow">Tu pajarito de Nido</p>
          <h3 id={`${id}-title`}>{reminder.title}</h3>
        </div>
      </div>
      <p>{reminder.body}</p>
      <p id={`${id}-ended`} className="hint">
        Horario terminado el{" "}
        <time dateTime={reminder.endsAt}>{endedLabel}</time>.
      </p>
      <div className="panel-nav">
        <Link
          href={reminder.href}
          className="button human"
          prefetch={false}
          aria-describedby={`${id}-ended`}
        >
          Abrir notas de esta sesión
        </Link>
        <button
          className="button secondary"
          type="button"
          disabled={playing}
          onClick={async () => {
            if (playing) return;
            setPlaying(true);
            const played = await playBirdChirp().catch(() => false);
            setSoundNotice(
              played
                ? "Así suena tu pajarito. El canto se reproduce aquí cuando lo pulsas."
                : "No pudimos reproducir el canto en este dispositivo. Puedes seguir con tus notas.",
            );
            setPlaying(false);
          }}
        >
          Escuchar pajarito
        </button>
      </div>
      <p className="hint">
        Este aviso aparece dentro de Nido. El canto se reproduce únicamente al
        pulsar el botón.
      </p>
      <p className="hint" role="status" aria-live="polite">
        {soundNotice}
      </p>
    </aside>
  );
}
