#!/usr/bin/env node
// Runner dos testes headless do "Eu sei!".
//
// Monta uma cópia da app numa pasta temporária, troca lá dentro (e SÓ lá) o
// firebase-init.js verdadeiro pelo stub, serve essa cópia em duas portas e
// corre os casos pedidos. public/ nunca é tocado.
//
//   node tests/run.mjs                 # corre tudo
//   node tests/run.mjs solo            # só os casos cujo nome contém "solo"
//   node tests/run.mjs mp-race mp-golf # casos específicos
//
// Duas portas porque há testes que precisam de dois clientes na mesma sala:
// 8936 serve a cópia "solo" e 8937 a cópia "multijogador", tal como os casos
// esperam.
import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
const casesDir = path.join(here, "cases");
const stub = path.join(here, "stub", "firebase-init.js");
const PORTS = [8936, 8937];

const filters = process.argv.slice(2);
const all = (await readdir(casesDir)).filter((f) => f.endsWith(".mjs") && f !== "test-helpers.mjs");
const cases = filters.length === 0 ? all : all.filter((f) => filters.some((q) => f.includes(q)));
if (cases.length === 0) {
  console.error(`Nenhum caso corresponde a: ${filters.join(", ")}`);
  process.exit(1);
}

// Os casos falam com localhost:8936/8937 por nome, por isso as portas nao sao
// negociaveis. Se ja houver ali alguma coisa a servir, o runner arrancava na
// mesma e os testes iam bater no servidor errado — a passar ou a falhar sobre
// uma copia da app que nao e esta. Mais vale parar e dizer porque.
for (const port of PORTS) {
  const busy = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) })
    .then(() => true)
    .catch(() => false);
  if (busy) {
    console.error(`A porta ${port} ja esta ocupada. Fecha o que la esta e corre outra vez — senao os testes corriam contra essa app, nao contra esta.`);
    process.exit(1);
  }
}

const root = await mkdtemp(path.join(tmpdir(), "eu-sei-tests-"));
const servers = [];
try {
  for (const port of PORTS) {
    const dir = path.join(root, String(port));
    await cp(publicDir, dir, { recursive: true });
    await cp(stub, path.join(dir, "js", "firebase-init.js"));
    // Os casos de logica pura importam room.js no proprio Node. Precisam da
    // copia com o stub: o firebase-init.js verdadeiro vai buscar a Firebase a
    // um CDN por https, e o Node nao importa de https.
    await cp(casesDir, dir, { recursive: true });
    servers.push(spawn("python3", ["-m", "http.server", String(port)], { cwd: dir, stdio: "ignore" }));
  }
  await new Promise((r) => setTimeout(r, 800));
  for (const port of PORTS) {
    const res = await fetch(`http://localhost:${port}/index.html`).catch(() => null);
    if (!res || !res.ok) throw new Error(`servidor de teste na porta ${port} não arrancou`);
  }

  const usesPlaywright = new Map();
  for (const file of cases) {
    const src = await readFile(path.join(casesDir, file), "utf8");
    usesPlaywright.set(file, /from "playwright"/.test(src));
  }

  const failed = [];
  for (const file of cases.sort()) {
    process.stdout.write(`${file.padEnd(34)} `);
    const code = await new Promise((resolve) => {
      // Onde correr cada caso:
      //  - com playwright: a partir de tests/cases/, para o "import
      //    playwright" resolver no node_modules do projeto (falam com a app
      //    por HTTP, por isso a pasta onde vivem e indiferente);
      //  - sem playwright (logica pura): a partir da copia temporaria, onde
      //    o firebase-init.js e o stub e portanto importavel pelo Node.
      const from = usesPlaywright.get(file) ? casesDir : path.join(root, "8937");
      const p = spawn(process.execPath, [path.join(from, file)], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      p.stdout.on("data", (d) => { out += d; });
      p.stderr.on("data", (d) => { out += d; });
      const kill = setTimeout(() => p.kill("SIGKILL"), 300000);
      p.on("close", (c) => {
        clearTimeout(kill);
        if (c !== 0) console.log("FALHOU\n" + out.split("\n").slice(-40).join("\n"));
        else console.log("ok");
        resolve(c);
      });
    });
    if (code !== 0) failed.push(file);
  }

  console.log(`\n${cases.length - failed.length}/${cases.length} casos passaram.`);
  if (failed.length > 0) {
    console.log("Falharam:\n" + failed.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
} finally {
  servers.forEach((s) => s.kill());
  await rm(root, { recursive: true, force: true });
}
