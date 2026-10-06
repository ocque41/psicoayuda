import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("better-auth/react", () => ({ createAuthClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/app/actions-account", () => ({
  repararRegistroHuerfano: vi.fn(),
}));
vi.mock("@/components/click-tracker", () => ({ trackConversion: vi.fn() }));

import { AuthPanel } from "@/components/auth-panel";

describe("acceso antes de hidratar", () => {
  it.each([
    "signin",
    "signup",
  ] as const)("%s impide el envío nativo antes de cargar JavaScript y nunca usa GET", (defaultMode) => {
    const html = renderToStaticMarkup(
      <AuthPanel defaultMode={defaultMode} googleEnabled />,
    );
    expect(html).toContain('<form method="post">');
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    const submit = buttons.find((button) => button.includes('type="submit"'));
    expect(submit).toContain('disabled=""');
    expect(buttons[0]).toContain('disabled=""');
    expect(html).toContain("<noscript>");
    expect(html).toContain("Activa JavaScript para entrar o crear tu cuenta.");
    // Los campos siguen disponibles para escribir o usar el gestor de claves.
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs.length).toBe(defaultMode === "signup" ? 3 : 2);
    for (const input of inputs) expect(input).not.toContain("disabled");
    expect(inputs.find((input) => input.includes('name="email"'))).toContain(
      'autoComplete="username"',
    );
    expect(inputs.find((input) => input.includes('name="password"'))).toContain(
      `autoComplete="${defaultMode === "signup" ? "new-password" : "current-password"}"`,
    );
    if (defaultMode === "signup") {
      expect(inputs.find((input) => input.includes('name="name"'))).toContain(
        'autoComplete="name"',
      );
    }
  });
});
