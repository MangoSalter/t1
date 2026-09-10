#!/usr/bin/env node
// Runner dos testes headless do "Eu sei!".
//
// Monta uma cópia da app numa pasta temporária, troca lá dentro (e SÓ lá) o
// firebase-init.js verdadeiro pelo stub, serve essa cópia, e corre os casos
// pedidos. public/ nunca é tocado.
//
//   node tests/run.mjs                 # corre tudo
//   node tests/run.mjs solo            # só os casos cujo nome contém "solo"
//   node tests/run.mjs mp-race mp-golf # casos específicos
//   node tests/run.mjs --jobs 1        # um de cada vez (para depurar)
//
// EM PARALELO, e porque é que isso não é trivial: os casos multijogador
// precisam de dois clientes na MESMA sala, e o stub da Firebase partilha o
// estado por localStorage + BroadcastChannel. Isso é partilhado por ORIGEM.
// Dois casos ao mesmo tempo na mesma porta viam a sala um do outro e
// estragavam-se em silêncio — não é um risco teórico, é como o stub funciona.
//
// Por isso cada trabalhador tem o SEU par de portas e a SUA cópia dos casos,
// com os endereços trocados para as portas dele. Origens diferentes, estados
// diferentes, nenhum caso vê o outro.
//
// A cópia dos casos fica dentro de tests/ (e não no /tmp) por uma razão
// concreta: o `import "playwright"` resolve-se subindo as pastas até um
// node_modules, e a partir do /tmp não há nenhum para encontrar.
import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
const casesDir = path.join(here, "cases");
const stub = path.join(here, "stub", "firebase-init.js");
// O Chromium: nesta máquina de trabalho vive numa pasta própria e o
// "headless shell" que o Playwright procura por omissão não está instalado —
// daí o caminho explícito. Noutra máquina qualquer (a do dono, por exemplo)
// esse caminho não existe, e então não se diz nada: o Playwright vai buscar o
// browser que ele próprio instalou. Estava escrito à mão nos 69 casos, o que
// era o mesmo que dizer "esta suite só corre aqui".
const CHROMIUM_DA_CAIXA = "/opt/pw-browsers/chromium";
const chromiumPath = existsSync(CHROMIUM_DA_CAIXA) ? CHROMIUM_DA_CAIXA : "";
const PORTAS_BASE = [8936, 8937];

const args = process.argv.slice(2);
let jobs = 4;
// Por omissão só se vê o que falhou — a suite inteira despejada é ilegível e
// cara. Com --ver mostra-se tudo, que é o que se quer quando se acabou de
// escrever um caso e se precisa de ver se ele testou mesmo alguma coisa.
let verboso = false;
const filters = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--jobs") { jobs = Math.max(1, Number(args[i + 1]) || 1); i += 1; }
  else if (args[i] === "--ver") verboso = true;
  else filters.push(args[i]);
}

const all = (await readdir(casesDir)).filter((f) => f.endsWith(".mjs") && f !== "test-helpers.mjs");
const cases = (filters.length === 0 ? all : all.filter((f) => filters.some((q) => f.includes(q)))).sort();
if (cases.length === 0) {
  console.error(`Nenhum caso corresponde a: ${filters.join(", ")}`);
  process.exit(1);
}
jobs = Math.min(jobs, cases.length);

// Cada trabalhador leva duas portas seguidas a partir da 8936.
const trabalhadores = Array.from({ length: jobs }, (_, i) => ({
  i,
  portas: [PORTAS_BASE[0] + i * 2, PORTAS_BASE[1] + i * 2],
}));
const todasAsPortas = trabalhadores.flatMap((t) => t.portas);

// Se já houver ali alguma coisa a servir, o runner arrancava na mesma e os
// testes iam bater no servidor errado — a passar ou a falhar sobre uma cópia
// da app que não é esta. Mais vale parar e dizer porquê.
for (const port of todasAsPortas) {
  const busy = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) })
    .then(() => true)
    .catch(() => false);
  if (busy) {
    console.error(`A porta ${port} já está ocupada. Fecha o que lá está e corre outra vez — senão os testes corriam contra essa app, não contra esta.`);
    process.exit(1);
  }
}

const root = await mkdtemp(path.join(tmpdir(), "eu-sei-tests-"));
const copiaDosCasos = path.join(here, ".corrida");
await rm(copiaDosCasos, { recursive: true, force: true });
// Servidor de ficheiros, em Node. Era o `python3 -m http.server`, e isso
// obrigava a ter python instalado para correr uma suite de um projeto que é
// só JavaScript — noutra máquina a suite morria antes do primeiro caso, a
// dizer que não encontrava um comando. São vinte linhas; a dependência não
// valia o que custava.
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
function servirPasta(dir, port) {
  const s = createServer(async (req, res) => {
    const pedido = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let alvo = path.join(dir, pedido);
    // Sem isto, um pedido com ".." lia ficheiros de fora da pasta servida.
    if (!alvo.startsWith(dir)) { res.writeHead(403).end(); return; }
    try {
      let info = await stat(alvo);
      if (info.isDirectory()) { alvo = path.join(alvo, "index.html"); info = await stat(alvo); }
      res.writeHead(200, {
        "content-type": TIPOS[path.extname(alvo).toLowerCase()] || "application/octet-stream",
        "content-length": info.size,
      });
      createReadStream(alvo).pipe(res);
    } catch {
      res.writeHead(404).end("não existe");
    }
  });
  s.listen(port);
  return s;
}

