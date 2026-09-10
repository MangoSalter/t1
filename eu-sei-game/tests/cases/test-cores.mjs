// AS CORES QUE DIZEM QUEM É QUEM.
//
// No quadro de sala cada pessoa escolhe uma cor, e é só por ela que se sabe
// de quem foi a letra errada — o nome está num "title", que num telemóvel
// ninguém vê, porque não há rato para lá pousar. A cor é a informação toda.
//
// Duas perguntas diferentes, e só uma delas tem resposta objetiva:
//
//  1. DÁ PARA VER? Uma letra fina sobre a folha é um objeto gráfico, e a
//     regra é 3:1 de contraste. Isto não é gosto: ou se lê, ou não. Falha o
//     teste.
//  2. DÁ PARA DISTINGUIR? Dez cores, e cerca de 6% dos homens não separa
//     vermelho de verde. Tem resposta medida, mas a solução é uma escolha de
//     aparência — está no docs/jogos.md à espera do dono. Aqui só se garante
//     que não PIORA.
import { readFileSync } from "node:fs";
import path from "node:path";

// O room.js não se importa em Node — vai buscar a Firebase a um CDN —, por
// isso as cores saem do ficheiro por leitura, como as chaves das línguas no
// test-linguas.
const fonte = readFileSync(path.join(process.env.EU_SEI_PUBLIC, "js", "room.js"), "utf8");
const bloco = fonte.match(/export const HANGMAN_PLAYER_COLORS = \[(.*?)\];/s);
if (!bloco) { console.error("FALHOU: não encontrei as cores dos jogadores no room.js"); process.exit(1); }
const HANGMAN_PLAYER_COLORS = [...bloco[1].matchAll(/"(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]);

function assert(cond, label) {
  if (!cond) { console.error(`FALHOU: ${label}`); process.exitCode = 1; }
  else console.log(`OK: ${label}`);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

// A folha do quadro de sala. O quadro de sala não tem fundos escuros — só o
// de jogar sozinho tem —, por isso é esta e mais nenhuma.
const FOLHA = "#fffdf7";
const contraste = (a, b) => {
  const [x, y] = [lum(hex(a).map(lin)), lum(hex(b).map(lin))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

console.log("1) Todas as cores de jogador se leem sobre a folha...");
assert(HANGMAN_PLAYER_COLORS.length === 10, `encontrei as dez cores dos jogadores (${HANGMAN_PLAYER_COLORS.length})`);
const fracas = HANGMAN_PLAYER_COLORS
  .map((c) => [c, contraste(c, FOLHA)])
  .filter(([, r]) => r < 3);
console.log(`   ${HANGMAN_PLAYER_COLORS.map((c) => `${c}:${contraste(c, FOLHA).toFixed(1)}`).join(" ")}`);
assert(fracas.length === 0,
  `nenhuma cor de jogador fica abaixo de 3:1 sobre a folha${fracas.length ? ` (${fracas.map(([c, r]) => `${c} ${r.toFixed(1)}`).join(", ")})` : ""}`);

console.log("2) E continuam a distinguir-se umas das outras...");
// Dicromacia por Viénot, Brettel & Mollon (1999); distância CIE76 em Lab.
const MATRIZES = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
  protanopia: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  tritanopia: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
};
const aplicar = (rgb, m) => [0, 1, 2].map((i) =>
  Math.min(1, Math.max(0, m[i][0] * rgb[0] + m[i][1] * rgb[1] + m[i][2] * rgb[2])));
function lab(h, tipo) {
  let rgb = hex(h).map(lin);
  if (tipo !== "normal") rgb = aplicar(rgb, MATRIZES[tipo]);
  const [r, g, b] = rgb;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

let piorDeTodas = Infinity;
let piorPar = "";
for (const tipo of Object.keys(MATRIZES)) {
  const labs = HANGMAN_PLAYER_COLORS.map((c) => lab(c, tipo));
  let pior = Infinity;
  let par = "";
  for (let i = 0; i < labs.length; i += 1) {
    for (let j = i + 1; j < labs.length; j += 1) {
      const d = dE(labs[i], labs[j]);
      if (d < pior) { pior = d; par = `${HANGMAN_PLAYER_COLORS[i]}/${HANGMAN_PLAYER_COLORS[j]}`; }
    }
  }
  console.log(`   ${tipo.padEnd(13)} pior par: ${pior.toFixed(1)} (${par})`);
  if (pior < piorDeTodas) { piorDeTodas = pior; piorPar = `${tipo} ${par}`; }
}
// UMA CATRACA, e não um alvo. O pior par são uns 7 pontos de distância na
// pior das visões — pouco: duas pessoas podem não se distinguir uma da
// outra. Dá para chegar a 24 trocando a paleta, mas isso muda a cara do
// quadro, e a cara do quadro é do dono (está no docs/jogos.md). O que este
// número garante é que ninguém a piora sem dar por isso.
const CHAO = 7.2;
console.log(`   pior de todas: ${piorDeTodas.toFixed(1)} em ${piorPar} (chão ${CHAO})`);
assert(piorDeTodas >= CHAO,
  `as cores não se separam menos do que já se separavam (${piorDeTodas.toFixed(1)}, chão ${CHAO})`);

console.log(process.exitCode ? "\nAlguns testes falharam." : "\nTodos os testes passaram.");
