import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * Sitemap del sitio. Solo rutas públicas e indexables.
 *
 * Se excluyen rutas privadas o transaccionales (/admin, /api, panel
 * profesional, página de gracias) que además se bloquean en robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-06-29");

  const routes: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/ayuda", priority: 0.9, changeFrequency: "monthly" },
    { path: "/emergencia", priority: 0.8, changeFrequency: "monthly" },
    { path: "/recursos", priority: 0.8, changeFrequency: "weekly" },
    {
      path: "/recursos/psicologo-online-gratis-venezuela",
      priority: 0.7,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/ansiedad-despues-del-terremoto",
      priority: 0.7,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/duelo-perdida-de-un-ser-querido",
      priority: 0.6,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/depresion-senales-y-ayuda",
      priority: 0.7,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/ataque-de-panico-que-hacer",
      priority: 0.7,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/insomnio-como-dormir-mejor",
      priority: 0.6,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/soledad-que-hacer",
      priority: 0.6,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/acompanar-a-alguien-en-crisis",
      priority: 0.6,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/apoyo-emocional-anonimo",
      priority: 0.6,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/ayuda-psicologica-para-ninos",
      priority: 0.6,
      changeFrequency: "monthly",
    },
    {
      path: "/recursos/venezolanos-en-el-exterior",
      priority: 0.6,
      changeFrequency: "monthly",
    },
    { path: "/como-funciona", priority: 0.7, changeFrequency: "monthly" },
    {
      path: "/preguntas-frecuentes",
      priority: 0.7,
      changeFrequency: "monthly",
    },
    { path: "/pro", priority: 0.7, changeFrequency: "monthly" },
    { path: "/psicologos", priority: 0.7, changeFrequency: "monthly" },
    { path: "/quienes-somos", priority: 0.6, changeFrequency: "monthly" },
    { path: "/seguridad", priority: 0.6, changeFrequency: "monthly" },
    { path: "/pacto-voluntario", priority: 0.5, changeFrequency: "monthly" },
    { path: "/transparencia", priority: 0.4, changeFrequency: "monthly" },
    { path: "/contacto", priority: 0.4, changeFrequency: "yearly" },
    { path: "/privacidad", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terminos", priority: 0.3, changeFrequency: "yearly" },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
    alternates: {
      languages: {
        "es-VE": absoluteUrl(path),
        es: absoluteUrl(path),
        "x-default": absoluteUrl(path),
      },
    },
  }));
}
