// Votações do quadro: a regra é MAIORIA DOS LIGADOS, não maioria de quem
// votou. A diferença não é teórica — com "maioria de quem votou", o primeiro
// a carregar no botão decidia por todos antes de os outros abrirem o menu.
import { voteWinner, tallyVotes, votesNeeded, handQueue, connectedPlayerIds, BOARD_MODES }
  from "./js/room.js";

let falhas = 0;
const check = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`   ${ok ? "ok" : "FALHOU"}  ${nome}${ok ? "" : ` — esperava ${JSON.stringify(esperado)}, tenho ${JSON.stringify(real)}`}`);
  if (!ok) falhas += 1;
};

console.log("1) Quantos votos são precisos (metade arredondada para cima)...");
// "Mais de metade" fazia uma sala de dois precisar dos dois votos — esperar
// por toda a gente, que é justamente o que não se quer numa votação.
check("1 jogador", votesNeeded(["a"]), 1);
check("2 jogadores", votesNeeded(["a", "b"]), 1);
check("3 jogadores", votesNeeded(["a", "b", "c"]), 2);
check("4 jogadores", votesNeeded(["a", "b", "c", "d"]), 2);
check("5 jogadores", votesNeeded(["a", "b", "c", "d", "e"]), 3);
check("10 jogadores", votesNeeded("abcdefghij".split("")), 5);

console.log("2) Numa sala grande, um voto sozinho continua a não decidir...");
const cinco = ["a", "b", "c", "d", "e"];
check("1 voto em 5", voteWinner({ a: "forca" }, cinco), null);
check("2 votos em 5", voteWinner({ a: "forca", b: "forca" }, cinco), null);
check("3 votos em 5", voteWinner({ a: "forca", b: "forca", c: "forca" }, cinco), "forca");

console.log("3) Numa sala de dois, não se espera pelo segundo voto...");
check("1 voto em 2", voteWinner({ a: "forca" }, ["a", "b"]), "forca");

console.log("4) Votos de quem já saiu não contam...");
// Uma sala que esvaziou não pode ficar presa num resultado que já ninguém
// quer: os votos de quem se desligou saem da contagem.
check("2 votos, mas 1 saiu (sala de 3 precisa de 2)", voteWinner({ a: "forca", z: "forca" }, ["a", "b", "c"]), null);
check("contagem ignora ausentes", tallyVotes({ a: "forca", z: "forca" }, ["a", "b"]), { forca: 1 });

console.log("5) Um voto por pessoa: mudar de ideias substitui, não acumula...");
// O voto é guardado por uid, por isso votar outra vez sobrepõe-se. Se
// acumulasse, uma pessoa sozinha atingia a maioria a carregar várias vezes.
const votos = {};
votos["a"] = "forca";
votos["a"] = "livre";
check("dois cliques da mesma pessoa", tallyVotes(votos, ["a", "b", "c"]), { livre: 1 });
check("e não chega para decidir numa sala de 3", voteWinner(votos, ["a", "b", "c"]), null);

console.log("6) Sozinho na sala, o voto vale (senão o quadro ficava trancado)...");
check("1 em 1", voteWinner({ a: "forca" }, ["a"]), "forca");

console.log("7) A fila de quem pediu a palavra respeita a ordem de chegada...");
const sala = {
  players: { a: { connected: true }, b: { connected: true }, c: { connected: false } },
  hangman: { hands: { b: 200, a: 100, c: 50 } },
};
// c pediu primeiro mas está desligado: sai da fila.
check("ordem por hora do pedido", handQueue(sala), ["a", "b"]);
check("ligados", connectedPlayerIds(sala), ["a", "b"]);
check("sem mãos no ar", handQueue({ players: sala.players, hangman: {} }), []);

console.log("8) Todo o modo anunciado tem de ter nome e explicação...");
// Regra, não comportamento: um modo novo sem texto aparecia no menu como um
// botão vazio.
const maus = Object.entries(BOARD_MODES).filter(([, m]) => !m.label || !m.hint);
check("modos completos", maus.map(([k]) => k), []);

console.log(falhas === 0 ? "\n=> test-board-votes ok" : `\n=> test-board-votes FALHOU (${falhas})`);
if (falhas > 0) process.exitCode = 1;

console.log("9) A forma da palavra mostra o que deve e esconde o que deve...");
const { maskWord, revealLetter, maskIsSolved } = await import("./js/room.js");
const check2 = (nome, real, esperado) => {
  const ok = real === esperado;
  console.log(`   ${ok ? "ok" : "FALHOU"}  ${nome}${ok ? "" : ` — esperava "${esperado}", tenho "${real}"`}`);
  if (!ok) process.exitCode = 1;
};
// O que interessa: quantas letras, onde acabam as palavras, e se há hífen.
check2("palavra simples", maskWord("Manga"), "_____");
check2("duas palavras", maskWord("Dona Manga"), "____ _____");
check2("com hífen", maskWord("guarda-chuva"), "______-_____");
check2("com acentos (contam como letra)", maskWord("café"), "____");
check2("com número", maskWord("A4"), "__");

