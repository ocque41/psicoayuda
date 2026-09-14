import { createHash, timingSafeEqual } from "node:crypto";
import {
  type Connection,
  type ConnectionContext,
  Server,
  type WSMessage,
} from "partyserver";
import {
  type ChatMessage,
  parseClientFrame,
  type SenderRole,
  type ServerFrame,
  serialize,
} from "@/shared/chat-protocol";
import { isEnvelope } from "@/shared/e2ee";
import type { Env } from "./types";

const HISTORY_PAGE = 30;
const SYNC_LIMIT = 200;
// Como mucho un email cada 5 min por conversación (anti-spam al profesional).
const NOTIFY_DEBOUNCE_MS = 5 * 60 * 1000;
// Mismo debounce para avisar a la PERSONA de que le respondieron (sin contenido).
const SEEKER_NOTIFY_DEBOUNCE_MS = 5 * 60 * 1000;
// Anti-flood: tope de frames por conexión y ventana, y tope duro de mensajes
// por conversación (evita crecimiento no acotado del SQLite del DO). 20.000 es
// un límite de seguridad generoso: ninguna conversación real lo alcanza y sigue
// habiendo margen de sobra para el límite de almacenamiento del DO.
const FRAME_WINDOW_MS = 10_000;
const FRAME_MAX_PER_WINDOW = 40;
const MAX_MESSAGES_PER_CONVERSATION = 20000;

type ConnState = { role: SenderRole; canSend: boolean };

type MessageRow = {
  server_id: string;
  client_msg_id: string;
  seq: number;
  sender_role: string;
  content: string;
  server_ts: number;
};

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    serverId: row.server_id,
    seq: Number(row.seq),
    serverTs: Number(row.server_ts),
    senderRole: row.sender_role === "professional" ? "professional" : "seeker",
    content: row.content,
  };
}

/**
 * Un Durable Object por conversación (room = conversationId). Mantiene el
 * contenido del chat en su SQLite co-localizado y entrega en tiempo real con
 * garantías estilo WhatsApp: orden por `seq` monotónico, dedup idempotente por
 * `clientMsgId`, ack al emisor, sync por delta y paginación keyset.
 *
 * No confía en el cliente: el rol llega por header de confianza inyectado en
 * onBeforeConnect; cualquier rol del payload se ignora.
 */
export class Conversation extends Server<Env> {
  static options = { hibernate: true };

  private lastSeq = 0;
  private firstSeekerMsgAt: number | null = null;
  private firstProReplyAt: number | null = null;
  private lastNotifyAt = 0;
  private lastSeekerNotifyAt = 0;
  // Contador de frames por conexión (en memoria; un flood mantiene el DO
  // despierto, así que la ventana persiste durante el ataque).
  private rate = new Map<string, { winStart: number; count: number }>();

  // Token-bucket por conexión: limita frames/ventana (anti-flood de mensajes,
  // typing, etc.). Devuelve false si la conexión excede el límite.
  private allowFrame(connectionId: string): boolean {
    const now = Date.now();
    const entry = this.rate.get(connectionId);
    if (!entry || now - entry.winStart >= FRAME_WINDOW_MS) {
      this.rate.set(connectionId, { winStart: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= FRAME_MAX_PER_WINDOW;
  }

  async onStart() {
    const sql = this.ctx.storage.sql;
    sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        server_id TEXT PRIMARY KEY,
        client_msg_id TEXT UNIQUE,
        seq INTEGER NOT NULL,
        sender_role TEXT NOT NULL,
        content TEXT NOT NULL,
        server_ts INTEGER NOT NULL
      )`,
    );
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER)`);
    // Claves públicas E2EE que los clientes publican al conectar (hoy, la de la
    // persona por conversación; la del profesional vive en su ficha D1). Son
    // datos públicos: sirven para que la contraparte pueda cifrar. El contenido
    // nunca se descifra aquí.
    sql.exec(
      `CREATE TABLE IF NOT EXISTS keys (
        role TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    );

    const maxRow = sql
      .exec(`SELECT COALESCE(MAX(seq), 0) AS m FROM messages`)
      .one() as { m: number };
    this.lastSeq = Number(maxRow.m ?? 0);
    this.firstSeekerMsgAt = this.readMeta("first_seeker_msg_at");
    this.firstProReplyAt = this.readMeta("first_pro_reply_at");
    // Persistido: tras hibernar, no reabrir la ventana de anti-spam de email.
    this.lastNotifyAt = this.readMeta("last_notify_at") ?? 0;
    this.lastSeekerNotifyAt = this.readMeta("last_seeker_notify_at") ?? 0;
  }

  private readMeta(key: string): number | null {
    const rows = this.ctx.storage.sql
      .exec(`SELECT v FROM meta WHERE k = ?`, key)
      .toArray() as Array<{ v: number }>;
    return rows[0] ? Number(rows[0].v) : null;
  }

  private writeMeta(key: string, value: number) {
    this.ctx.storage.sql.exec(
      `INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
      key,
      value,
    );
  }

  // El rol viene de onBeforeConnect (header de confianza), nunca del cliente.
  getConnectionTags(_connection: Connection, ctx: ConnectionContext): string[] {
    const role = ctx.request.headers.get("x-nido-role");
    return role === "professional" || role === "seeker" ? [role] : [];
  }

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const header = ctx.request.headers.get("x-nido-role");
    const role: SenderRole =
      header === "professional" ? "professional" : "seeker";
    // `0` cuando la conversación está cerrada (o anonimizada): el historial se
    // sirve en solo lectura y el envío se rechaza hasta reabrir.
    const canSend = ctx.request.headers.get("x-nido-can-send") !== "0";
    connection.setState({ role, canSend } satisfies ConnState);

    const rows = this.ctx.storage.sql
      .exec(
        `SELECT server_id, client_msg_id, seq, sender_role, content, server_ts
         FROM messages ORDER BY seq DESC LIMIT ?`,
        HISTORY_PAGE,
      )
      .toArray() as MessageRow[];
    const total = (
      this.ctx.storage.sql.exec(`SELECT COUNT(*) AS c FROM messages`).one() as {
        c: number;
      }
    ).c;
    const messages = rows.reverse().map(toChatMessage);
    const hasMore = total > messages.length;

    this.sendTo(connection, {
      type: "history",
      messages,
      hasMore,
      mode: "initial",
    });
    this.sendTo(connection, { type: "keys", keys: this.keysSnapshot() });
    this.broadcastExcept(connection, {
      type: "presence",
      role,
      online: true,
    });
  }

