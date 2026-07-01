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

// Badge compacto del estado de verificación FPV en la tabla de /admin.
// - verificado: el cruce cédula → Nº FPV + nombre coincidió al dar de alta.
// - no coincide: se consultó FPV pero el Nº o el nombre no cuadran (revisar).
// - declarado sin verificar: dio Nº FPV pero no cédula, así que nunca se cruzó.
// - sin datos: no aportó Nº FPV (otra vía de acreditación).
export function AdminFpvBadge({
  fpvVerified,
  fpvNumber,
  fpvSnapshot,
}: {
  fpvVerified: boolean;
  fpvNumber: string | null;
  fpvSnapshot: string | null;
}) {
  const snapshot = parseSnapshot(fpvSnapshot);
  const official = snapshot?.official ?? null;

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

  if (fpvNumber) {
    return (
      <span>
        <span className="muted">Nº {fpvNumber} — sin verificar</span>
        <br />
        <a href={FPV_CONSULTA_URL} target="_blank" rel="noreferrer">
          Consultar FPV
        </a>
      </span>
    );
  }

  return <span className="muted">—</span>;
}
