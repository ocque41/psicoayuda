import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Metadatos de la imagen (Open Graph / redes sociales)
export const alt =
  "Nido — Ayuda psicológica gratis, confidencial y a distancia en Venezuela";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(
    join(process.cwd(), "public/brand/nido-logo-800.png"),
  );
  const mark = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "72px 80px",
        background: "#faf6f0",
        color: "#2b2723",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* biome-ignore lint/performance/noImgElement: next/og solo soporta <img> */}
        <img src={mark} width={190} height={99} alt="" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
          Ayuda psicológica gratis en Venezuela
        </span>
        <span style={{ fontSize: 34, color: "#6e655b", lineHeight: 1.3 }}>
          Conecta a distancia con psicólogos voluntarios verificados. Sin coste
          y sin crear cuenta.
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: 26, color: "#2f7a5b" }}>
        <span>Gratis</span>
        <span>·</span>
        <span>Confidencial</span>
        <span>·</span>
        <span>A distancia</span>
        <span>·</span>
        <span>Voluntarios verificados</span>
      </div>
    </div>,
    { ...size },
  );
}
