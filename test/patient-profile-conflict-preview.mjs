import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
await mkdir(join(root, "output/playwright"), { recursive: true, mode: 0o700 });
const dir = await mkdtemp(join(root, "output/playwright/profile-router-"));
const port = Number(process.env.NIDO_PROFILE_PORT || 8873);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Puerto inválido");
await mkdir(join(dir, "app/profile"), { recursive: true });
await mkdir(join(dir, "app/api/control"), { recursive: true });
await writeFile(
  join(dir, "package.json"),
  JSON.stringify({ name: "nido-profile-fixture", private: true }),
);
await writeFile(
  join(dir, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      jsx: "preserve",
      moduleResolution: "bundler",
      paths: { "@/*": [join(root, "src/*")] },
    },
  }),
);
await writeFile(
  join(dir, "next.config.mjs"),
  "export default {reactStrictMode:true,devIndicators:false,experimental:{cpus:1}};",
);
await writeFile(
  join(dir, "app/globals.css"),
  (await readFile(join(root, "src/app/globals.css"), "utf8")).replace(
    '@import "tailwindcss";',
    "",
  ),
);
await writeFile(
  join(dir, "app/layout.tsx"),
  'import "./globals.css";export default function Layout({children}){return <html lang="es"><body>{children}</body></html>;}',
);
await writeFile(
  join(dir, "app/page.tsx"),
  'import Link from "next/link";export default function Page(){return <main><h1>Destino ficticio</h1><Link href="/profile#ficha-privada">Abrir ficha ficticia</Link></main>;}',
);
await writeFile(
  join(dir, "state.ts"),
  `export function state(){return (globalThis as any).__profileFixture ||= {actor:'A',denied:false,expired:false,failRead:false,gate:null,release:null,saveGate:null,releaseSave:null,reads:0,saves:0,revisions:[],profiles:{A:{sex:'female',birthDate:'1992-02-29',consultationReason:'Motivo ficticio A',generalNote:'Nota general ficticia A',revision:1},B:{sex:'male',birthDate:'1980-01-01',consultationReason:'Motivo ficticio B',generalNote:'Nota general ficticia B',revision:1}}};}`,
);
await writeFile(
  join(dir, "profile-harness.tsx"),
  `"use client";import {useState} from 'react';import {PatientProfileEditor} from './patient-profile-editor';import Link from 'next/link';export function Harness({profile,patientId}){const [key,setKey]=useState(0);const [unavailable,setUnavailable]=useState(false);return <main><h1>Ficha ficticia</h1><button type="button" onClick={()=>setKey(v=>v+1)}>Remontar editor ficticio</button><button type="button" onClick={()=>setUnavailable(v=>!v)}>{unavailable?'Restaurar disponibilidad ficticia':'Marcar ficha no disponible'}</button><PatientProfileEditor key={key} patientId={patientId} timeZone="UTC" profile={{...profile,status:unavailable?'unavailable':'ready'}}/><Link href="/">Otra página ficticia</Link></main>;}`,
);
await writeFile(
  join(dir, "app/profile/page.tsx"),
  `import {Harness} from '../../profile-harness';import {state} from '../../state';export const dynamic='force-dynamic';export default function Page(){const s=state();const {revision,...content}=s.profiles[s.actor];return <Harness patientId={s.actor+'-patient'} profile={{status:'ready',content,revision,scope:{accountId:s.actor,professionalId:s.actor+'-professional'}}}/>;}`,
);
await writeFile(
  join(dir, "app/api/control/route.ts"),
  `import {state} from '../../../state';export async function POST(req){const v=await req.json();const s=state();if(v.kind==='actor')s.actor=v.value;if(v.kind==='deny')s.denied=v.value;if(v.kind==='expire')s.expired=v.value;if(v.kind==='failRead')s.failRead=v.value;if(v.kind==='hold')s.gate=new Promise(r=>{s.release=()=>{s.gate=null;r();};});if(v.kind==='release')s.release?.();if(v.kind==='holdSave')s.saveGate=new Promise(r=>{s.releaseSave=()=>{s.saveGate=null;r();};});if(v.kind==='releaseSave')s.releaseSave?.();return Response.json({actor:s.actor,reads:s.reads,saves:s.saves,revisions:s.revisions});}`,
);
await writeFile(
  join(dir, "actions.ts"),
  `"use server";import {state} from './state';export async function savePatientProfile(input){const s=state();s.saves++;s.revisions.push(input.revision);if(!input.consent)return {ok:false,message:'Se requiere autorización manual'};if(s.expired||s.denied||(input.scope&&input.scope.accountId!==s.actor)||input.patientId!==s.actor+'-patient')return {ok:false,accessDenied:true,accountChanged:true,message:'Acceso no disponible'};const row=s.profiles[s.actor];if(row.revision!==input.revision)return {ok:false,conflict:true,message:'Esta ficha cambió en otra ventana. Tu borrador sigue aquí.'};const {patientId,revision,consent,scope,...content}=input;s.profiles[s.actor]={...content,revision:revision+1};if(s.saveGate)await s.saveGate;return {ok:true,message:'Guardado ficticio',revision:revision+1};}export async function loadPatientProfileVersion(input){const s=state();s.reads++;if(s.failRead)throw new Error('Fallo ficticio de consulta');if(s.expired||input.accountId!==s.actor)return {ok:false,accessDenied:true,accountChanged:true,message:'Acceso no disponible'};if(s.denied||input.patientId!==s.actor+'-patient'||input.professionalId!==s.actor+'-professional')return {ok:false,accessDenied:true,message:'Ficha no disponible'};const {revision,...content}=s.profiles[s.actor];const result={ok:true,version:{content,revision,updatedAt:'2026-10-07T10:00:00Z',timeZone:'UTC',scope:{accountId:s.actor,professionalId:s.actor+'-professional'}}};if(s.gate)await s.gate;return result;}`,
);
for (const name of [
  "patient-profile-editor.tsx",
  "patient-profile-fields.tsx",
  "patient-profile.module.css",
  "forms.tsx",
]) {
  await writeFile(
    join(dir, name),
    (await readFile(join(root, "src/components/practice", name), "utf8"))
      .replaceAll(
        '"@/app/pro/pacientes/[patientId]/profile-actions"',
        '"./actions"',
      )
      .replaceAll(
        '"@/lib/practice/patient-profile-fields-model"',
        '"./patient-profile-fields-model"',
      )
      .replaceAll('"@/lib/chat-session-end"', '"./chat-session-end"')
      .replaceAll('"@/lib/geography"', '"./geography"'),
  );
}
await writeFile(
  join(dir, "patient-profile-fields-model.ts"),
  await readFile(
    join(root, "src/lib/practice/patient-profile-fields-model.ts"),
    "utf8",
  ),
);
await writeFile(
  join(dir, "chat-session-end.ts"),
  await readFile(join(root, "src/lib/chat-session-end.ts"), "utf8"),
);
await writeFile(
  join(dir, "geography.ts"),
  await readFile(join(root, "src/lib/geography.ts"), "utf8"),
);
// El componente de comparación se copiará sólo cuando exista; permite reproducción roja anterior.
try {
  await writeFile(
    join(dir, "patient-profile-conflict.tsx"),
    (
      await readFile(
        join(root, "src/components/practice/patient-profile-conflict.tsx"),
        "utf8",
      )
    )
      .replaceAll(
        '"@/app/pro/pacientes/[patientId]/profile-actions"',
        '"./actions"',
      )
      .replaceAll(
        '"@/lib/practice/patient-profile-fields-model"',
        '"./patient-profile-fields-model"',
      )
      .replaceAll('"@/lib/chat-session-end"', '"./chat-session-end"')
      .replaceAll('"@/lib/geography"', '"./geography"'),
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const child = spawn(
  process.execPath,
  [
    join(root, "node_modules/next/dist/bin/next"),
    "dev",
    dir,
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: dir,
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
      JSON.stringify({ url: `http://127.0.0.1:${port}/profile#ficha-privada` }),
    );
    child.stdout.removeAllListeners("data");
  }
});
child.stderr.on("data", (c) => process.stderr.write(c));
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
}
process.once("SIGTERM", close);
process.once("SIGINT", close);
child.once("exit", async () => {
  if (!closing) {
    await rm(dir, { recursive: true, force: true });
    process.exitCode = 1;
  }
});
