// AS TRÊS LÍNGUAS TÊM DE DIZER AS MESMAS COISAS.
//
// O t() cai para português quando falta uma chave na língua escolhida, e
// devolve STRING VAZIA quando a chave não existe em lado nenhum. As duas
// quedas são silenciosas: uma chave escrita só em pt deixa quem joga em
// inglês a ver português no meio do inglês, e um erro de escrita no nome da
// chave deixa um espaço EM BRANCO no ecrã — sem erro na consola, sem nada.
// Nenhum teste apanhava isto, e o mapa é o jogo em que a casa mais investiu.
//
// Puro de propósito: não precisa de browser e corre em menos de um segundo.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// O caminho vem do runner (EU_SEI_PUBLIC), como em test-mapa.mjs: escrito à
// mão ficava preso à máquina onde foi escrito.
const i18nPath = path.join(process.env.EU_SEI_PUBLIC, "js", "i18n.js");
const { LINGUAS, definirLingua, t } = await import(pathToFileURL(i18nPath).href);

function assert(cond, label) {
  if (!cond) { console.error(`FALHOU: ${label}`); process.exitCode = 1; }
  else console.log(`OK: ${label}`);
}

// Cada língua vive no seu ficheiro (textos-pt.js e companhia), e só a
// escolhida viaja no primeiro carregamento — daí este teste ser AINDA mais
// importante do que era: já não há queda para português a tapar um buraco.
// As chaves saem do ficheiro por leitura, e não por import, porque as
// tabelas não são para ser lidas por ninguém a não ser o t().
const tabelas = {};
for (const { chave } of LINGUAS) {
  const caminho = path.join(process.env.EU_SEI_PUBLIC, "js", `textos-${chave}.js`);
  const fonte = readFileSync(caminho, "utf8");
  tabelas[chave] = [...fonte.matchAll(/^ {2}(\w+):/gm)].map((x) => x[1]);
}

assert(Object.values(tabelas).every((v) => v && v.length > 0), "encontrei as três tabelas de textos no i18n.js");

const pt = tabelas.pt || [];
assert(new Set(pt).size === pt.length, "a tabela portuguesa não tem chaves repetidas");

for (const { chave } of LINGUAS.filter((l) => l.chave !== "pt")) {
  const outras = new Set(tabelas[chave] || []);
  const faltam = pt.filter((k) => !outras.has(k));
  const aMais = [...outras].filter((k) => !pt.includes(k));
  assert(faltam.length === 0, `${chave} tem todas as chaves do português${faltam.length ? ` (faltam: ${faltam.join(", ")})` : ""}`);
  assert(aMais.length === 0, `${chave} não tem chaves que o português não tenha${aMais.length ? ` (a mais: ${aMais.join(", ")})` : ""}`);
}

// Um objeto que diz que sim a tudo: r.pontos, r.favorito.cont, o que vier.
// Serve para chamar as frases com peças a encaixar sem lhes conhecer a forma.
const espelho = () => new Proxy(function () {}, {
  get(_, prop) {
    if (prop === Symbol.toPrimitive) return () => "1";
    if (prop === "then") return undefined;
    return espelho();
  },
  apply: () => espelho(),
});
// Peças a mais são ignoradas pelo JavaScript, peças a menos deixam
// "undefined" no meio da frase — que é precisamente o que se quer apanhar,
// inclusive quando uma tradução se esquece de uma peça que o português tem.
const espelhos = Array.from({ length: 6 }, espelho);