const servers = [];
try {
  for (const t of trabalhadores) {
    for (const port of t.portas) {
      const dir = path.join(root, String(port));
      await cp(publicDir, dir, { recursive: true });
      await cp(stub, path.join(dir, "js", "firebase-init.js"));
      // Os casos de lógica pura importam room.js no próprio Node. Precisam da
      // cópia com o stub: o firebase-init.js verdadeiro vai buscar a Firebase
      // a um CDN por https, e o Node não importa de https.
      await cp(casesDir, dir, { recursive: true });
      servers.push(servirPasta(dir, port));
    }
    // A cópia dos casos com as portas deste trabalhador.
    t.dir = path.join(copiaDosCasos, `w${t.i}`);
    await cp(casesDir, t.dir, { recursive: true });
    if (t.i > 0) {
      for (const f of await readdir(t.dir)) {
        if (!f.endsWith(".mjs")) continue;
        const alvo = path.join(t.dir, f);
        const texto = await readFile(alvo, "utf8");
        await writeFile(alvo, texto
          .replaceAll(`localhost:${PORTAS_BASE[0]}`, `localhost:${t.portas[0]}`)
          .replaceAll(`localhost:${PORTAS_BASE[1]}`, `localhost:${t.portas[1]}`));
      }
    }
  }
  await new Promise((r) => setTimeout(r, 800));
  for (const port of todasAsPortas) {
    const res = await fetch(`http://localhost:${port}/index.html`).catch(() => null);
    if (!res || !res.ok) throw new Error(`servidor de teste na porta ${port} não arrancou`);
  }

  const usesPlaywright = new Map();
  for (const file of cases) {
    const src = await readFile(path.join(casesDir, file), "utf8");
    usesPlaywright.set(file, /from "playwright"/.test(src));
  }

  const failed = [];
  const fila = [...cases];
  const correr = (t, file) => new Promise((resolve) => {
    // Onde correr cada caso:
    //  - com playwright: a partir da cópia dos casos deste trabalhador, para
    //    o "import playwright" resolver no node_modules do projeto e os
    //    endereços apontarem às portas dele;
    //  - sem playwright (lógica pura): a partir da cópia temporária servida
    //    na porta dele, onde o firebase-init.js é o stub e portanto
    //    importável pelo Node.
    const from = usesPlaywright.get(file) ? t.dir : path.join(root, String(t.portas[1]));
    // Os casos puros recebem o caminho do ficheiro VERDADEIRO e do stub: a
    // cópia onde correm já tem o stub no lugar do original, e sem isto não há
    // maneira de comparar um com o outro. E comparar é preciso — onde o stub
    // difere do real, os testes que passam não provam nada.
    const p = spawn(process.execPath, [path.join(from, file)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, EU_SEI_PUBLIC: publicDir, EU_SEI_STUB: stub, EU_SEI_CHROMIUM: chromiumPath },
    });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    const kill = setTimeout(() => p.kill("SIGKILL"), 300000);
    p.on("close", (c) => {
      clearTimeout(kill);
      // 120 e nao 40: com 40, uma pilha de erro do Playwright (que sao umas
      // vinte linhas de "retrying click action") empurrava para fora do ecra
      // os passos que diziam ONDE o caso ia. Custou-me uma volta inteira a
      // perceber que o que faltava era o print, nao a causa.
      if (c !== 0) console.log(`${file.padEnd(34)} FALHOU\n${out.split("\n").slice(-120).join("\n")}`);
      else console.log(verboso ? `${file.padEnd(34)} ok\n${out}` : `${file.padEnd(34)} ok`);
      if (c !== 0) failed.push(file);
      resolve();
    });
  });

  await Promise.all(trabalhadores.map(async (t) => {
    for (;;) {
      const file = fila.shift();
      if (!file) return;
      await correr(t, file);
    }
  }));

  console.log(`\n${cases.length - failed.length}/${cases.length} casos passaram.`);
  if (failed.length > 0) {
    console.log("Falharam:\n" + failed.sort().map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
} finally {
  servers.forEach((s) => s.close());
  await rm(root, { recursive: true, force: true });
  await rm(copiaDosCasos, { recursive: true, force: true });
}
