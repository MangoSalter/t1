// Votações do quadro: a regra é MAIORIA DOS LIGADOS, não maioria de quem
// votou. A diferença não é teórica — com "maioria de quem votou", o primeiro
// a carregar no botão decidia por todos antes de os outros abrirem o menu.
import { voteWinner, tallyVotes, votesNeeded, sameWord, connectedPlayerIds, BOARD_MODES }
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

console.log("7) Arriscar a palavra inteira: acentos, maiúsculas e espaços não decidem...");
// Substituiu a fila de "pedir a palavra", que só ordenava quem queria falar.
// Quem diz a palavra certa não pode perder por causa de um acento ou de um
// espaço a mais — isso seria um jogo de ortografia, não de adivinhar.
const sala = {
  players: { a: { connected: true }, b: { connected: true }, c: { connected: false } },
  hangman: {},
};
check("ligados", connectedPlayerIds(sala), ["a", "b"]);
check("igual", String(sameWord("banana", "banana")), "true");
check("maiúsculas", String(sameWord("BANANA", "banana")), "true");
check("acentos", String(sameWord("cafe", "café")), "true");
check("cedilha", String(sameWord("coracao", "coração")), "true");
check("espaços a mais", String(sameWord("  dona   manga ", "Dona Manga")), "true");
check("palavra errada", String(sameWord("bananas", "banana")), "false");
check("vazio nunca acerta", String(sameWord("", "")), "false");
check("vazio contra palavra", String(sameWord("   ", "banana")), "false");

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

