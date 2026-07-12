import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("acciones visibles de cuenta", () => {
  it("no anuncia una baja fallida y confirma la completada", () => {
    const action = read("src/app/actions-account.ts");
    const page = read("src/app/pro/page.tsx");

    expect(action).toContain("await purgeAccount(userId)");
    expect(action).toContain("revalidateAccountViews()");
    expect(action).toContain('redirect("/pro?cuenta=borrada")');
    expect(action).toContain("Sigue activa");
    expect(page).toContain("Tu cuenta se borró correctamente.");
  });

  it("muestra el error devuelto por la acción junto al botón", () => {
    const component = read("src/components/account-actions.tsx");

    expect(component).toContain("useActionState");
    expect(component).toContain("deleteState.error");
    expect(component).toContain('role="alert"');
  });
});
