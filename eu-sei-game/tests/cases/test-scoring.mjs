// A PONTUAÇÃO DO JOGO CLÁSSICO — a de verdade, não uma cópia dela.
//
// Este ficheiro tinha aqui dentro uma cópia do computeRoundResults do
// room.js, "mantida em sincronia manual". Não estava: o room.js já devolvia
// gloriaVotes e engracadaVotes em cada resposta e a cópia não devolvia nada
// disso. Uma cópia que se atrasa é pior do que não ter teste, porque continua
// a dizer OK enquanto a pontuação a sério muda por baixo.
//
// Agora importa a função verdadeira. É possível porque os casos puros correm
// dentro de uma cópia da app onde o firebase-init.js é o stub — é assim que o
// test-battle-logic.mjs e o test-arenas.mjs importam o room.js.
import { computeRoundResults, ROUND_GLORIA_BONUS, classificacaoFinal, letraMaisVotada } from "./js/room.js";

function catKey(i) { return "c" + i; }

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


// --- A classificação final, com empates ---
//
// Antes disto o ecrã final ordenava por pontos e dava a coroa ao primeiro da
// lista: dois empatados em primeiro liam "👑" e "#2", e quem decidia era a
// ordem por que tinham entrado na sala. Num jogo de festa o ecrã final é o
// que fica da noite.
{
  const empateNoTopo = classificacaoFinal({
    a: { name: "Ana", score: 30 },
    b: { name: "Beto", score: 30 },
    c: { name: "Carla", score: 10 },
  });
  assertEqual(empateNoTopo.filter((l) => l.primeiro).length, 2, "dois empatados em primeiro são os dois primeiros");
  assertEqual(empateNoTopo.map((l) => l.lugar).join(","), "1,1,3", "depois de dois primeiros vem o TERCEIRO lugar");

  // E sem empates continua a ser 1, 2, 3.
  const semEmpate = classificacaoFinal({
    a: { name: "Ana", score: 30 },
    b: { name: "Beto", score: 20 },
    c: { name: "Carla", score: 10 },
  });
  assertEqual(semEmpate.map((l) => l.lugar).join(","), "1,2,3", "sem empates os lugares são 1,2,3");
  assertEqual(semEmpate[0].jogador.name, "Ana", "quem tem mais pontos vem à frente");

  // Toda a gente a zero é toda a gente em primeiro: é o que aconteceu.
  const todosAZero = classificacaoFinal({ a: { score: 0 }, b: { score: 0 } });
  assertEqual(todosAZero.every((l) => l.primeiro), true, "com todos a zero ninguém foi mais longe do que ninguém");

  // Uma sala vazia não pode rebentar o ecrã final.
  assertEqual(classificacaoFinal({}).length, 0, "uma sala sem jogadores dá uma lista vazia");
}

// A LETRA QUE SAI QUANDO NINGUÉM ESCOLHE.
//
// Quem ganha a bola escolhe a letra. Se pousar o telemóvel, a sala esperava
// para sempre — a escolha da letra era a única fase sem prazo. Agora tem, e
// quando o prazo acaba a letra é a mais votada pelos outros, que até aqui
// votavam para nada. A regra tem de ser DETERMINÍSTICA: durante uma troca de
// anfitrião pode haver dois a fechar a fase, e duas letras diferentes eram
// duas rondas diferentes na mesma sala.
{
  const lp = (candidates, votes) => ({ candidates, votes });

  assertEqual(
    letraMaisVotada(lp(["M", "P", "T"], { a: "P", b: "P", c: "T" })),
    "P",
    "sai a letra mais votada",
  );

  // Sem votos nenhuns não há empate a resolver: sai a primeira, que é o que
  // a regra antiga fazia sempre.
  assertEqual(letraMaisVotada(lp(["M", "P", "T"], {})), "M", "sem votos sai a primeira candidata");
  assertEqual(letraMaisVotada(lp(["M", "P", "T"], undefined)), "M", "sem sequer o objeto dos votos, sai a primeira");

  // Empate: a ordem dos candidatos decide, e é a mesma em todos os browsers.
  assertEqual(
    letraMaisVotada(lp(["M", "P", "T"], { a: "T", b: "P" })),
    "P",
    "no empate ganha a que vem antes na lista de candidatas",
  );

  // Um voto numa letra que já não é candidata (a fase recomeçou por baixo)
  // não pode eleger nada que não esteja no ecrã.
  assertEqual(
    letraMaisVotada(lp(["M", "P"], { a: "Z", b: "Z", c: "P" })),
    "P",
    "um voto fora das candidatas não elege ninguém",
  );

  assertEqual(letraMaisVotada({ candidates: [] }), null, "sem candidatas não há letra");
  assertEqual(letraMaisVotada(null), null, "sem fase de letra não há letra");
}

// O resumo fica no FIM do ficheiro. Ao acrescentar o bloco dos empates
// abaixo dele, a linha "Todos os testes passaram" era impressa antes de eles
// correrem — o exitCode ainda mudava, mas o que se lia mentia (ver a nota
// sobre isto no CLAUDE.md).
console.log(process.exitCode ? "\nAlguns testes falharam." : "\nTodos os testes passaram.");
