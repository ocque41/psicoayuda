import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFpvNumber, crossCheck, extractFpvNumber } from "@/lib/fpv";

const registro = {
  fpv: "1177",
  cedula: "00000000",
  nacionalidad: "V",
  primerNombre: "Ana",
  segundoNombre: "Paola",
  primerApellido: "Pérez",
  segundoApellido: "Gómez",
  nombreCompleto: "Ana Paola Pérez Gómez",
  universidad: "Universidad Ficticia",
  denominacionTitulo: "Licenciada en Psicología",
  colegios: [{ colegio: "Colegio Ficticio", solvencia: true }],
  statusGeneral: true,
  deletedAt: null,
};

function respond(items: unknown[], status = 200) {
  const fetchMock = vi.fn(
    async (_url: string | URL | Request) =>
      new Response(JSON.stringify({ status, data: { items } }), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

describe("consulta FPV para Admisión", () => {
  it("extrae el Nº FPV de un texto libre sin puntos de millar", () => {
    expect(extractFpvNumber("FPV 1.177")).toBe("1177");
    expect(extractFpvNumber("12345 Colegio de Miranda")).toBe("12345");
    expect(extractFpvNumber("Nº 19.257, colegio 3")).toBe("19257");
    expect(extractFpvNumber("sin número")).toBeNull();
    expect(extractFpvNumber(null)).toBeNull();
  });

  it("acepta el segundo nombre y un solo apellido, sin tildes ni orden", () => {
    for (const fullName of [
      "Paola Pérez",
      "paola gomez",
      "Pérez Gómez, Ana",
      "ANA PEREZ",
    ])
      expect(crossCheck(registro, { fullName }).nameMatch).toBe(true);
    for (const fullName of ["Paola Rodríguez", "Luisa Pérez", "Pérez"])
      expect(crossCheck(registro, { fullName }).nameMatch).toBe(false);
  });

  it("consulta por Nº FPV y nunca devuelve la cédula", async () => {
    const fetchMock = respond([registro]);
    const result = await checkFpvNumber({
      fpvNumber: "1177",
      fullName: "Paola Pérez",
      university: "Universidad Ficticia",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "psicologos_public?fpv=1177&page=1&per_page=5",
    );
    expect(result).toMatchObject({
      status: "match",
      fpv: "1177",
      nameMatch: true,
      universityMatch: true,
      official: {
        nombreCompleto: "Ana Paola Pérez Gómez",
        colegios: [{ colegio: "Colegio Ficticio", solvencia: true }],
      },
    });
    expect(JSON.stringify(result)).not.toContain("00000000");
    expect(JSON.stringify(result)).not.toContain("cedula");
  });

  it("distingue otro nombre, no registrado y FPV caída", async () => {
    respond([registro]);
    expect(
      (await checkFpvNumber({ fpvNumber: "1177", fullName: "Luisa Rojas" }))
        .status,
    ).toBe("name_mismatch");
    respond([{ ...registro, fpv: "9999" }]);
    expect(
      (await checkFpvNumber({ fpvNumber: "1177", fullName: "Paola Pérez" }))
        .status,
    ).toBe("not_found");
    respond([], 503);
    expect(
      (await checkFpvNumber({ fpvNumber: "1177", fullName: "Paola Pérez" }))
        .status,
    ).toBe("unavailable");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("red caída");
      }),
    );
    expect(
      (await checkFpvNumber({ fpvNumber: "1177", fullName: "Paola Pérez" }))
        .status,
    ).toBe("unavailable");
  });
});
