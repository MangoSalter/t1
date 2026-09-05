// Testa cardEvaluateHand/cardScorePlay isoladamente, copiando a lógica pura
// de solo.js (sem DOM) para verificar a avaliação de mãos de póquer.
const CARD_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
function cardChipValue(rank) {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return parseInt(rank, 10);
}
const CARD_HAND_TYPES = [
  { key: "high", label: "Carta Alta", baseChips: 5, baseMult: 1 },
  { key: "pair", label: "Par", baseChips: 10, baseMult: 2 },
  { key: "twopair", label: "Duplo Par", baseChips: 20, baseMult: 2 },
  { key: "trips", label: "Trinca", baseChips: 30, baseMult: 3 },
  { key: "straight", label: "Sequência", baseChips: 30, baseMult: 4 },
  { key: "flush", label: "Flush", baseChips: 35, baseMult: 4 },
  { key: "fullhouse", label: "Full House", baseChips: 40, baseMult: 4 },
  { key: "quads", label: "Poker (4 iguais)", baseChips: 60, baseMult: 7 },
  { key: "straightflush", label: "Straight Flush", baseChips: 100, baseMult: 8 },
];
function cardHandTypeByKey(key) { return CARD_HAND_TYPES.find((h) => h.key === key); }

function cardEvaluateHand(cards) {
  const counts = {};
  cards.forEach((c) => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
  const groups = Object.values(counts).sort((a, b) => b - a);
  const isFlush = cards.length >= 5 && cards.every((c) => c.suit === cards[0].suit);
  const orders = [...new Set(cards.map((c) => CARD_RANKS.indexOf(c.rank)))].sort((a, b) => a - b);
  let isStraight = false;
  if (cards.length >= 5 && orders.length === cards.length) {
    isStraight = orders[orders.length - 1] - orders[0] === cards.length - 1;
  }
  let key;
  if (isStraight && isFlush) key = "straightflush";
  else if (groups[0] === 4) key = "quads";
  else if (groups[0] === 3 && groups[1] === 2) key = "fullhouse";
  else if (isFlush) key = "flush";
  else if (isStraight) key = "straight";
  else if (groups[0] === 3) key = "trips";
  else if (groups[0] === 2 && groups[1] === 2) key = "twopair";
  else if (groups[0] === 2) key = "pair";
  else key = "high";
  return cardHandTypeByKey(key);
}

function c(rank, suit) { return { rank, suit }; }

const cases = [
  { name: "carta alta", cards: [c("2","e"), c("7","c"), c("9","o"), c("J","p"), c("K","e")], expect: "high" },
  { name: "par", cards: [c("2","e"), c("2","c")], expect: "pair" },
  { name: "duplo par", cards: [c("2","e"), c("2","c"), c("9","o"), c("9","p")], expect: "twopair" },
  { name: "trinca", cards: [c("5","e"), c("5","c"), c("5","o")], expect: "trips" },
  { name: "sequência", cards: [c("3","e"), c("4","c"), c("5","o"), c("6","p"), c("7","e")], expect: "straight" },
  { name: "sequência com A alto (10-J-Q-K-A)", cards: [c("10","e"), c("J","c"), c("Q","o"), c("K","p"), c("A","e")], expect: "straight" },
  { name: "flush", cards: [c("2","e"), c("5","e"), c("8","e"), c("J","e"), c("K","e")], expect: "flush" },
  { name: "full house", cards: [c("5","e"), c("5","c"), c("5","o"), c("9","p"), c("9","e")], expect: "fullhouse" },
  { name: "poker (4 iguais)", cards: [c("5","e"), c("5","c"), c("5","o"), c("5","p"), c("9","e")], expect: "quads" },
  { name: "straight flush", cards: [c("3","e"), c("4","e"), c("5","e"), c("6","e"), c("7","e")], expect: "straightflush" },
  { name: "4 naipes diferentes com um par -> pair (nao flush)", cards: [c("2","e"), c("2","c"), c("5","c"), c("8","o"), c("K","p")], expect: "pair" },
  { name: "5 cartas mesmo naipe mas nao sequenciais -> flush", cards: [c("2","c"), c("5","c"), c("8","c"), c("J","c"), c("K","c")], expect: "flush" },
  { name: "quase sequência mas falta uma carta (so 4 selecionadas) -> nao conta straight", cards: [c("3","e"), c("4","c"), c("5","o"), c("6","p")], expect: "high" },
  { name: "par com kicker nao deve virar trinca", cards: [c("5","e"), c("5","c"), c("9","o")], expect: "pair" },
];

let failed = 0;
for (const tc of cases) {
  const result = cardEvaluateHand(tc.cards);
  const ok = result.key === tc.expect;
  console.log(`${ok ? "OK  " : "FAIL"} ${tc.name}: got ${result.key}, expected ${tc.expect}`);
  if (!ok) failed++;
}

// Confere valores de fichas por carta.
const chipChecks = [["2", 2], ["9", 9], ["10", 10], ["J", 10], ["Q", 10], ["K", 10], ["A", 11]];
for (const [rank, expected] of chipChecks) {
  const got = cardChipValue(rank);
  const ok = got === expected;
  console.log(`${ok ? "OK  " : "FAIL"} valor de ${rank}: ${got} (esperado ${expected})`);
  if (!ok) failed++;
}

console.log(failed === 0 ? "\nTodos os testes de lógica passaram." : `\n${failed} teste(s) FALHARAM.`);
process.exitCode = failed === 0 ? 0 : 1;
