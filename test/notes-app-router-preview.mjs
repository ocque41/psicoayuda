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
await mkdir(join(directory, "app/api/control"), { recursive: true });
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
  'import {NoteEditor} from "../../editor";import {fixtureState} from "../../fixture-state";export const dynamic="force-dynamic";export default function Page(){const s=fixtureState();return <main><h1>Notas ficticias · App Router</h1>{[0,1].map(index=><NoteEditor key={"fixture-note-"+index} accountId={s.actor} professionalId={s.actor+"-professional"} patientId="fixture-patient" appointmentId="fixture-session" note={{id:"fixture-note-"+index,content:s.notes[s.actor][index].content,revision:s.notes[s.actor][index].revision,updatedAt:"2026-10-04T12:00:00.000Z"}} />)}</main>;}',
);
await writeFile(
  join(directory, "fixture-state.ts"),
  `
  export function fixtureState(){const root=globalThis as any;return root.__notesFixture ||= {actor:'A',expired:false,gate:null,release:null,saveGate:null,releaseSave:null,saveCalls:0,authCalls:0,saveRevisions:[],notes:{A:[{content:'Apunte ficticio 0',revision:1},{content:'Apunte ficticio 1',revision:1}],B:[{content:'Apunte ficticio B0',revision:1},{content:'Apunte ficticio B1',revision:1}]}};}
`,
);
await writeFile(
  join(directory, "app/api/control/route.ts"),
  `
  import {fixtureState} from '../../../fixture-state';
  export async function POST(request){const input=await request.json();const s=fixtureState();
    if(input.kind==='actor')s.actor=input.value;
    if(input.kind==='expire')s.expired=input.value;
    if(input.kind==='revise'){s.notes[s.actor][0]={content:'Cambio guardado ficticio desde otra ventana',revision:s.notes[s.actor][0].revision+1};}
    if(input.kind==='hold')s.gate=new Promise(resolve=>{s.release=()=>{s.gate=null;resolve();};});
    if(input.kind==='release')s.release?.();
    if(input.kind==='holdSave')s.saveGate=new Promise(resolve=>{s.releaseSave=()=>{s.saveGate=null;resolve();};});
    if(input.kind==='releaseSave')s.releaseSave?.();
    return Response.json({actor:s.actor,expired:s.expired,authCalls:s.authCalls,saveCalls:s.saveCalls,saveRevisions:s.saveRevisions});
  }
`,
);
const editor = await readFile(
  join(root, "src/components/practice/note-editor.tsx"),
  "utf8",
);
await writeFile(
  join(directory, "editor.tsx"),
  editor
    .replace('"@/app/pro/pacientes/[patientId]/note-actions"', '"./actions"')
    .replace(
      '"@/app/pro/pacientes/[patientId]/note-draft-actions"',
      '"./actions"',
    )
    .replace('"@/lib/practice/note-navigation"', '"./note-navigation"')
    .replace('"@/lib/practice/note-drafts"', '"./note-drafts"'),
);
await writeFile(
  join(directory, "note-navigation.ts"),
  await readFile(join(root, "src/lib/practice/note-navigation.ts"), "utf8"),
);
await writeFile(
  join(directory, "note-drafts.ts"),
  await readFile(join(root, "src/lib/practice/note-drafts.ts"), "utf8"),
);
await writeFile(
  join(directory, "actions.ts"),
  `"use server";import {fixtureState} from './fixture-state';
   export type NoteState={ok:boolean;message:string;id?:string;revision?:number};
   export async function authorizeNoteDraft(input){const s=fixtureState();s.authCalls++;const accountCurrent=!s.expired && input.accountId===s.actor;const result={accountCurrent,scopeAllowed:accountCurrent && input.professionalId===s.actor+'-professional' && input.patientId==='fixture-patient' && input.appointmentId==='fixture-session'};if(s.gate)await s.gate;return result;}
   export async function savePatientNote(input){const s=fixtureState();s.saveCalls++;s.saveRevisions.push(input.revision);const index=input.id==='fixture-note-0'?0:1;const note=s.notes[s.actor][index];if(note.revision!==input.revision)return {ok:false,message:'La nota cambió en otra ventana. Tu borrador sigue aquí.'};s.notes[s.actor][index]={content:input.content,revision:input.revision+1};if(s.saveGate)await s.saveGate;return {ok:true,message:'Guardado ficticio',id:input.id,revision:input.revision+1};}
   export async function deletePatientNote(){return {ok:true,message:'Eliminado ficticio'};}
  `,
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