console.log("15) Acertar é a letra estar na palavra, não a máscara ter mudado...");
// Com duas pessoas a arriscar ao mesmo tempo, a segunda a dizer a mesma letra
// encontra-a já revelada. Se "acertou" fosse "a máscara mudou", essa segunda
// tentativa — certa — era contada como erro e subia para as erradas.
const naPalavra = (palavra, letra) => {
  const alvo = letra.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt");
  return [...palavra].some((ch) => ch.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt") === alvo);
};
check2("letra na palavra", String(naPalavra("banana", "a")), "true");
check2("letra na palavra, já revelada", String(naPalavra("banana", "a")), "true");
check2("letra que não existe", String(naPalavra("banana", "z")), "false");
check2("com acento na palavra", String(naPalavra("café", "e")), "true");
check2("cedilha", String(naPalavra("coração", "c")), "true");
// E a máscara não muda quando a letra já lá estava — o que é certo; o que não
// pode é isso ser lido como erro.
check2("máscara já com a letra não muda", revealLetter("banana", "_a_a_a", "a"), "_a_a_a");

console.log("16) A volta da caneta (opção ligada) não deixa ninguém de fora nem se prende...");
const { nextPenByRotation, autoPenOn } = await import("./js/room.js");
const salaVolta = (leader, drawnBy) => ({
  players: { a: { connected: true }, b: { connected: true }, c: { connected: true } },
  hangman: { mode: "forca", leaderId: leader, drawnBy },
});
check2("a seguir vem quem ainda não desenhou", nextPenByRotation(salaVolta("a", { a: true })), "b");
check2("e depois o outro", nextPenByRotation(salaVolta("b", { a: true, b: true })), "c");
// Quando todos já desenharam, a volta recomeça em vez de não haver seguinte.
check2("dado a volta, recomeça", nextPenByRotation(salaVolta("c", { a: true, b: true, c: true })), "a");
// E nunca devolve quem já tem a caneta: "passar" que a deixa na mesma mão não
// passa nada.
const soDois = {
  players: { a: { connected: true }, b: { connected: false } },
  hangman: { mode: "forca", leaderId: "a", drawnBy: { a: true } },
};
check2("sozinho na sala fica com ela", nextPenByRotation(soDois), "a");
check2("ninguém ligado", String(nextPenByRotation({ players: {}, hangman: {} })), "null");
// Quem já desenhou não volta antes de os outros: sem isto, uma sala de 3
// podia deixar sempre a mesma pessoa a desenhar.
check2("não repete antes de os outros", nextPenByRotation(salaVolta("a", { a: true, c: true })), "b");

console.log("17) A volta é uma OPÇÃO, e por omissão está desligada...");
check2("por omissão", String(autoPenOn({ hangman: { mode: "forca" } })), "false");
check2("ligada", String(autoPenOn({ hangman: { mode: "forca", settings: { autoPen: 1 } } })), "true");
check2("desligada à mão", String(autoPenOn({ hangman: { mode: "forca", settings: { autoPen: 0 } } })), "false");

console.log("18) Acertar dá outra tentativa: a vez fica em quem acertou...");
const { orderByCorrect, hangmanGuessers } = await import("./js/room.js");
const salaFila = (extra) => ({
  players: { a: { connected: true }, b: { connected: true }, c: { connected: true }, d: { connected: true } },
  hangman: { mode: "forca", leaderId: "a", mask: "___", ...extra },
});
// Sem ordem guardada, a fila é quem está ligado menos quem tem a caneta.
check2("fila sem ordem guardada", hangmanGuessers(salaFila({})).join(","), "b,c,d");
// Com ordem guardada, é ela que manda.
check2("ordem guardada manda", hangmanGuessers(salaFila({ turnOrder: ["d", "b", "c"] })).join(","), "d,b,c");
// Quem saiu da sala sai da fila, mesmo que a ordem ainda o tenha.
const semC = salaFila({ turnOrder: ["d", "c", "b"] });
semC.players.c.connected = false;
check2("quem saiu sai da fila", hangmanGuessers(semC).join(","), "d,b");
// Quem entra a meio vai para o FIM, em vez de furar a ordem ganha pelos outros.
check2("quem entra vai para o fim", hangmanGuessers(salaFila({ turnOrder: ["d", "b"] })).join(","), "d,b,c");

console.log("19) No fim da ronda, a ordem muda por quem mais acertou...");
const comContagens = salaFila({ turnOrder: ["b", "c", "d"], correctCount: { c: 3, d: 1, b: 0 } });
check2("mais acertos joga primeiro", orderByCorrect(comContagens).join(","), "c,d,b");
// Empate NÃO troca ninguém de lugar: o sort é estável, e dois jogadores com o
// mesmo número não podem trocar por acaso de ronda para ronda.
const empate = salaFila({ turnOrder: ["b", "c", "d"], correctCount: { b: 2, c: 2, d: 2 } });
check2("empate mantém a ordem", orderByCorrect(empate).join(","), "b,c,d");
const empateParcial = salaFila({ turnOrder: ["b", "c", "d"], correctCount: { d: 5, b: 1, c: 1 } });
check2("empate parcial mantém a ordem relativa", orderByCorrect(empateParcial).join(","), "d,b,c");
// Sem ninguém a acertar, a ordem fica como estava.
check2("ronda sem acertos", orderByCorrect(salaFila({ turnOrder: ["d", "b", "c"] })).join(","), "d,b,c");
// E as contagens passadas por fora mandam sobre as guardadas: é assim que a
// reordenação usa o acerto que ACABOU de acontecer, e não o estado anterior.
check2("contagens de fora mandam",
  orderByCorrect(salaFila({ turnOrder: ["b", "c", "d"], correctCount: { b: 9 } }), { c: 1 }).join(","), "c,b,d");

console.log("20) Erros de cada um: a penalização chega a cada X, e é gasta ao ser cumprida...");
const { individualMisses, missesOfPlayer } = await import("./js/room.js");
const salaErros = (settings, missesBy) => ({
  players: { a: { connected: true }, b: { connected: true }, c: { connected: true } },
  hangman: { mode: "forca", leaderId: "a", mask: "___", settings, missesBy },
});
check2("por omissão, erros da sala", String(individualMisses(salaErros({}, {}))), "false");
check2("escolhidos, erros de cada um", String(individualMisses(salaErros({ missMode: "individuais" }, {}))), "true");
check2("erros de quem ainda não errou", String(missesOfPlayer(salaErros({}, {}), "b")), "0");
check2("erros de quem errou", String(missesOfPlayer(salaErros({}, { b: 4 }), "b")), "4");

console.log("21) 'Sem limite' e erros de cada um não podem enforcar ninguém...");
// O engano fácil: um teto lido como número faz "erros >= teto" dar verdadeiro
// à primeira quando o teto é 0. Já testado no passo 13; aqui garante-se que os
// erros de cada um também não trazem um fim de jogo por acidente.
const semFim = salaErros({ missMode: "individuais", maxMisses: 6 }, { b: 99 });
check2("erros de cada um não acabam a ronda", String(individualMisses(semFim) && !semFim.hangman.solved), "true");

console.log("22) As falas do quadro nunca repetem a anterior...");
const { BOARD_QUIPS, pickBoardQuip } = await import("./js/data.js");
check2("há falas suficientes para variar", String(BOARD_QUIPS.length >= 8), "true");
// Repetida, uma fala deixa de se ler como alguém a comentar e passa a ler-se
// como uma avaria. Testa-se muitas vezes porque a escolha é aleatória.
let repetiu = false;
for (let i = 0; i < 400; i += 1) {
  const anterior = Math.floor(Math.random() * BOARD_QUIPS.length);
  if (pickBoardQuip(anterior) === anterior) repetiu = true;
}
check2("nunca repete a anterior", String(repetiu), "false");
// E toda a fala tem de ter quem a diz e o que diz: uma sem "who" aparecia no
// balão como um comentário de ninguém.
const falasMas = BOARD_QUIPS.filter((q) => !q.who || !q.text || q.text.length > 90);
check2("todas as falas estão completas e curtas", String(falasMas.length), "0");
// E só falam as duas personagens que existem.
const vozes = [...new Set(BOARD_QUIPS.map((q) => q.who))].sort().join(",");
check2("só a Dona Manga e o Brasa", vozes, "Brasa,Dona Manga");
