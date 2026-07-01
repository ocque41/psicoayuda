import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllianceRecipients } from "@/lib/admin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAllianceRecipients", () => {
  it("cae a los ADMIN_EMAILS cuando no hay buzón de alianzas configurado", () => {
    vi.stubEnv("ALLIANCES_CONTACT_EMAIL", "");
    vi.stubEnv("ADMIN_EMAILS", "ocquema@gmail.com,martinezra02@gmail.com");
    expect(getAllianceRecipients()).toEqual([
      "ocquema@gmail.com",
      "martinezra02@gmail.com",
    ]);
  });

  it("usa ALLIANCES_CONTACT_EMAIL (normalizado) cuando está presente", () => {
    vi.stubEnv("ALLIANCES_CONTACT_EMAIL", " Alianzas@Nido.org , dos@nido.org ");
    vi.stubEnv("ADMIN_EMAILS", "ocquema@gmail.com");
    expect(getAllianceRecipients()).toEqual([
      "alianzas@nido.org",
      "dos@nido.org",
    ]);
  });
});