// O que interessa não é a tabela, é o que sai no ecrã: percorre TODAS as
// chaves em TODAS as línguas e não deixa passar nada vazio.
{
  const vazios = [];
  const naoTexto = [];
  for (const { chave: lingua } of LINGUAS) {
    await definirLingua(lingua);
    for (const k of pt) {
      // O t() CHAMA a frase logo, se ela for das que levam peças a encaixar
      // (o retrato do fim do mapa, por exemplo). Por isso passa-se sempre o
      // espelho: para as frases simples é um argumento a mais, que ninguém
      // usa, e para as outras é a forma de as chamar sem lhes saber a forma.
      let v;
      try { v = t(k, ...espelhos); } catch (e) { naoTexto.push(`${lingua}.${k} rebentou: ${e.message}`); continue; }
      if (Array.isArray(v)) {
        if (v.length === 0) vazios.push(`${lingua}.${k} (lista vazia)`);
      } else if (typeof v !== "string") {
        naoTexto.push(`${lingua}.${k} deu ${typeof v}`);
      } else if (v.trim() === "") {
        vazios.push(`${lingua}.${k}`);
      } else if (v.includes("undefined")) {
        naoTexto.push(`${lingua}.${k} deixou "undefined" no meio da frase`);
      }
    }
  }
  assert(vazios.length === 0, `nenhum texto sai vazio em nenhuma língua${vazios.length ? ` (vazios: ${vazios.join(", ")})` : ""}`);
  assert(naoTexto.length === 0, `todos os textos dão texto${naoTexto.length ? ` (${naoTexto.join("; ")})` : ""}`);
}

// A queda para português é de propósito, mas só para chaves que EXISTAM.
// Uma chave inventada tem de dar vazio e não "undefined" a passear no ecrã.
{
  await definirLingua("en");
  const inventada = t("estaChaveNaoExisteDeCerteza");
  assert(inventada === "", `uma chave que não existe dá vazio, não "undefined" (deu ${JSON.stringify(inventada)})`);
  await definirLingua("pt");
}

// Traduzir não é copiar: se o inglês e o espanhol fossem só o português
// outra vez, as tabelas passavam nos testes de cima e o jogo continuava em
// português para toda a gente.
{
  await definirLingua("pt");
  const emPt = pt.map((k) => { const v = t(k, ...espelhos); return typeof v === "string" ? v : ""; });
  for (const lingua of ["en", "es"]) {
    await definirLingua(lingua);
    const iguais = pt.filter((k, i) => {
      const v = t(k, ...espelhos);
      return typeof v === "string" && v.trim() !== "" && v === emPt[i];
    });
    // Alguns textos são mesmo iguais nas três (números, emojis, nomes
    // próprios). O que não pode é serem quase todos.
    const proporcao = iguais.length / pt.length;
    assert(proporcao < 0.5, `${lingua} está mesmo traduzido (${iguais.length}/${pt.length} iguais ao português${proporcao >= 0.5 ? `: ${iguais.slice(0, 8).join(", ")}` : ""})`);
  }
  await definirLingua("pt");
}

// O data-i18n aponta para uma chave, e o i18n-ecra.js só troca o texto SE a
// chave existir ("if (texto)"). Um erro de escrita no nome da chave não dá
// erro nenhum: o elemento fica em português para sempre, em todas as línguas,
// e ninguém dá por isso a não ser que saiba as três. Por isso as chaves
// escritas no HTML confrontam-se com a tabela.
{
  const html = readFileSync(path.join(process.env.EU_SEI_PUBLIC, "index.html"), "utf8");
  const noPt = new Set(pt);
  const usadas = [...html.matchAll(/data-i18n(?:-placeholder|-title|-aria|-alt)?="([^"]+)"/g)].map((m) => m[1]);
  const orfas = [...new Set(usadas.filter((k) => !noPt.has(k)))];
  assert(usadas.length > 0, `o index.html usa chaves de tradução (${usadas.length} atributos)`);
  assert(orfas.length === 0, `todas as chaves do index.html existem na tabela${orfas.length ? ` (não existem: ${orfas.join(", ")})` : ""}`);
}

const MODULOS = ["app.js", "solo.js", "board.js", "board-room.js", "room.js", "data.js",
  "mapa.js", "mapa-ecra.js", "mapa-sala.js", "i18n.js", "i18n-ecra.js", "voice.js",
  "desafio.js", "caos.js", "paleta.js", "oficina.js", "identity.js", "sfx.js",
  "ui-utils.js", "touch-controls.js", "app-state.js"];