  onClose(connection: Connection) {
    this.rate.delete(connection.id);
    const role = (connection.state as ConnState | null)?.role ?? "seeker";
    this.broadcastExcept(connection, { type: "presence", role, online: false });
  }

  async onMessage(connection: Connection, raw: WSMessage) {
    if (typeof raw !== "string") return;
    const frame = parseClientFrame(raw);
    if (!frame) {
      this.sendTo(connection, { type: "error", code: "bad_frame" });
      return;
    }
    if (!this.allowFrame(connection.id)) {
      this.sendTo(connection, { type: "error", code: "rate_limited" });
      return;
    }
    const role = (connection.state as ConnState | null)?.role ?? "seeker";
    const canSend = (connection.state as ConnState | null)?.canSend ?? true;

    switch (frame.type) {
      case "send":
        // Conversación cerrada: el historial se puede leer, pero no escribir.
        if (!canSend) {
          this.sendTo(connection, {
            type: "error",
            code: "conversation_closed",
          });
          return;
        }
        await this.handleSend(
          connection,
          role,
          frame.clientMsgId,
          frame.content,
        );
        return;
      case "sync":
        this.handleSync(connection, frame.sinceSeq);
        return;
      case "history-page":
        this.handleHistoryPage(connection, frame.beforeSeq);
        return;
      case "key":
        this.handleKey(role, frame.publicKey);
        return;
      case "reencrypt":
        this.handleReencrypt(connection, frame.items);
        return;
      case "typing":
        this.broadcastExcept(connection, {
          type: "typing",
          from: role,
          isTyping: frame.isTyping,
        });
        return;
      case "read":
        this.broadcastExcept(connection, {
          type: "read",
          upToSeq: frame.upToSeq,
        });
        return;
    }
  }

