import type { Metadata } from "next";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";

const image = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Nido — Consulta psicológica y práctica profesional",
};

// Next.js replaces nested metadata at each route segment. Include these
// defaults in every public page override so its shared card stays complete.
export const PUBLIC_OPEN_GRAPH = {
  type: "website",
  locale: SITE_LOCALE,
  siteName: SITE_NAME,
  images: [image],
} satisfies Metadata["openGraph"];

export const PUBLIC_TWITTER = {
  card: "summary_large_image",
  images: [image],
} satisfies Metadata["twitter"];