// UMA CHAVE QUE NINGUÉM USA quase sempre quer dizer que alguém a escreveu e
// se esqueceu de a LIGAR — e então a frase continua em português no ecrã. Foi
// assim que apareceu a "Sequência atual" da Forca a sozinho: a chave estava
// nas três tabelas e a linha continuava escrita à mão. Os varrimentos não a
// viam, porque não jogam a Forca.
//
// (O peso também conta: a tabela escolhida viaja no primeiro carregamento.)
{
  const codigo = MODULOS
    .map((f) => { try { return readFileSync(path.join(process.env.EU_SEI_PUBLIC, "js", f), "utf8"); } catch { return ""; } })
    .join("\n") + readFileSync(path.join(process.env.EU_SEI_PUBLIC, "index.html"), "utf8");
  // As falas de cada mini-jogo são pedidas com o nome montado à mão
  // (`falas${jogo}`), por isso nenhuma procura literal as encontra.
  const orfas = pt.filter((k) => !k.startsWith("falas") && !new RegExp(`\\b${k}\\b`).test(codigo));
  assert(orfas.length === 0, `nenhuma chave da tabela está por ligar${orfas.length ? ` (ninguém usa: ${orfas.join(", ")})` : ""}`);
}

// AS PEÇAS QUE FALTAM NA CHAMADA, e não na tabela.
//
// O espelho lá em cima chama todas as frases com seis argumentos, por isso
// apanha uma TRADUÇÃO que se esqueceu de uma peça que o português tem. O que
// ele não pode ver é o outro lado: um t("x", a) onde a frase pede dois deixa
// "undefined" no meio do ecrã, e é no código que isso se lê.
{
  const aridade = new Map();
  const tabela = readFileSync(path.join(process.env.EU_SEI_PUBLIC, "js", "textos-pt.js"), "utf8");
  for (const m of tabela.matchAll(/^ {2}(\w+): \(([^)]*)\) =>/gm)) {
    aridade.set(m[1], m[2].split(",").filter((x) => x.trim()).length);
  }
  for (const m of tabela.matchAll(/^ {2}(\w+): "/gm)) {
    if (!aridade.has(m[1])) aridade.set(m[1], 0);
  }
  // Conta os argumentos de uma chamada equilibrando parênteses, chavetas e
  // parêntesis retos — as frases levam expressões lá dentro, e cortar pela
  // primeira vírgula dava contas erradas.
  const argumentos = (txt, abre) => {
    let prof = 0, atual = "", partes = [];
    for (let j = abre; j < txt.length; j += 1) {
      const c = txt[j];
      if ("([{".includes(c)) prof += 1;
      else if (")]}".includes(c)) { prof -= 1; if (prof === 0) { partes.push(atual); break; } }
      if (prof === 1 && c === ",") { partes.push(atual); atual = ""; }
      else if (prof >= 1 && !(prof === 1 && c === "(")) atual += c;
    }
    return partes.map((x) => x.trim()).filter((x) => x !== "").length;
  };
  const maus = [];
  for (const f of MODULOS) {
    let txt;
    try { txt = readFileSync(path.join(process.env.EU_SEI_PUBLIC, "js", f), "utf8"); } catch { continue; }
    for (const m of txt.matchAll(/\bt\((["'])(\w+)\1/g)) {
      const chave = m[2];
      if (!aridade.has(chave)) continue;
      const passados = argumentos(txt, m.index + 1) - 1;
      if (passados !== aridade.get(chave)) {
        maus.push(`${f}: t("${chave}") pede ${aridade.get(chave)} e recebe ${passados}`);
      }
    }
  }
  assert(maus.length === 0, `todas as chamadas ao t() passam as peças que a frase pede${maus.length ? ` (${maus.join("; ")})` : ""}`);
}

console.log(process.exitCode ? "\nAlguns testes falharam." : "\nTodos os testes passaram.");