  private async handleSend(
    connection: Connection,
    role: SenderRole,
    clientMsgId: string,
    content: string,
  ) {
    const sql = this.ctx.storage.sql;

    // Dedup idempotente: si ya existe ese clientMsgId, re-ack y no re-emitir.
    const existing = sql
      .exec(
        `SELECT server_id, seq, server_ts FROM messages WHERE client_msg_id = ?`,
        clientMsgId,
      )
      .toArray() as Array<{
      server_id: string;
      seq: number;
      server_ts: number;
    }>;
    if (existing[0]) {
      this.sendTo(connection, {
        type: "ack",
        clientMsgId,
        serverId: existing[0].server_id,
        seq: Number(existing[0].seq),
        serverTs: Number(existing[0].server_ts),
      });
      return;
    }

    // Tope duro por conversación: evita crecimiento no acotado del SQLite del DO.
    if (this.lastSeq >= MAX_MESSAGES_PER_CONVERSATION) {
      this.sendTo(connection, { type: "error", code: "conversation_full" });
      return;
    }

    const seq = this.lastSeq + 1;
    const serverTs = Date.now();
    const serverId = `m_${seq}_${serverTs.toString(36)}`;

    sql.exec(
      `INSERT INTO messages (server_id, client_msg_id, seq, sender_role, content, server_ts)
       VALUES (?, ?, ?, ?, ?, ?)`,
      serverId,
      clientMsgId,
      seq,
      role,
      content,
      serverTs,
    );
    this.lastSeq = seq; // solo tras un INSERT exitoso: sin huecos en seq

    this.sendTo(connection, {
      type: "ack",
      clientMsgId,
      serverId,
      seq,
      serverTs,
    });
    const message: ChatMessage = {
      serverId,
      seq,
      serverTs,
      senderRole: role,
      content,
    };
    this.broadcastExcept(connection, { type: "msg", message });

    // Captura de tiempos para el algoritmo de respuesta del feed.
    if (role === "seeker" && this.firstSeekerMsgAt === null) {
      this.firstSeekerMsgAt = serverTs;
      this.writeMeta("first_seeker_msg_at", serverTs);
    }
    if (
      role === "professional" &&
      this.firstSeekerMsgAt !== null &&
      this.firstProReplyAt === null
    ) {
      this.firstProReplyAt = serverTs;
      this.writeMeta("first_pro_reply_at", serverTs);
      void this.callInternal("response-sample", {
        responseDeltaMs: serverTs - this.firstSeekerMsgAt,
      });
    }

    // PRIMERA PRIORIDAD: si el profesional no está conectado, avisarle por email
    // (con debounce para no spamear en una ráfaga de mensajes).
    if (role === "seeker" && !this.isProfessionalOnline()) {
      const now = Date.now();
      if (now - this.lastNotifyAt >= NOTIFY_DEBOUNCE_MS) {
        this.lastNotifyAt = now;
        this.writeMeta("last_notify_at", now);
        void this.callInternal("notify-message");
      }
    }

    // Espejo de METADATOS a D1 (solo timestamp + rol del último mensaje): ordena
    // la bandeja del profesional y marca no leídos. El CONTENIDO nunca sale del
    // SQLite del Durable Object.
    void this.callInternal("message-meta", {
      lastMessageAt: serverTs,
      lastMessageRole: role,
    });

    // Aviso a la PERSONA sin cuenta de que su acompañante respondió, con enlace
    // de acceso renovado (sin contenido). Cierra el ciclo asíncrono del chat.
    if (role === "professional" && !this.isSeekerOnline()) {
      const now = Date.now();
      if (now - this.lastSeekerNotifyAt >= SEEKER_NOTIFY_DEBOUNCE_MS) {
        this.lastSeekerNotifyAt = now;
        this.writeMeta("last_seeker_notify_at", now);
        void this.callInternal("notify-seeker");
      }
    }
  }