console.log("10) Revelar uma letra revela TODAS as suas posições...");
check2("todos os 'a' de banana", revealLetter("banana", "______", "a"), "_a_a_a");
// Procurar não distingue maiúsculas de minúsculas, mas o que aparece é a
// letra COMO ELA ESTÁ na palavra — senão "Ana" revelava-se como "ANA".
check2("procura sem acentos de caixa, revela como está escrito", revealLetter("Ana", "___", "A"), "A_a");
check2("minúscula encontra a maiúscula", revealLetter("Ana", "___", "a"), "A_a");
check2("letra que não existe não muda nada", revealLetter("banana", "______", "z"), "______");
check2("respeita o que já estava revelado", revealLetter("banana", "_a_a_a", "n"), "_anana");
check2("brancos ficam onde estão", revealLetter("dona manga", maskWord("dona manga"), "a"), "___a _a__a");

console.log("11) Resolvido é quando não sobra nenhum espaço...");
const solved = (m) => (maskIsSolved(m) ? "sim" : "nao");
check2("ainda por acabar", solved("_an_na"), "nao");
check2("acabada", solved("banana"), "sim");
check2("com branco no meio", solved("dona manga"), "sim");
check2("vazia não conta como acabada", solved(""), "nao");

console.log("12) Definições do jogo: valores por omissão e validação...");
const { boardSetting, maxMissesOf, BOARD_SETTINGS_SPEC, freeGuessing, canGuessNow } = await import("./js/room.js");
const vazia = { hangman: { mode: "forca" } };
check2("erros por omissão", String(boardSetting(vazia, "forca", "maxMisses")), "6");
check2("quem arrisca por omissão", String(boardSetting(vazia, "forca", "guessMode")), "turnos");
// Um valor inventado não pode passar: cairia num teto que ninguém escolheu.
const inventado = { hangman: { mode: "forca", settings: { maxMisses: 99 } } };
check2("valor inválido cai no valor por omissão", String(boardSetting(inventado, "forca", "maxMisses")), "6");
check2("chave que não existe", String(boardSetting(vazia, "forca", "naoExiste")), "null");
check2("modo sem definições", String((BOARD_SETTINGS_SPEC.livre || []).length), "0");

console.log("13) 'Sem limite' é 0, e 0 não pode ser lido como 'nenhum erro permitido'...");
// Este é o engano fácil: um teto de 0 lido como número faz "misses >= 0"
// dar verdadeiro logo à primeira, e o jogo acabava enforcado sem nenhum erro.
const semLimite = { hangman: { mode: "forca", settings: { maxMisses: 0 } } };
check2("sem limite", String(maxMissesOf(semLimite)), "0");
check2("normal", String(maxMissesOf(vazia)), "6");
const teto = maxMissesOf(semLimite);
check2("com teto 0 o jogo NÃO acaba", String(teto > 0 && 0 >= teto), "false");
check2("com teto 6 e 6 erros o jogo acaba", String(6 >= maxMissesOf(vazia)), "true");

console.log("14) 'Qualquer um arrisca' tira a vez...");
const salaForca = (settings) => ({
  hostId: "a",
  players: { a: { connected: true }, b: { connected: true }, c: { connected: true } },
  hangman: { mode: "forca", leaderId: "a", mask: "___", turnUid: "b", settings },
});
check2("por turnos: só o da vez", String(canGuessNow(salaForca({}), "b")), "true");
check2("por turnos: o outro espera", String(canGuessNow(salaForca({}), "c")), "false");
check2("livre: qualquer um", String(canGuessNow(salaForca({ guessMode: "livre" }), "c")), "true");
check2("mas nunca quem tem a caneta", String(canGuessNow(salaForca({ guessMode: "livre" }), "a")), "false");
check2("nem quem já tem uma tentativa pendente", String(canGuessNow({
  ...salaForca({ guessMode: "livre" }),
  hangman: { ...salaForca({ guessMode: "livre" }).hangman, guesses: { c: { letter: "x" } } },
}, "c")), "false");
check2("nem depois de acertada", String(canGuessNow({
  ...salaForca({}),
  hangman: { ...salaForca({}).hangman, solved: true },
}, "b")), "false");
check2("livre lê-se das definições", String(freeGuessing(salaForca({ guessMode: "livre" }))), "true");
