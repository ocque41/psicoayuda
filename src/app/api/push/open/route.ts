import { z } from "zod";
import { getServerSession } from "@/lib/auth-server";
import { pushOpenDestination } from "@/lib/push/jobs";

export async function GET(request: Request) {
  let path = "/entrar";
  try {
    const id = z
      .string()
      .uuid()
      .safeParse(new URL(request.url).searchParams.get("delivery"));
    const session = await getServerSession();
    if (id.success && session?.user.emailVerified && session.session.id)
      path = await pushOpenDestination(
        session.user.id,
        session.session.id,
        id.data,
      );
  } catch {
    /* Closed or unavailable contexts return to authenticated entry. */
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
