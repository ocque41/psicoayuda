import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Next dev mínimo, sin la aplicación/BD/proveedores. NoteEditor real con única
// sustitución de su import de Server Actions por acciones ficticias locales.
const root = fileURLToPath(new URL("..", import.meta.url));
await mkdir(join(root, "output/playwright"), { recursive: true });
const directory = await mkdtemp(join(root, "output/playwright/notes-router-"));
const port = Number(process.env.NIDO_NOTES_ROUTER_PORT || 8839);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Puerto inválido");
await mkdir(join(directory, "app/notes"), { recursive: true });
await writeFile(
  join(directory, "package.json"),
  JSON.stringify({ name: "nido-notes-router-fixture", private: true }),
);
await writeFile(
  join(directory, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      jsx: "preserve",
      moduleResolution: "bundler",
      paths: { "@/*": [join(root, "src/*")] },
    },
  }),
);
await writeFile(
  join(directory, "next.config.mjs"),
  "export default {reactStrictMode:true,devIndicators:false,experimental:{cpus:1}};",
);
await writeFile(
  join(directory, "app/layout.tsx"),
  'export default function Layout({children}){return <html lang="es"><body>{children}</body></html>;}',
);
await writeFile(
  join(directory, "app/page.tsx"),
  'import Link from "next/link";export default function Page(){return <main><h1>Destino anterior ficticio</h1><Link href="/notes">Abrir notas ficticias</Link></main>;}',
);
await writeFile(
  join(directory, "app/notes/page.tsx"),
  'import {NoteEditor} from "../../editor";export default function Page(){return <main><h1>Notas ficticias · App Router</h1>{[0,1].map(index=><NoteEditor key={"fixture-note-"+index} patientId="fixture-patient" appointmentId="fixture-session" note={{id:"fixture-note-"+index,content:"Apunte ficticio "+index,revision:1,updatedAt:"2026-10-04T12:00:00.000Z"}} />)}</main>;}',
);
const editor = await readFile(
  join(root, "src/components/practice/note-editor.tsx"),
  "utf8",
);
await writeFile(
  join(directory, "editor.tsx"),
  editor
    .replace('"@/app/pro/pacientes/[patientId]/note-actions"', '"./actions"')
    .replace('"@/lib/practice/note-navigation"', '"./note-navigation"'),
);
await writeFile(
  join(directory, "note-navigation.ts"),
  await readFile(join(root, "src/lib/practice/note-navigation.ts"), "utf8"),
);
await writeFile(
  join(directory, "actions.ts"),
  'export type NoteState={ok:boolean;message:string;id?:string;revision?:number};export async function savePatientNote(input){return {ok:true,message:"Guardado ficticio",id:input.id,revision:input.revision+1};}export async function deletePatientNote(){return {ok:true,message:"Eliminado ficticio"};}',
);
const child = spawn(
  process.execPath,
  [
    join(root, "node_modules/next/dist/bin/next"),
    "dev",
    directory,
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: directory,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DATABASE_URL: "",
      NIDO_NOTES_ENCRYPTION_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
  if (output.includes("Ready in")) {
    console.log(
      JSON.stringify({
        url: `http://127.0.0.1:${port}/`,
        scope: "Next App Router real, NoteEditor real, acciones ficticias",
      }),
    );
    child.stdout.removeAllListeners("data");
  }
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await rm(directory, { recursive: true, force: true });
}
process.once("SIGINT", close);
process.once("SIGTERM", close);
child.once("exit", async () => {
  if (!closing) {
    await rm(directory, { recursive: true, force: true });
    process.exitCode = 1;
  }
});
