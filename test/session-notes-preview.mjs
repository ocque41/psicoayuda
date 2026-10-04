import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Loopback con componentes reales y acciones simuladas. Sin Next, BD o proveedores.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild");
const directory = await mkdtemp(join(root, "output/playwright/notes-preview-"));
const server = createServer(async (request, response) => {
  const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
  response.setHeader("Cache-Control", "no-store");
  if (path === "/brand/nido-icon-64.png") {
    response.setHeader("Content-Type", "image/png");
    response.end(await readFile(join(root, "public/brand/nido-icon-64.png")));
    return;
  }
  const name =
    path === "/fixture.js"
      ? "fixture.js"
      : path === "/global.css"
        ? "global.css"
        : "index.html";
  response.setHeader(
    "Content-Type",
    name.endsWith(".js")
      ? "text/javascript"
      : name.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  response.end(await readFile(join(directory, name)));
});
try {
  await esbuild.build({
    entryPoints: [join(root, "src/tests/fixtures/session-notes-browser.tsx")],
    outfile: join(directory, "fixture.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    tsconfig: join(root, "tsconfig.json"),
    plugins: [
      {
        name: "notes-fixture",
        setup(build) {
          build.onResolve(
            { filter: /^@\/app\/pro\/pacientes\/\[patientId\]\/note-actions$/ },
            () => ({ path: "actions", namespace: "fixture" }),
          );
          build.onResolve({ filter: /^next\/(link|image)$/ }, ({ path }) => ({
            path,
            namespace: "fixture",
          }));
          build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            resolveDir: root,
            loader: "js",
            contents:
              path === "actions"
                ? `
            async function action(kind,input){
              const f=window.nidoNotesFixture;const mode=f.mode;
              f.calls.push({kind,input});if(f.gate)await f.gate;
              if(mode==='throw')throw new Error('Fallo ficticio');
              if(mode==='conflict')return {ok:false,message:'La nota cambió en otra ventana. Tu borrador sigue aquí.'};
              return {ok:true,message:kind==='save'?'Nota guardada.':'Nota eliminada.',id:input.id,revision:input.revision+1};
            }
            export const savePatientNote=input=>action('save',input);
            export const deletePatientNote=(patientId,id,revision)=>action('delete',{patientId,id,revision});
          `
                : path === "next/link"
                  ? 'import {createElement} from "react";export default function Link({href,prefetch,...props}){return createElement("a",{...props,href});}'
                  : 'import {createElement} from "react";export default function Image(props){return createElement("img",props);}',
          }));
        },
      },
    ],
  });
  await writeFile(
    join(directory, "global.css"),
    (await readFile(join(root, "src/app/globals.css"), "utf8")).replace(
      '@import "tailwindcss";',
      "",
    ),
  );
  await writeFile(
    join(directory, "index.html"),
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nido · Notas ficticias</title><link rel="stylesheet" href="/global.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${server.address().port}/`,
      scope: "Componentes reales, acciones ficticias, sin DB/proveedores",
    }),
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
} catch (error) {
  server.close();
  await rm(directory, { recursive: true, force: true });
  throw error;
}
