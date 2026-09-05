// Cópia isolada de computeRoundResults (room.js) só para testar a lógica de
// pontuação sem precisar do SDK do Firebase (que não corre em Node puro).
// Mantida em sincronia manual com room.js sempre que a lógica de pontuação
// muda — ver a nota igual no início de test-hangman-logic.mjs etc.
const ROUND_GLORIA_BONUS = 5;
function catKey(i) { return "c" + i; }

function computeRoundResults(room) {
  const players = Object.keys(room.players || {});
  const N = players.length;
  const catIndexes = room.categoriesRound?.categoryIndexes || [];
  const letter = (room.categoriesRound?.letter || "").toUpperCase();
  const results = {};
  const roundPoints = {};
  players.forEach((uid) => { roundPoints[uid] = 0; results[uid] = {}; });

  catIndexes.forEach((ci) => {
    const entries = players.map((uid) => {
      const text = (room.answers?.[uid]?.[catKey(ci)] || "").trim();
      return { uid, text };
    });
    const othersCount = Math.max(N - 1, 0);
    entries.forEach((e) => {
      e.startsOk = e.text.length > 0 && e.text[0].toUpperCase() === letter;
      const voteKey = `${e.uid}_${ci}`;
      const kinds = Object.values(room.votes?.[voteKey] || {});
      const invalidCount = kinds.filter((k) => k === "invalid").length;
      const gloriaCount = kinds.filter((k) => k === "gloria").length;
      const engracadaCount = kinds.filter((k) => k === "engracada").length;
      e.invalidByVote = othersCount > 0 && invalidCount > Math.floor(othersCount / 2);
      e.gloriaByVote = othersCount > 0 && gloriaCount > Math.floor(othersCount / 2);
      e.gloriaCount = gloriaCount;
      e.engracadaCount = engracadaCount;
      e.isValid = e.text.length > 0 && (e.gloriaByVote || (e.startsOk && !e.invalidByVote));
    });

    const validEntries = entries.filter((e) => e.isValid);
    const counts = {};
    validEntries.forEach((e) => {
      const key = e.text.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });

    entries.forEach((e) => {
      let status, points;
      if (!e.text) {
        status = "vazia"; points = 0;
      } else if (!e.isValid) {
        if (e.engracadaCount > 0) { status = "engracada"; points = 2; }
        else { status = "invalida"; points = 0; }
      } else {
        const key = e.text.toLowerCase();
        const repeated = counts[key] > 1;
        const base = repeated ? 5 : 10;
        const bonus = e.gloriaByVote ? ROUND_GLORIA_BONUS : 0;
        status = repeated ? "valida-repetida" : "valida-unica";
        points = base + bonus;
      }
      results[e.uid][catKey(ci)] = { text: e.text, status, points };
      roundPoints[e.uid] += points;
    });
  });

  return { results, roundPoints };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FALHOU: ${label} — esperado ${expected}, obtido ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${label} (${actual})`);
  }
}

// Cenário 1: única categoria "Fruta" (índice 6), letra "M", 4 jogadores.
// A: "Maçã" (válida única)
// B: "Manga" / C: "manga" (válida repetida, case-insensitive)
// D: "Xurrasco" (não começa por M -> inválida)
{
  const room = {
    players: { A: {}, B: {}, C: {}, D: {} },
    categoriesRound: { letter: "M", categoryIndexes: [6] },
    answers: {
      A: { [catKey(6)]: "Maçã" },
      B: { [catKey(6)]: "Manga" },
      C: { [catKey(6)]: "manga" },
      D: { [catKey(6)]: "Xurrasco" },
    },
    votes: {},
  };
  const { roundPoints, results } = computeRoundResults(room);
  assertEqual(roundPoints.A, 10, "resposta válida e única = 10 pts");
  assertEqual(roundPoints.B, 5, "resposta válida repetida = 5 pts (B)");
  assertEqual(roundPoints.C, 5, "resposta válida repetida = 5 pts (C, case-insensitive)");
  assertEqual(roundPoints.D, 0, "não começa pela letra = 0 pts");
  assertEqual(results.D[catKey(6)].status, "invalida", "estado 'invalida' para D");
}

// Cenário 2: votação Inválida por maioria. 4 jogadores (3 "outros"),
// precisa de MAIS de metade (>1.5, ou seja >=2) votos Inválida para invalidar.
{
  const base = {
    players: { A: {}, B: {}, C: {}, D: {} },
    categoriesRound: { letter: "P", categoryIndexes: [0] },
    answers: { A: { [catKey(0)]: "Pedro" }, B: {}, C: {}, D: {} },
  };
  const withOneVote = { ...base, votes: { "A_0": { B: "invalid" } } };
  const r1 = computeRoundResults(withOneVote);
  assertEqual(r1.roundPoints.A, 10, "1 voto inválido (de 3) NÃO invalida (precisa >metade)");

  const withTwoVotes = { ...base, votes: { "A_0": { B: "invalid", C: "invalid" } } };
  const r2 = computeRoundResults(withTwoVotes);
  assertEqual(r2.roundPoints.A, 0, "2 votos inválidos (de 3) invalida (maioria)");
}

// Cenário 3: Engraçada substitui 0 pts de uma resposta inválida por 2 pts fixos,
// independentemente do nº de votos Engraçada.
{
  const room = {
    players: { A: {}, B: {}, C: {} },
    categoriesRound: { letter: "Z", categoryIndexes: [0] },
    answers: { A: { [catKey(0)]: "Batata" }, B: {}, C: {} }, // não começa por Z
    votes: { "A_0": { B: "engracada", C: "engracada" } }, // 2 votos engraçada
  };
  const { roundPoints } = computeRoundResults(room);
  assertEqual(roundPoints.A, 2, "resposta inválida + engraçada = 2 pts fixos (não escala com votos)");
}

// Cenário 4: Glória por maioria dá um bónus fixo a uma resposta já válida
// (substitui o antigo "+2 por cada voto", que escalava sem limite).
{
  const room = {
    players: { A: {}, B: {}, C: {}, D: {} },
    categoriesRound: { letter: "C", categoryIndexes: [0] },
    answers: { A: { [catKey(0)]: "Cor-de-rosa" }, B: {}, C: {}, D: {} },
    votes: { "A_0": { B: "gloria", C: "gloria" } }, // 2 de 3 outros = maioria
  };
  const { roundPoints } = computeRoundResults(room);
  assertEqual(roundPoints.A, 10 + ROUND_GLORIA_BONUS, "válida única (10) + bónus fixo de Glória por maioria = 15 pts");
}

// Cenário 5: resposta vazia = 0 pts, sem precisar de voto nenhum.
{
  const room = {
    players: { A: {}, B: {} },
    categoriesRound: { letter: "Q", categoryIndexes: [0] },
    answers: { A: {}, B: { [catKey(0)]: "Queijo" } },
    votes: {},
  };
  const { roundPoints, results } = computeRoundResults(room);
  assertEqual(roundPoints.A, 0, "resposta vazia = 0 pts");
  assertEqual(results.A[catKey(0)].status, "vazia", "estado 'vazia' correto");
}

// Cenário 6 (NOVO): Glória por maioria torna válida uma resposta que NÃO
// começava pela letra certa — o veredito da equipa vale mais do que a
// verificação automática. Só 1 voto Glória (sem maioria) não chega.
{
  const base = {
    players: { A: {}, B: {}, C: {}, D: {} },
    categoriesRound: { letter: "M", categoryIndexes: [0] },
    answers: { A: { [catKey(0)]: "Sardinha" }, B: {}, C: {}, D: {} }, // não começa por M
  };
  const withOneGloria = { ...base, votes: { "A_0": { B: "gloria" } } };
  const r1 = computeRoundResults(withOneGloria);
  assertEqual(r1.roundPoints.A, 0, "1 voto Glória (de 3) NÃO valida (precisa >metade)");
  assertEqual(r1.results.A[catKey(0)].status, "invalida", "continua 'invalida' sem maioria");

  const withMajorityGloria = { ...base, votes: { "A_0": { B: "gloria", C: "gloria" } } };
  const r2 = computeRoundResults(withMajorityGloria);
  assertEqual(r2.roundPoints.A, 10 + ROUND_GLORIA_BONUS, "maioria de Glória valida mesmo sem cumprir a letra (10+5=15)");
  assertEqual(r2.results.A[catKey(0)].status, "valida-unica", "estado passa a 'valida-unica'");
}

// Cenário 7 (NOVO): um único voto por votante — Inválida e Glória não se
// acumulam na mesma resposta (o mesmo votante só pode ter UM valor
// guardado por resposta, nunca os dois em simultâneo). Este teste confirma
// que a função de pontuação lida bem com o formato de voto único (um só
// valor por votante), que é o que castVote agora escreve.
{
  const room = {
    players: { A: {}, B: {}, C: {} },
    categoriesRound: { letter: "P", categoryIndexes: [0] },
    answers: { A: { [catKey(0)]: "Pêra" }, B: {}, C: {} },
    // B só pode ter guardado UM valor — aqui simula-se o estado depois de
    // B ter mudado de "invalid" para "gloria" (substituição, não soma).
    votes: { "A_0": { B: "gloria" } },
  };
  const { roundPoints } = computeRoundResults(room);
  assertEqual(roundPoints.A, 10, "só o voto mais recente de B (gloria, sem maioria) conta — resposta válida normal");
}

console.log(process.exitCode ? "\nAlguns testes falharam." : "\nTodos os testes passaram.");
