/**
 * Bandeja del profesional: metadatos de sus conversaciones (NUNCA contenido)
 * compartidos por el panel, la sala de chat y la ruta de refresco. Este módulo
 * no toca la base de datos: recibe filas ya consultadas y las normaliza a un
 * formato estable para el cliente, con una huella barata para no repintar de
 * más al refrescar.
 */

export type ProChatRow = {
  conversationId: string;
  status: string;
  closedReason: string | null;
  lastMessageAt: Date | null;
  lastMessageRole: string | null;
  proLastReadAt: Date | null;
  createdAt: string;
  seekerName: string | null;
  needCategory: string | null;
  urgency: string | null;
};

export type ProChatSummary = {
  id: string;
  need: string | null;
  urgency: string | null;
  seekerName: string | null;
  /** Última actividad en ms (si nunca hubo mensajes, la creación). */
  lastActivityAt: number;
  lastMessageRole: string | null;
  status: string;
  closedReason: string | null;
  /** El último mensaje es de la persona y llegó tras la última lectura del pro. */
  unread: boolean;
};

function createdAtMs(createdAt: string): number {
  const ms = new Date(createdAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function isProChatUnread(row: ProChatRow): boolean {
  if (row.lastMessageRole !== "seeker" || !row.lastMessageAt) return false;
  return (
    !row.proLastReadAt ||
    row.lastMessageAt.getTime() > row.proLastReadAt.getTime()
  );
}

export function toProChatSummary(row: ProChatRow): ProChatSummary {
  return {
    id: row.conversationId,
    need: row.needCategory,
    urgency: row.urgency,
    seekerName: row.seekerName,
    lastActivityAt: row.lastMessageAt?.getTime() ?? createdAtMs(row.createdAt),
    lastMessageRole: row.lastMessageRole,
    status: row.status,
    closedReason: row.closedReason,
    unread: isProChatUnread(row),
  };
}

export function toProChatSummaries(rows: ProChatRow[]): ProChatSummary[] {
  return rows.map(toProChatSummary);
}

export function proChatsUnreadCount(chats: ProChatSummary[]): number {
  return chats.reduce((total, chat) => total + (chat.unread ? 1 : 0), 0);
}

/**
 * Huella del estado visible de la bandeja: si no cambia, el refresco no
 * reemplaza el estado (y React no repinta la lista). Incluye la actividad, no
 * el contenido.
 */
export function proChatsFingerprint(chats: ProChatSummary[]): string {
  return chats
    .map(
      (chat) =>
        `${chat.id}:${chat.lastActivityAt}:${chat.lastMessageRole ?? ""}:${chat.unread ? 1 : 0}:${chat.status}`,
    )
    .join("|");
}

/** Orden de la bandeja: más reciente primero (empata por id, estable). */
export function sortProChats(chats: ProChatSummary[]): ProChatSummary[] {
  return [...chats].sort(
    (a, b) => b.lastActivityAt - a.lastActivityAt || a.id.localeCompare(b.id),
  );
}

/** Aviso en vivo de la sala: quién escribió y cuándo (sin contenido). */
export type ProChatActivity = {
  conversationId: string;
  role: "seeker" | "professional";
  at: number;
};

/**
 * Aplica un aviso en vivo a la bandeja: mueve la conversación al tope, actualiza
 * la actividad y marca "sin leer" si escribió la persona. Si la sala no está en
 * la lista (conversación nueva) no inventa nada: el refresco la traerá.
 */
export function applyProChatActivity(
  chats: ProChatSummary[],
  activity: ProChatActivity,
): ProChatSummary[] {
  let found = false;
  const next = chats.map((chat) => {
    if (chat.id !== activity.conversationId) return chat;
    found = true;
    return {
      ...chat,
      lastActivityAt: Math.max(chat.lastActivityAt, activity.at),
      lastMessageRole: activity.role,
      unread: activity.role === "seeker",
    };
  });
  return found ? sortProChats(next) : chats;
}

/**
 * Salas que merecen una conexión de avisos (solo lectura): las abiertas, sin la
 * que ya está a la vista (esa tiene su propio WebSocket) y con un tope para no
 * abrir una conexión por cada hilo histórico.
 */
export function proChatSocketTargets(
  chats: ProChatSummary[],
  activeId: string,
  cap = 5,
): string[] {
  return sortProChats(chats)
    .filter((chat) => chat.status === "open" && chat.id !== activeId)
    .slice(0, cap)
    .map((chat) => chat.id);
}
