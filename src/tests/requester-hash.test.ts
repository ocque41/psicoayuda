import { describe, expect, it } from "vitest";
import { hashRequesterAddress } from "@/lib/requester-hash";

describe("hash de conexión por propósito", () => {
  it("no permite relacionar contacto y solicitud de ayuda", () => {
    const ip = "203.0.113.15";
    const secret = "secreto-de-prueba-largo";

    const contactHash = hashRequesterAddress(ip, "contact_message", secret);
    const helpHash = hashRequesterAddress(ip, "help_request", secret);

    expect(contactHash).toHaveLength(64);
    expect(helpHash).toHaveLength(64);
    expect(contactHash).not.toBe(helpHash);
    expect(contactHash).not.toContain(ip);
  });
});
