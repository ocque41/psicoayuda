import ts from "typescript";

// Comprobación focal sin emitir archivos ni compilar toda la aplicación.
const entries = [
  "src/app/acceso/[token]/route.ts",
  "test/fixtures/e2ee-session/main.tsx",
  "src/app/c/[conversationId]/page.tsx",
  "src/components/e2ee-pro-setup.tsx",
  "src/components/pro-chat-list.tsx",
  "src/components/side-drawer.tsx",
  "src/components/account-actions.tsx",
  "src/components/site-nav.tsx",
  "src/app/admin/lista-de-espera/page.tsx",
  "src/app/lista-de-espera/page.tsx",
  "src/app/profesionales/professional-card.tsx",
  "src/app/pro/dashboard/page.tsx",
  "src/lib/retention.ts",
];
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const program = ts.createProgram(
  [...entries, "src/cloudflare-env.d.ts", "src/worker-bindings.d.ts"],
  { ...parsed.options, noEmit: true, incremental: false, skipLibCheck: true },
);
const diagnostics = ts.getPreEmitDiagnostics(program);
process.stdout.write(
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (value) => value,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => "\n",
  }),
);
console.log(
  `TypeScript focal: ${entries.length} entradas, ${diagnostics.length} diagnósticos.`,
);
process.exitCode = diagnostics.length ? 1 : 0;
