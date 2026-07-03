import type { FpvVerification } from "@/lib/fpv";

// Enlace a la consulta pública de FPV para que el admin contraste a mano.
const FPV_CONSULTA_URL = "https://sistema.fpv.org.ve/consulta-psicologos";

function parseSnapshot(raw: string | null): FpvVerification | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FpvVerification;
  } catch {
    return null;
  }
}

// Badge compacto del estado de verificación de credencial en /admin.
// - Auxiliar no clínico: no tiene credencial que verificar.
// - ✅ FPV verificado: el cruce cédula → Nº FPV + nombre coincidió (Venezuela, automático).
// - ✅ Credencial confirmada: un admin la cotejó a mano (fuera de Venezuela: colegiado/cédula profesional).
// - ⚠️ No coincide: se consultó FPV pero el Nº o el nombre no cuadran (revisar).
// - ⏳ Verificación pendiente: aprobado y activo, pero su credencial aún no se confirmó.
export function AdminFpvBadge({
  fpvVerified,
  fpvNumber,
  fpvSnapshot,
  credentialConfirmed = false,
  nonClinicalHelper = false,
}: {
  fpvVerified: boolean;
  fpvNumber: string | null;
  fpvSnapshot: string | null;
  credentialConfirmed?: boolean;
  nonClinicalHelper?: boolean;
}) {
  const snapshot = parseSnapshot(fpvSnapshot);
  const official = snapshot?.official ?? null;

  // Auxiliar no clínico: declara que no ejerce con licencia, no hay credencial que verificar.
  if (nonClinicalHelper) {
    return (
      <span className="muted">
        Auxiliar no clínico · sin credencial que verificar
      </span>
    );
  }

  if (fpvVerified && official) {
    return (
      <span>
        <strong style={{ color: "#137333" }}>✅ FPV verificado</strong>
        <br />
        <span className="muted">
          Nº {official.fpv} · {official.nombreCompleto}
          {official.universidad ? ` · ${official.universidad}` : ""}
        </span>
      </span>
    );
  }

  // Confirmada a mano por el equipo (España, México, etc., donde no hay FPV).
  if (credentialConfirmed) {
    return (
      <span>
        <strong style={{ color: "#137333" }}>✅ Credencial confirmada</strong>
        <br />
        <span className="muted">Revisada manualmente por el equipo.</span>
      </span>
    );
  }

  if (snapshot) {
    // Se consultó FPV y no cuadró: decir qué falló para orientar la revisión.
    const reason = !snapshot.found
      ? "cédula no encontrada en FPV"
      : !snapshot.fpvMatch
        ? `el Nº FPV no coincide${official?.fpv ? ` (oficial: ${official.fpv})` : ""}`
        : !snapshot.nameMatch
          ? `el nombre no coincide${official?.nombreCompleto ? ` (oficial: ${official.nombreCompleto})` : ""}`
          : snapshot.error
            ? "no se pudo consultar FPV"
            : "sin coincidencia";
    return (
      <span>
        <strong style={{ color: "#b3261e" }}>⚠️ No coincide</strong>
        <br />
        <span className="muted">
          {fpvNumber ? `Declaró Nº ${fpvNumber} — ` : ""}
          {reason}.{" "}
        </span>
        <a href={FPV_CONSULTA_URL} target="_blank" rel="noreferrer">
          Consultar FPV
        </a>
      </span>
    );
  }

  // Pendiente: aprobado y activo, pero su credencial aún no se confirmó.
  return (
    <span>
      <strong style={{ color: "#a15c00" }}>⏳ Verificación pendiente</strong>
      <br />
      <span className="muted">
        {fpvNumber ? (
          <>
            Declaró Nº FPV {fpvNumber}.{" "}
            <a href={FPV_CONSULTA_URL} target="_blank" rel="noreferrer">
              Consultar FPV
            </a>
          </>
        ) : (
          "Confírmalo con el registro oficial de su país (colegiado / cédula profesional)."
        )}
      </span>
    </span>
  );
}
