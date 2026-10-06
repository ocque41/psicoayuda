import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  pro: vi.fn(),
  rows: vi.fn(),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/db", () => ({
  db: { query: { professionals: { findFirst: mocks.pro } } },
}));
vi.mock("@/lib/offers", () => ({ conversationsForProfessional: mocks.rows }));

import { GET } from "@/app/api/pro/chats/route";

beforeEach(() => vi.resetAllMocks());
describe("API de metadatos de chats profesionales", () => {
  it.each([
    "pending",
    "suspended",
    "rejected",
    "deleting",
  ])("no entrega datos a estado %s", async (status) => {
    mocks.session.mockResolvedValue({ user: { id: "fictional-user" } });
    mocks.pro.mockResolvedValue({ id: "fictional-pro", status });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.rows).not.toHaveBeenCalled();
  });
  it("exige sesión y devuelve sólo metadatos de su dueño", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: "fictional-user" } });
    mocks.pro.mockResolvedValue({ id: "fictional-pro", status: "approved" });
    mocks.rows.mockResolvedValue([
      {
        conversationId: "fictional-chat",
        status: "open",
        closedReason: null,
        lastMessageAt: null,
        lastMessageRole: null,
        proLastReadAt: null,
        createdAt: "2026-10-04",
        seekerName: null,
        needCategory: null,
        urgency: null,
        content: "THIS MUST NOT BE SENT",
      },
    ]);
    const response = await GET();
    expect(mocks.rows).toHaveBeenCalledWith("fictional-pro");
    expect(await response.text()).not.toContain("THIS MUST NOT BE SENT");
  });
});
