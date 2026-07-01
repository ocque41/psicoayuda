import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { verifyFpvByCedula } from "@/lib/fpv";

export const metadata: Metadata = {
  title: "Probar verificación FPV",
  robots: { index: false, follow: false },
};

// Herramienta solo-admin para probar EN VIVO la misma verificación que corre
// automáticamente en el alta (verifyFpvByCedula), sin tener que crear una cuenta
// de profesional. Es un formulario GET: los parámetros viajan en la URL, así que
// también se puede probar pegando un enlace. No escribe nada en la BD.
export default async function AdminFpvTestPage({
  searchParams,
}: {
  searchParams: Promise<{
    cedula?: string;
    fpv?: string;
    nombre?: string;
    universidad?: string;
  }>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin");

  const { cedula, fpv, nombre, universidad } = await searchParams;
  const result =
    cedula && nombre
      ? await verifyFpvByCedula({
          cedula,
          fpvNumber: fpv ?? null,
          fullName: nombre,
          university: universidad ?? null,
        })
      : null;

  const yesNo = (value: boolean | null) =>
    value === null ? "—" : value ? "sí" : "no";

  return (
    <section className="section">
      <div className="container">
        <h1>Probar verificación FPV</h1>
        <p className="muted">
          Ejecuta la misma comprobación que el alta automática. Consulta{" "}
          <code>api.sistema.fpv.org.ve</code> por cédula y cruza Nº FPV +
          nombre. No guarda nada. <Link href="/admin">← Volver al panel</Link>
        </p>

        <form className="card" method="get">
          <div className="field">
            <label htmlFor="cedula">Cédula</label>
            <input id="cedula" name="cedula" defaultValue={cedula ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="fpv">Nº FPV</label>
            <input id="fpv" name="fpv" defaultValue={fpv ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="nombre">Nombre completo</label>
            <input id="nombre" name="nombre" defaultValue={nombre ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="universidad">Universidad (opcional)</label>
            <input
              id="universidad"
              name="universidad"
              defaultValue={universidad ?? ""}
            />
          </div>
          <button className="button" type="submit">
            Verificar
          </button>
        </form>

        {result ? (
          <div className="card" style={{ marginTop: "16px" }}>
            <h2 style={{ marginTop: 0 }}>
              {result.match ? (
                <span style={{ color: "#137333" }}>✅ COINCIDE</span>
              ) : (
                <span style={{ color: "#b3261e" }}>⚠️ NO COINCIDE</span>
              )}
            </h2>
            {result.error ? (
              <p className="form-error" role="alert">
                No se pudo consultar FPV ({result.error}). Reintenta.
              </p>
            ) : null}
            <table>
              <tbody>
                <tr>
                  <td>Encontrado en FPV</td>
                  <td>{yesNo(result.found)}</td>
                </tr>
                <tr>
                  <td>Nº FPV coincide</td>
                  <td>{yesNo(result.fpvMatch)}</td>
                </tr>
                <tr>
                  <td>Nombre coincide</td>
                  <td>{yesNo(result.nameMatch)}</td>
                </tr>
                <tr>
                  <td>Universidad coincide</td>
                  <td>{yesNo(result.universityMatch)}</td>
                </tr>
              </tbody>
            </table>

            {result.official ? (
              <>
                <h3>Registro oficial</h3>
                <table>
                  <tbody>
                    <tr>
                      <td>Nº FPV</td>
                      <td>{result.official.fpv}</td>
                    </tr>
                    <tr>
                      <td>Nombre</td>
                      <td>{result.official.nombreCompleto}</td>
                    </tr>
                    <tr>
                      <td>Título</td>
                      <td>{result.official.denominacionTitulo ?? "—"}</td>
                    </tr>
                    <tr>
                      <td>Universidad</td>
                      <td>{result.official.universidad ?? "—"}</td>
                    </tr>
                    <tr>
                      <td>Colegios</td>
                      <td>
                        {result.official.colegios.length > 0
                          ? result.official.colegios
                              .map(
                                (c) =>
                                  `${c.colegio} (solvencia: ${c.solvencia ? "sí" : "no"})`,
                              )
                              .join(", ")
                          : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td>Estatus general</td>
                      <td>{yesNo(result.official.statusGeneral)}</td>
                    </tr>
                    <tr>
                      <td>Baja (deletedAt)</td>
                      <td>{result.official.deletedAt ?? "—"}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="muted">
                  Nota: en el endpoint público la solvencia/estatus suele venir
                  en <em>no</em> aunque el registro sea real (el detalle va tras
                  login FPV). Úsalo como señal, no como bloqueo.
                </p>
              </>
            ) : (
              <p className="muted">
                No hay registro oficial para esa cédula (o no se pudo
                consultar).
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
