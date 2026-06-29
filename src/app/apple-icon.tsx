import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Metadatos del icono
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const alt = "Nido";

// Reutiliza la marca vectorial del favicon (sin texto, no requiere fuente).
export default async function AppleIcon() {
  const svg = await readFile(join(process.cwd(), "src/app/icon.svg"), "utf8");
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: "#2f7a5b",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: next/og solo soporta <img> */}
      <img src={src} width={180} height={180} alt="" />
    </div>,
    { ...size },
  );
}
