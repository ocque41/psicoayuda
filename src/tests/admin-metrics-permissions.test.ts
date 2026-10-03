import { eq, like } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));

import { GET } from "@/app/api/admin/metrics/route";

const prefix = "test-metrics-permission-";
const adminEmail = "metrics-admin@example.test";
const staffEmail = "metrics-staff@example.test";
async function cleanup() {
  await db.delete(user).where(like(user.id, `${prefix}%`));
}
function session(id: string, email = adminEmail) {
  mocks.session.mockResolvedValue({
    user: { id: `${prefix}${id}`, email, emailVerified: true },
  });
}
beforeAll(async () => {
  await cleanup();
  await db.insert(user).values([
    {
      id: `${prefix}admin`,
      name: "Admin ficticio",
      email: adminEmail,
      emailVerified: true,
    },
    {
      id: `${prefix}staff`,
      name: "Soporte ficticio",
      email: staffEmail,
      emailVerified: true,
    },
  ]);
});
beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", adminEmail);
  vi.stubEnv("SUPPORT_EMAILS", staffEmail);
  vi.stubEnv("CREDENTIAL_REVIEWER_EMAILS", staffEmail);
  await db
    .update(user)
    .set({ email: adminEmail, emailVerified: true })
    .where(eq(user.id, `${prefix}admin`));
  mocks.session.mockResolvedValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(cleanup);

describe("el endpoint de métricas respeta la identidad actual verificada", () => {
  it("permite a la cuenta administradora verificada", async () => {
    session("admin");
    expect((await GET()).status).toBe(200);
  });
  it.each([
    "anonymous",
    "missing",
    "unverified",
    "changed-email",
    "staff",
  ])("deniega %s antes de leer agregados privados", async (kind) => {
    if (kind !== "anonymous")
      session(
        kind === "missing" ? "missing" : kind === "staff" ? "staff" : "admin",
      );
    if (kind === "unverified")
      await db
        .update(user)
        .set({ emailVerified: false })
        .where(eq(user.id, `${prefix}admin`));
    if (kind === "changed-email")
      await db
        .update(user)
        .set({ email: "metrics-former-admin@example.test" })
        .where(eq(user.id, `${prefix}admin`));
    const batch = vi.spyOn(db, "batch");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(batch).not.toHaveBeenCalled();
  });
  it("una caída del almacén de identidad no permite saltarse la verificación", async () => {
    session("admin");
    vi.spyOn(db.query.user, "findFirst").mockRejectedValue(
      new Error("identity unavailable"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const batch = vi.spyOn(db, "batch");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "metrics_unavailable",
    });
    expect(batch).not.toHaveBeenCalled();
  });
});
