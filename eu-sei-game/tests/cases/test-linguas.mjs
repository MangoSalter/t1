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
import { LINGUAS, definirLingua, t } from "/home/user/desktop-tutorial/eu-sei-game/public/js/i18n.js";
import { readFileSync } from "node:fs";

function assert(cond, label) {
  if (!cond) { console.error(`FALHOU: ${label}`); process.exitCode = 1; }
  else console.log(`OK: ${label}`);
}

// As tabelas não são exportadas (e não devem ser: quem lê textos usa o t()),
// por isso as chaves saem do ficheiro. É frágil o suficiente para avisar se
// alguém mudar a forma da tabela, que é justamente quando se quer olhar.
const fonte = readFileSync("/home/user/desktop-tutorial/eu-sei-game/public/js/i18n.js", "utf8");
const tabelas = {};
for (const { chave } of LINGUAS) {
  const m = fonte.match(new RegExp(`\\n  ${chave}: \\{(.*?)\\n  \\},`, "s"));
  tabelas[chave] = m ? [...m[1].matchAll(/^ {4}(\w+):/gm)].map((x) => x[1]) : null;
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
    definirLingua(lingua);
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
  definirLingua("en");
  const inventada = t("estaChaveNaoExisteDeCerteza");
  assert(inventada === "", `uma chave que não existe dá vazio, não "undefined" (deu ${JSON.stringify(inventada)})`);
  definirLingua("pt");
}

// Traduzir não é copiar: se o inglês e o espanhol fossem só o português
// outra vez, as tabelas passavam nos testes de cima e o jogo continuava em
// português para toda a gente.
{
  definirLingua("pt");
  const emPt = pt.map((k) => { const v = t(k, ...espelhos); return typeof v === "string" ? v : ""; });
  for (const lingua of ["en", "es"]) {
    definirLingua(lingua);
    const iguais = pt.filter((k, i) => {
      const v = t(k, ...espelhos);
      return typeof v === "string" && v.trim() !== "" && v === emPt[i];
    });
    // Alguns textos são mesmo iguais nas três (números, emojis, nomes
    // próprios). O que não pode é serem quase todos.
    const proporcao = iguais.length / pt.length;
    assert(proporcao < 0.5, `${lingua} está mesmo traduzido (${iguais.length}/${pt.length} iguais ao português${proporcao >= 0.5 ? `: ${iguais.slice(0, 8).join(", ")}` : ""})`);
  }
  definirLingua("pt");
}

console.log(process.exitCode ? "\nAlguns testes falharam." : "\nTodos os testes passaram.");
