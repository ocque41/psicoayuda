import { describe, expect, it } from "vitest";
import { buildNewMessageEmail } from "@/lib/email-templates";

const URL = "https://nido.example/c/conv_abc123";

describe("buildNewMessageEmail", () => {
  it("avisa de forma directa con CTA a responder", () => {
    const mail = buildNewMessageEmail({ conversationUrl: URL });
    expect(mail.subject).toContain("Nido");
    expect(mail.subject.toLowerCase()).toContain("apoyo");
    expect(mail.html).toContain("te escribió directamente");
    expect(mail.html).toContain("Responder ahora");
  });

  it("incluye el enlace a la conversación en html y texto", () => {
    const mail = buildNewMessageEmail({ conversationUrl: URL });
    expect(mail.html).toContain(`href="${URL}"`);
    expect(mail.text).toContain(URL);
  });

  it("marca el correo como primera prioridad", () => {
    const mail = buildNewMessageEmail({ conversationUrl: URL });
    expect(mail.headers.Importance).toBe("high");
    expect(mail.headers["X-Priority"]).toContain("1");
  });

  it("usa el nombre del profesional cuando se da y saluda genérico si no", () => {
    expect(
      buildNewMessageEmail({ conversationUrl: URL, professionalName: "Ana" })
        .html,
    ).toContain("Hola Ana,");
    expect(buildNewMessageEmail({ conversationUrl: URL }).html).toContain(
      "Hola,",
    );
  });

  it("usa 'Alguien' anónimo por defecto (no expone identidad del seeker)", () => {
    const mail = buildNewMessageEmail({ conversationUrl: URL });
    expect(mail.subject.startsWith("Alguien")).toBe(true);
  });

  it("no incluye el contenido del mensaje (confidencialidad)", () => {
    const mail = buildNewMessageEmail({ conversationUrl: URL });
    expect(mail.html).toContain("no incluimos el mensaje");
  });

  it("escapa HTML del nombre para evitar inyección", () => {
    const mail = buildNewMessageEmail({
      conversationUrl: URL,
      professionalName: "<script>x</script>",
    });
    expect(mail.html).not.toContain("<script>x</script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
