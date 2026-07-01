import { describe, expect, it } from "vitest";
import { crossCheck } from "@/lib/fpv";

// Registro real devuelto por api.sistema.fpv.org.ve?cedula=27448493 (dato
// público de la propia consulta FPV). Ojo a los detalles que el cruce debe
// tolerar: dobles espacios y espacio final en `nombreCompleto`.
const GABRIELA = {
  id: 19210,
  fpv: "19257",
  colegios: [{ id: 9, colegio: "Dtto. Capital", solvencia: false }],
  nacionalidad: "V",
  tipoDocumento: "cedula",
  cedula: "27448493",
  nombreCompleto: "Gabriela  Rauseo Ruiz ",
  primerNombre: "Gabriela",
  segundoNombre: null,
  primerApellido: "Rauseo",
  segundoApellido: "Ruiz",
  denominacionTitulo: "Psicologo(a)",
  universidad: "UCAB",
  solvenciaColegio: false,
  statusGeneral: false,
  deletedAt: null,
};

describe("crossCheck", () => {
  it("coincide con Nº FPV, nombre y universidad exactos", () => {
    const r = crossCheck(GABRIELA, {
      fpvNumber: "19257",
      fullName: "Gabriela Rauseo Ruiz",
      university: "UCAB",
    });
    expect(r.match).toBe(true);
    expect(r.fpvMatch).toBe(true);
    expect(r.nameMatch).toBe(true);
    expect(r.universityMatch).toBe(true);
    expect(r.official?.fpv).toBe("19257");
    // El snapshot normaliza los espacios del nombre oficial.
    expect(r.official?.nombreCompleto).toBe("Gabriela Rauseo Ruiz");
  });

  it("acepta el Nº FPV con prefijo/ruido no numérico", () => {
    const r = crossCheck(GABRIELA, {
      fpvNumber: "FPV-19257",
      fullName: "Gabriela Rauseo Ruiz",
    });
    expect(r.fpvMatch).toBe(true);
    expect(r.match).toBe(true);
  });

  it("ignora acentos y el orden de los nombres", () => {
    const r = crossCheck(GABRIELA, {
      fpvNumber: "19257",
      fullName: "Ráuseo Ruíz Gabriela",
    });
    expect(r.nameMatch).toBe(true);
    expect(r.match).toBe(true);
  });

  it("no coincide si el Nº FPV es otro", () => {
    const r = crossCheck(GABRIELA, {
      fpvNumber: "99999",
      fullName: "Gabriela Rauseo Ruiz",
    });
    expect(r.fpvMatch).toBe(false);
    expect(r.match).toBe(false);
  });

  it("no coincide si el nombre no cuadra (posible suplantación)", () => {
    const r = crossCheck(GABRIELA, {
      fpvNumber: "19257",
      fullName: "Pedro Pérez",
    });
    expect(r.nameMatch).toBe(false);
    expect(r.match).toBe(false);
  });

  it("universidad es señal blanda: distinta no bloquea el match", () => {
    const r = crossCheck(GABRIELA, {
      fpvNumber: "19257",
      fullName: "Gabriela Rauseo Ruiz",
      university: "UCV",
    });
    expect(r.universityMatch).toBe(false);
    expect(r.match).toBe(true);
  });

  it("universidad reconoce el nombre largo que contiene la sigla", () => {
    const r = crossCheck(GABRIELA, {
      fpvNumber: "19257",
      fullName: "Gabriela Rauseo Ruiz",
      university: "Universidad Católica Andrés Bello (UCAB)",
    });
    expect(r.universityMatch).toBe(true);
  });

  it("sin Nº FPV no hay match aunque el nombre coincida", () => {
    const r = crossCheck(GABRIELA, {
      fpvNumber: undefined,
      fullName: "Gabriela Rauseo Ruiz",
    });
    expect(r.fpvMatch).toBe(false);
    expect(r.match).toBe(false);
  });
});
