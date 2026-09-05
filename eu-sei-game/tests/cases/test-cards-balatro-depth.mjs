// Testa cardScoringCards isoladamente (copia da lógica pura de solo.js).
const CARD_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
function cardChipValue(rank) {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return parseInt(rank, 10);
}
function cardScoringCards(cards, handTypeKey) {
  const key = handTypeKey;
  if (key === "straight" || key === "flush" || key === "fullhouse" || key === "straightflush") return cards;
  const counts = {};
  cards.forEach((c) => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
  if (key === "quads" || key === "trips" || key === "pair") {
    const n = key === "quads" ? 4 : key === "trips" ? 3 : 2;
    const rank = Object.keys(counts).find((r) => counts[r] === n);
    return cards.filter((c) => c.rank === rank);
  }
  if (key === "twopair") {
    const ranks = Object.keys(counts).filter((r) => counts[r] === 2);
    return cards.filter((c) => ranks.includes(c.rank));
  }
  const best = [...cards].sort((a, b) => cardChipValue(b.rank) - cardChipValue(a.rank))[0];
  return [best];
}
function c(rank, suit) { return { rank, suit }; }

let failed = 0;
function check(name, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  if (!ok) failed++;
}

// Par com 2 kickers: só as 2 cartas do par devem contar.
check(
  "par: só as 2 cartas do par contam (kickers 9,K ficam de fora)",
  cardScoringCards([c("5", "e"), c("5", "c"), c("9", "o"), c("K", "p")], "pair").map((x) => x.rank).sort(),
  ["5", "5"]
);
// Carta alta: só a maior carta conta.
check(
  "carta alta: só a maior carta conta",
  cardScoringCards([c("2", "e"), c("9", "c"), c("K", "o")], "high").map((x) => x.rank),
  ["K"]
);
// Trinca com 2 kickers: só as 3 cartas da trinca contam.
check(
  "trinca: só as 3 cartas da trinca contam",
  cardScoringCards([c("7", "e"), c("7", "c"), c("7", "o"), c("2", "p"), c("A", "e")], "trips").map((x) => x.rank).sort(),
  ["7", "7", "7"]
);
// Duplo par: as 4 cartas dos 2 pares contam, kicker fora.
check(
  "duplo par: as 4 cartas dos pares contam",
  cardScoringCards([c("3", "e"), c("3", "c"), c("8", "o"), c("8", "p"), c("K", "e")], "twopair").map((x) => x.rank).sort(),
  ["3", "3", "8", "8"]
);
// Flush: todas as 5 cartas contam.
check(
  "flush: todas as cartas contam",
  cardScoringCards([c("2", "e"), c("5", "e"), c("8", "e"), c("J", "e"), c("K", "e")], "flush").length,
  5
);

console.log(failed === 0 ? "\nTodos os testes de 'cartas que contam' passaram." : `\n${failed} teste(s) FALHARAM.`);
process.exitCode = failed === 0 ? 0 : 1;
