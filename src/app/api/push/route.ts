import { z } from "zod";
import { getServerSession } from "@/lib/auth-server";
import {
  pushPreferencesSchema,
  pushSubscriptionSchema,
} from "@/lib/push/contract";
import {
  authorizedPushActor,
  type PushActor,
  pushConfiguration,
  pushDevices,
  revokePush,
  subscribePush,
  updatePushPreferences,
} from "@/lib/push/preferences";

const roleSchema = z.enum(["professional", "patient"]);
const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
async function actorFor(request: Request): Promise<PushActor | null> {
  const role = roleSchema.safeParse(
    new URL(request.url).searchParams.get("role"),
  );
  const session = await getServerSession();
  if (!role.success || !session?.user.emailVerified || !session.session.id)
    return null;
  return {
    userId: session.user.id,
    sessionId: session.session.id,
    role: role.data,
  };
}
function sameOrigin(request: Request) {
  return (
    request.headers.get("origin") === new URL(request.url).origin &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("push_invalid");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("push_invalid");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new Error("push_invalid");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function GET(request: Request) {
  const actor = await actorFor(request);
  if (!actor)
    return response(
      { message: "Entra con tu cuenta y verifica tu correo." },
      401,
    );
  if (!(await authorizedPushActor(actor)))
    return response({ message: "Tu espacio todavía no está disponible." }, 403);
  try {
    const configuration = await pushConfiguration();
    return response({
      available: Boolean(configuration),
      publicKey: configuration?.publicKey || null,
      devices: await pushDevices(actor),
    });
  } catch {
    return response(
      { message: "No pudimos consultar los avisos. Inténtalo de nuevo." },
      503,
    );
  }
}
const subscribeSchema = z
  .object({
    subscription: pushSubscriptionSchema,
    preferences: pushPreferencesSchema,
    revision: z.number().int().min(0).max(1000000),
  })
  .strict();
const updateSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().min(1).max(1000000),
    preferences: pushPreferencesSchema,
  })
  .strict();
const revokeSchema = z.union([
  z.object({ id: z.string().uuid() }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  if (!sameOrigin(request))
    return response(
      { message: "Abre los ajustes de Nido para cambiar los avisos." },
      403,
    );
  const actor = await actorFor(request);
  if (!actor)
    return response(
      { message: "Entra con tu cuenta y verifica tu correo." },
      401,
    );
  try {
    const body = await jsonBody(request);
    if (method === "DELETE") {
      const value = revokeSchema.parse(body);
      await revokePush(actor, "id" in value ? value.id : undefined);
      return response({ ok: true });
    }
    if (!(await authorizedPushActor(actor)))
      return response(
        { message: "Tu espacio todavía no está disponible." },
        403,
      );
    if (method === "POST") {
      const value = subscribeSchema.parse(body);
      return response(
        await subscribePush(
          actor,
          value.subscription,
          value.preferences,
          value.revision,
        ),
      );
    }
    const value = updateSchema.parse(body);
    await updatePushPreferences(
      actor,
      value.id,
      value.revision,
      value.preferences,
    );
    return response({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "push_unavailable")
      return response(
        {
          message: "Los avisos con Nido cerrado todavía no están disponibles.",
        },
        503,
      );
    if (code === "push_conflict")
      return response(
        {
          message:
            "Los avisos cambiaron en otra ventana o alcanzaste el límite de dispositivos. Actualiza los ajustes.",
        },
        409,
      );
    if (
      error instanceof z.ZodError ||
      code === "push_invalid" ||
      error instanceof SyntaxError ||
      error instanceof DOMException
    )
      return response(
        { message: "Revisa las opciones de aviso y vuelve a intentarlo." },
        400,
      );
    return response(
      {
        message:
          "No pudimos guardar los avisos. Conservamos tus elecciones para que vuelvas a intentarlo.",
      },
      503,
    );
  }
}
export const POST = (request: Request) => mutate(request, "POST");
export const PATCH = (request: Request) => mutate(request, "PATCH");
export const DELETE = (request: Request) => mutate(request, "DELETE");