  private handleSync(connection: Connection, sinceSeq: number) {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT server_id, client_msg_id, seq, sender_role, content, server_ts
         FROM messages WHERE seq > ? ORDER BY seq ASC LIMIT ?`,
        sinceSeq,
        SYNC_LIMIT,
      )
      .toArray() as MessageRow[];
    this.sendTo(connection, {
      type: "history",
      messages: rows.map(toChatMessage),
      hasMore: rows.length === SYNC_LIMIT,
      mode: "sync",
    });
  }

  // Paginación hacia atrás (keyset por seq): el historial completo se puede
  // leer aunque pasen de los 30 más recientes. `hasMore` indica si quedan
  // mensajes aún más antiguos.
  private handleHistoryPage(connection: Connection, beforeSeq: number) {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT server_id, client_msg_id, seq, sender_role, content, server_ts
         FROM messages WHERE seq < ? ORDER BY seq DESC LIMIT ?`,
        beforeSeq,
        HISTORY_PAGE,
      )
      .toArray() as MessageRow[];
    const messages = rows.reverse().map(toChatMessage);
    const oldestSeq = messages[0]?.seq ?? beforeSeq;
    const older = (
      this.ctx.storage.sql
        .exec(`SELECT COUNT(*) AS c FROM messages WHERE seq < ?`, oldestSeq)
        .one() as { c: number }
    ).c;
    this.sendTo(connection, {
      type: "history",
      messages,
      hasMore: Number(older) > 0,
      mode: "page",
    });
  }

  // Publica/actualiza la clave pública E2EE del rol conectado y la difunde a la
  // sala para que la contraparte pueda cifrar. El DO nunca ve la privada.
  private handleKey(role: SenderRole, publicKey: string) {
    this.ctx.storage.sql.exec(
      `INSERT INTO keys (role, public_key, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(role) DO UPDATE SET public_key = excluded.public_key, updated_at = excluded.updated_at`,
      role,
      publicKey,
      Date.now(),
    );
    this.broadcast(serialize({ type: "keys", keys: this.keysSnapshot() }));
  }

  private keysSnapshot(): { seeker?: string; professional?: string } {
    const rows = this.ctx.storage.sql
      .exec(`SELECT role, public_key FROM keys`)
      .toArray() as Array<{ role: string; public_key: string }>;
    const keys: { seeker?: string; professional?: string } = {};
    for (const row of rows) {
      if (row.role === "seeker") keys.seeker = row.public_key;
      else if (row.role === "professional") keys.professional = row.public_key;
    }
    return keys;
  }

  /**
   * Re-cifra mensajes del historial legado (texto plano) con el sobre E2EE que
   * manda el cliente. No toca el orden: solo reemplaza `content` de filas que
   * aún no son sobres. Idempotente: repetir el lote no cambia nada.
   */
  private handleReencrypt(
    connection: Connection,
    items: { serverId: string; envelope: string }[],
  ) {
    const sql = this.ctx.storage.sql;
    let count = 0;
    for (const item of items) {
      const row = sql
        .exec(`SELECT content FROM messages WHERE server_id = ?`, item.serverId)
        .toArray() as Array<{ content: string }>;
      if (!row[0] || isEnvelope(row[0].content)) continue;
      sql.exec(
        `UPDATE messages SET content = ? WHERE server_id = ?`,
        item.envelope,
        item.serverId,
      );
      count += 1;
    }
    this.sendTo(connection, { type: "reencrypted", count });
  }

  private isProfessionalOnline(): boolean {
    for (const connection of this.getConnections()) {
      if ((connection.state as ConnState | null)?.role === "professional") {
        return true;
      }
    }
    return false;
  }

  private isSeekerOnline(): boolean {
    for (const connection of this.getConnections()) {
      if ((connection.state as ConnState | null)?.role === "seeker") {
        return true;
      }
    }
    return false;
  }

  // Solo llamadas internas de confianza (mismo Worker, vía binding del DO) con
  // el secreto compartido. Hash a longitud fija => comparación constante.
  private internalAuthorized(request: Request): boolean {
    const provided = request.headers.get("x-nido-internal");
    const expected =
      this.env.INTERNAL_NOTIFY_SECRET ?? this.env.BETTER_AUTH_SECRET;
    if (!provided || !expected) return false;
    const a = createHash("sha256").update(provided).digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
  }

  /**
   * Endpoint HTTP del DO (no-WebSocket). Soporta `POST …/purge`: borra TODO el
   * contenido del chat de su SQLite co-localizado. Es la pieza que faltaba para
   * honrar de verdad la promesa de borrado/anonimización de la política de
   * privacidad (el espejo en D1 se anonimiza aparte). Protegido por secreto.
   */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/purge")) {
      if (!this.internalAuthorized(request)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const sql = this.ctx.storage.sql;
      sql.exec(`DELETE FROM messages`);
      sql.exec(`DELETE FROM meta`);
      sql.exec(`DELETE FROM keys`);
      this.lastSeq = 0;
      this.firstSeekerMsgAt = null;
      this.firstProReplyAt = null;
      this.lastNotifyAt = 0;
      this.lastSeekerNotifyAt = 0;
      // Cierra las conexiones vivas: ya no hay contenido que servir.
      for (const connection of this.getConnections()) {
        try {
          connection.close(1000, "purged");
        } catch {
          // best-effort
        }
      }
      return Response.json({ ok: true, purged: true });
    }
    if (request.method === "POST" && url.pathname.endsWith("/disconnect")) {
      if (!this.internalAuthorized(request)) {
        return new Response("Unauthorized", { status: 401 });
      }
      // Corta los sockets vivos SIN borrar el contenido (a diferencia de purge):
      // hace efectivo el kill-switch al cerrar la solicitud o suspender al
      // profesional. Si el cliente reconecta, auth-gate (sesión/estado en D1) ya
      // lo rechaza.
      for (const connection of this.getConnections()) {
        try {
          connection.close(1000, "closed");
        } catch {
          // best-effort
        }
      }
      return Response.json({ ok: true, disconnected: true });
    }
    return new Response("Not found", { status: 404 });
  }

  // RPC best-effort al endpoint interno de Next (donde vive el email/D1 con
  // server-only). No rompemos el chat si falla.
  private async callInternal(kind: string, extra?: Record<string, unknown>) {
    const base = this.env.BETTER_AUTH_URL?.replace(/\/+$/, "");
    const secret =
      this.env.INTERNAL_NOTIFY_SECRET ?? this.env.BETTER_AUTH_SECRET;
    if (!base || !secret) return;
    try {
      await fetch(`${base}/api/internal/chat-event`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-nido-internal": secret,
        },
        body: JSON.stringify({ kind, conversationId: this.name, ...extra }),
      });
    } catch {
      // best-effort
    }
  }

  private sendTo(connection: Connection, frame: ServerFrame) {
    connection.send(serialize(frame));
  }

  private broadcastExcept(connection: Connection, frame: ServerFrame) {
    this.broadcast(serialize(frame), [connection.id]);
  }
}
