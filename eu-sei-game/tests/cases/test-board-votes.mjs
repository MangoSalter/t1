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

console.log("23) Várias palavras: uma letra certa revela em TODAS...");
const { joinWords, splitWordsInput, wordsOfMask, revealWholeWord, WORD_SEP, maskWord: mw, revealLetter: rl } =
  await import("./js/room.js");
// A decisão que faz isto ser barato: várias palavras são UMA máscara só. Como
// revealLetter percorre a máscara inteira, "revela em todas" sai de graça.
const tres = joinWords(["banana", "manga", "ananás"]);
check2("juntas com separador", tres, `banana${WORD_SEP}manga${WORD_SEP}ananás`);
check2("separam-se outra vez", wordsOfMask(tres).join("|"), "banana|manga|ananás");
const mascara = mw(tres);
check2("o separador fica à vista", mascara, `______${WORD_SEP}_____${WORD_SEP}______`);
// O "a" aparece nas três: tem de aparecer nas três de uma vez.
const comA = rl(tres, mascara, "a");
check2("um 'a' revela nas três", comA, `_a_a_a${WORD_SEP}_a__a${WORD_SEP}a_a_á_`);
// E o acento não impede: "a" apanha o "á" de ananás.
check2("o acento não escapa", comA.includes("á"), true);

console.log("24) Quem escreve não tem de saber qual é o separador interno...");
check2("vírgulas", splitWordsInput("banana, manga, ananás").join("|"), "banana|manga|ananás");
check2("barras", splitWordsInput("banana / manga").join("|"), "banana|manga");
check2("espaços a mais", splitWordsInput("  banana ,,  manga  ").join("|"), "banana|manga");
check2("uma palavra só", splitWordsInput("banana").join("|"), "banana");
// Uma palavra composta com espaços continua a ser UMA palavra.
check2("palavra composta", splitWordsInput("Dona Manga").join("|"), "Dona Manga");

console.log("25) Acertar UMA palavra inteira revela essa e só essa...");
// O quadro esvazia-se aos poucos, em vez de acabar de repente.
const parcial = revealWholeWord(tres, mascara, "manga");
check2("revela a acertada", parcial, `______${WORD_SEP}manga${WORD_SEP}______`);
check2("e não as outras", parcial.startsWith("______"), true);
check2("palavra que não está lá", String(revealWholeWord(tres, mascara, "melancia")), "null");
// Acertar a mesma outra vez não conta como acerto novo.
check2("repetir a já revelada", String(revealWholeWord(tres, parcial, "manga")), "null");
// Com uma palavra só, revela-a e acaba, como sempre.
const uma = "banana";
check2("uma palavra só", revealWholeWord(uma, mw(uma), "BANANA"), "banana");

console.log("26) Tentativas anónimas: erradas de todos, certas só na tua palavra...");
const { guessesAreAnonymous, playerMask, playerSolved } = await import("./js/room.js");
const salaAnon = (settings, extra) => ({
  players: { a: { connected: true }, b: { connected: true }, c: { connected: true } },
  hangman: { mode: "forca", leaderId: "a", mask: "_a_a_a", settings, ...extra },
});
check2("por omissão, tudo à vista", String(guessesAreAnonymous(salaAnon({}))), "false");
check2("anónimas quando escolhido", String(guessesAreAnonymous(salaAnon({ revealGuesses: 0 }))), "true");
// À vista, todos veem a mesma palavra.
check2("à vista, a palavra é a mesma", playerMask(salaAnon({}), "b"), "_a_a_a");
// Anónimas: quem ainda não acertou nada vê a forma toda por preencher — e a
// forma sai da máscara partilhada, para ninguém precisar da palavra para
// saber quantas letras ela tem.
check2("anónimas, quem não acertou vê tudo tapado", playerMask(salaAnon({ revealGuesses: 0 }), "b"), "______");
// E quem acertou vê só o que acertou.
const comMascaras = salaAnon({ revealGuesses: 0 }, { masks: { b: "_a_a_a", c: "b_____" } });
check2("cada um vê o seu", playerMask(comMascaras, "b"), "_a_a_a");
check2("e o outro vê o dele", playerMask(comMascaras, "c"), "b_____");
check2("quem não jogou continua tapado", playerMask(comMascaras, "z"), "______");
// Ganhar é montar a palavra toda na SUA.
const quaseGanhou = salaAnon({ revealGuesses: 0 }, { masks: { b: "banana", c: "b_____" } });
check2("quem montou a palavra ganhou", String(playerSolved(quaseGanhou, "b")), "true");
check2("quem não montou, não", String(playerSolved(quaseGanhou, "c")), "false");
// Sem palavra em jogo não há máscara nenhuma.
check2("sem palavra", playerMask({ hangman: {} }, "b"), "");

console.log("27) A partida acaba ao fim das palavras combinadas, e há vencedor...");
const { matchIsOver, matchWordsTotal, matchRanking } = await import("./js/room.js");
const salaPartida = (settings, extra) => ({
  players: {
    a: { connected: true, name: "Ana" },
    b: { connected: true, name: "Beto" },
    c: { connected: true, name: "Carla" },
  },
  hangman: { mode: "forca", leaderId: "a", settings, ...extra },
});
check2("por omissão, 5 palavras", String(matchWordsTotal(salaPartida({}))), "5");
check2("sem fim quando escolhido", String(matchWordsTotal(salaPartida({ matchWords: 0 }))), "0");
check2("ainda a jogar", String(matchIsOver(salaPartida({}, { wordsDone: 2 }))), "false");
check2("acabada", String(matchIsOver(salaPartida({}, { matchOver: true }))), "true");

console.log("28) A classificação: equipas quando há equipas, pessoas quando não há...");
// Cada um por si: conta a pessoa.
const soloRank = matchRanking(salaPartida({}, { matchScore: { b: 5, c: 2, a: 9 } }));
check2("por pontos, do maior para o menor", soloRank.map((e) => e.nome).join(","), "Ana,Beto,Carla");
check2("com os pontos certos", soloRank.map((e) => e.pontos).join(","), "9,5,2");
// Quem não acertou nada aparece na mesma, com zero — desaparecer da tabela
// seria pior do que aparecer em último.
const comZero = matchRanking(salaPartida({}, { matchScore: { a: 3 } }));
check2("quem não acertou aparece com zero", comZero.length, 3);
check2("e fica em último", comZero[comZero.length - 1].pontos, 0);
// Em equipas, conta a equipa e não a pessoa.
const equipasRank = matchRanking(salaPartida({}, {
  play: "equipas",
  teams: { t1: { name: "Os Kotas" }, t2: { name: "Equipa B" } },
  teamOf: { a: "t1", b: "t2", c: "t2" },
  teamScore: { t1: 4, t2: 7 },
  matchScore: { a: 99 },
}));
check2("ganha a equipa com mais pontos", equipasRank[0].nome, "Equipa B");
check2("e os pontos são os da equipa", equipasRank.map((e) => e.pontos).join(","), "7,4");
check2("com quem lá está", equipasRank[0].membros.join(","), "b,c");

console.log("29) O caos da Dona Manga nunca estraga o jogo...");
const { BOARD_CHAOS, pickBoardChaos } = await import("./js/data.js");
const { chaosLetterToReveal, chaosMissToForgive, boardChaosOn, BOARD_CHAOS_EVERY } =
  await import("./js/room.js");
// Desligado por omissão: interferir no jogo dos outros escolhe-se, não
// acontece a quem não pediu nada.
check2("desligado por omissão", String(boardChaosOn({ hangman: { mode: "forca" } })), "false");
check2("ligado quando escolhido", String(boardChaosOn({ hangman: { mode: "forca", settings: { chaos: 1 } } })), "true");
check2("aparece de N em N erros", String(BOARD_CHAOS_EVERY >= 2), "true");

// A letra dada de graça é a MAIS COMUM das que faltam: dar uma rara não ajuda
// e faz o presente parecer troça.
check2("dá a letra mais comum", chaosLetterToReveal("banana", "______"), "a");
check2("ignora as já reveladas", chaosLetterToReveal("banana", "_a_a_a"), "n");
// E NUNCA dá a última que falta — isso era a gata a ganhar o jogo pelas
// pessoas. Com uma só letra por revelar, o evento não acontece.
check2("nunca dá a última", String(chaosLetterToReveal("banana", "_anana")), "null");
check2("nem numa palavra já resolvida", String(chaosLetterToReveal("banana", "banana")), "null");
// Pontuação e espaços não contam como letras a revelar.
check2("ignora espaços e pontuação", chaosLetterToReveal("dona manga", "__________"), "a");

// Perdoar um erro tira o mais recente, que é o que ainda dói.
const comErros = { hangman: { wrong: { z: { at: 1 }, q: { at: 2 }, x: { at: 3 } } } };
check2("perdoa o erro mais recente", chaosMissToForgive(comErros), "x");
check2("sem erros não há nada a perdoar", String(chaosMissToForgive({ hangman: {} })), "null");

console.log("30) As falas do caos estão completas, e nunca repetem a anterior...");
check2("há eventos suficientes", String(BOARD_CHAOS.length >= 4), "true");
const caosMau = BOARD_CHAOS.filter((e) => !e.id || !e.kind || !e.who || !e.text || e.text.length > 90);
check2("todos completos e curtos", String(caosMau.length), "0");
// Só as duas personagens falam.
check2("só a Dona Manga e o Brasa",
  [...new Set(BOARD_CHAOS.map((e) => e.who))].sort().join(","), "Brasa,Dona Manga");
// E nenhum tipo de evento pode ser destrutivo de forma irreversível: nada de
// limpar a folha nem de acabar a ronda.
const tiposMaus = BOARD_CHAOS.filter((e) => /clear|solve|end|wipe/i.test(e.kind));
check2("nenhum evento limpa a folha ou acaba a ronda", String(tiposMaus.length), "0");
let repetiuCaos = false;
for (let i = 0; i < 300; i += 1) {
  const anterior = BOARD_CHAOS[Math.floor(Math.random() * BOARD_CHAOS.length)].id;
  if (pickBoardChaos(anterior).id === anterior) repetiuCaos = true;
}
check2("nunca repete o evento anterior", String(repetiuCaos), "false");

console.log("31) Um ficheiro estragado não pode partir o quadro de toda a gente...");
const { sanitizeBoardPoints } = await import("./js/room.js");
// Do data.js, não do board.js: o board.js toca no DOM ao carregar e um teste
// puro (sem browser) não o consegue importar.
const { BOARD_TOOLS } = await import("./js/data.js");
// Pontos bons passam.
check2("pontos válidos passam", sanitizeBoardPoints([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]).length, 2);
// Pontos sem coordenadas rebentariam o redesenho da sala INTEIRA.
check2("sem coordenadas", sanitizeBoardPoints([{ y: 0.2 }, { x: "a", y: 1 }, { x: 0.1, y: 0.2 }]).length, 1);
check2("nulos e lixo", sanitizeBoardPoints([null, undefined, 5, "x", { x: 0, y: 0 }]).length, 1);
check2("não é uma lista", sanitizeBoardPoints({ x: 0, y: 0 }).length, 0);
check2("lista vazia", sanitizeBoardPoints([]).length, 0);
// Uma ferramenta que não existe também rebentaria.
check2("ferramenta inventada", sanitizeBoardPoints([{ x: 0, y: 0, tool: "laser" }]).length, 0);
check2("ferramenta real", sanitizeBoardPoints([{ x: 0, y: 0, tool: "marker" }]).length, 1);
// Coordenadas de forma inválidas.
check2("x2 inválido", sanitizeBoardPoints([{ x: 0, y: 0, shape: "rect", x2: "a", y2: 1 }]).length, 0);
// Texto que não é texto.
check2("texto que não é texto", sanitizeBoardPoints([{ x: 0, y: 0, text: { a: 1 } }]).length, 0);
// E um ficheiro gigante não pode encher a sala de uma vez.
check2("ficheiro gigante é cortado",
  sanitizeBoardPoints(Array.from({ length: 9000 }, () => ({ x: 0.5, y: 0.5 }))).length, 4000);

console.log("32) A lista de ferramentas aceites não pode divergir das que existem...");
// O room.js repete os nomes de propósito (é o módulo da rede e não deve
// depender do módulo do desenho), mas as duas listas têm de bater certo —
// senão uma ferramenta nova passa a ser recusada na importação sem ninguém
// perceber porquê.
const doDesenho = Object.keys(BOARD_TOOLS).filter((k) => !BOARD_TOOLS[k].pan).sort();
const aceites = doDesenho.filter((t) => sanitizeBoardPoints([{ x: 0, y: 0, tool: t }]).length === 1);
check2("todas as ferramentas do quadro são aceites", aceites.join(","), doDesenho.join(","));

console.log("33) Equipas + tentativas anónimas: a equipa partilha a palavra...");
// Ligar as duas opções ao mesmo tempo dava a cada jogador a SUA palavra, e a
// equipa passava a ser uma lista de nomes sem nada em comum: eu acertava uma
// letra e o meu colega ao lado não a via. Agora a palavra pessoal é da
// equipa. O anonimato não se perde — continua a não se saber QUEM acertou
// nem que letra cada um tentou; sabe-se só que a equipa avançou.
const { maskKey } = await import("./js/room.js");
const salaEq = (extra) => ({
  players: { a: { connected: true }, b: { connected: true }, c: { connected: true }, d: { connected: true } },
  hangman: {
    mode: "forca", play: "equipas", leaderId: "a", mask: "_a_a_a",
    settings: { revealGuesses: 0 },
    teams: { t1: { name: "Leões" }, t2: { name: "Palancas" } },
    teamOf: { b: "t1", c: "t1", d: "t2" },
    ...extra,
  },
});
check2("sem equipa, a palavra é minha", maskKey(salaEq({ teamOf: {} }), "b"), "b");
check2("com equipa, a palavra é da equipa", maskKey(salaEq(), "b"), "equipa:t1");
check2("colegas partilham a mesma chave", maskKey(salaEq(), "c"), "equipa:t1");
check2("adversário tem outra", maskKey(salaEq(), "d"), "equipa:t2");
// O que interessa: o que o B acertou aparece ao C, e NÃO aparece ao D.
const emJogo = salaEq({ masks: { "equipa:t1": "_a_a_a", "equipa:t2": "b_____" } });
check2("o colega vê o que eu acertei", playerMask(emJogo, "c"), "_a_a_a");
check2("o adversário não vê", playerMask(emJogo, "d"), "b_____");
// E ganhar é da equipa: montada a palavra, ganharam os dois.
const equipaGanhou = salaEq({ masks: { "equipa:t1": "banana" } });
check2("montada a palavra, ganhou quem a montou", String(playerSolved(equipaGanhou, "b")), "true");
check2("e o colega ganhou com ele", String(playerSolved(equipaGanhou, "c")), "true");
check2("o adversário não ganhou", String(playerSolved(equipaGanhou, "d")), "false");
// Com as tentativas à vista não há palavras pessoais nenhumas: todos veem a
// partilhada, com ou sem equipas.
const aVista = salaEq({ settings: { revealGuesses: 1 }, masks: { "equipa:t1": "banana" } });
check2("à vista, equipas veem a mesma de sempre", playerMask(aVista, "d"), "_a_a_a");

console.log("34) Palavra nova apaga as folhas pessoais da palavra anterior...");
// Quem apanha a caneta a meio de uma ronda não sabe a palavra (ela nunca
// entra na sala), e é-lhe pedido que a escreva outra vez. Esse caminho não
// passa pelo "limpar", e era aí que estava o buraco: as folhas pessoais da
// palavra ANTERIOR sobreviviam, e quem tinha acertado letras continuava a ver
// a palavra antiga na sua.
const { setHangmanPuzzle } = await import("./js/room.js");
const { ref: refDb, db: dbTeste, get: getDb, update: updateDb } = await import("./js/firebase-init.js");
await updateDb(refDb(dbTeste, "rooms/TESTE/hangman"), {
  leaderId: "a", mask: "______", masks: { a: "ba____" }, winnerUid: "a",
  misses: 3, wrong: { x: { by: "b" } }, solved: true,
});
await setHangmanPuzzle("TESTE", {
  hangman: { leaderId: "a", mask: "______", masks: { a: "ba____" } },
  players: { a: { connected: true }, b: { connected: true } },
}, "a", "_______", "fruta");
const depois = (await getDb(refDb(dbTeste, "rooms/TESTE/hangman"))).val() || {};
check2("a palavra nova ficou", depois.mask, "_______");
check2("a pista nova ficou", depois.hint, "fruta");
check2("folhas pessoais apagadas", String(depois.masks === undefined || depois.masks === null), "true");
check2("vencedor da anterior apagado", String(depois.winnerUid === undefined || depois.winnerUid === null), "true");
check2("erros zerados", depois.misses, 0);
check2("letras erradas apagadas", String(depois.wrong === undefined || depois.wrong === null), "true");
check2("já não está resolvida", String(depois.solved), "false");

console.log("35) As escritas do quadro recusam quem não manda: uma a uma...");
// Este jogo é "por confiança" — não há servidor a arbitrar, e qualquer cliente
// pode tentar escrever o que quiser na sala. Por isso cada escrita verifica
// QUEM a está a fazer antes de a fazer. Isso foi auditado à vista, mas nunca
// testado, e uma verificação que desaparece numa refactorização não dá erro
// nenhum: dá um jogo em que qualquer um limpa o quadro dos outros.
//
// A regra do teste é sempre a mesma: chamar cada escrita com o uid ERRADO e
// exigir que a sala fique exatamente como estava.
const guardas = await import("./js/room.js");
const salaGuarda = {
  hostId: "anfitriao",
  players: {
    anfitriao: { connected: true, name: "Anfitriã" },
    caneta: { connected: true, name: "Com caneta" },
    ze: { connected: true, name: "Zé" },
  },
  hangman: {
    mode: "forca", leaderId: "caneta", play: "equipas",
    mask: "_a_a_a", misses: 1, hint: "fruta",
    teams: { t1: { name: "Leões" }, t2: { name: "Palancas" } },
    teamOf: { ze: "t1" },
    turnOrder: ["ze", "anfitriao"],
    colors: { ze: "#b24b38", caneta: "#5c7e91", anfitriao: "#5b7442" },
    doodle: { points: { p0000001_x: { x: 0.1, y: 0.1, tool: "pen" } } },
    settings: { revealGuesses: 1 },
    guesses: { ze: { letter: "b", at: 1 } },
    wordGuesses: { ze: { text: "banana", at: 1 } },
  },
};
const CAMINHO = "rooms/GUARDA/hangman";
await updateDb(refDb(dbTeste, CAMINHO), JSON.parse(JSON.stringify(salaGuarda.hangman)));
const estadoDoQuadro = async () => JSON.stringify((await getDb(refDb(dbTeste, CAMINHO))).val());
const antes = await estadoDoQuadro();

// "zé" não tem a caneta nem é anfitrião: nenhuma destas devia mexer em nada.
const tentativas = [
  ["limpar o quadro", () => guardas.clearHangmanDoodle("GUARDA", salaGuarda, "ze")],
  ["escrever a palavra", () => guardas.setHangmanPuzzle("GUARDA", salaGuarda, "ze", "______", "outra")],
  ["revelar letras na palavra", () => guardas.updateHangmanMask("GUARDA", salaGuarda, "ze", "banana")],
  ["marcar um erro", () => guardas.addHangmanMiss("GUARDA", salaGuarda, "ze")],
  ["apagar a palavra", () => guardas.clearHangmanPuzzle("GUARDA", salaGuarda, "ze")],
  ["mudar o modo do quadro", () => guardas.setBoardMode("GUARDA", salaGuarda, "ze", "livre")],
  ["mudar as definições", () => guardas.setBoardSetting("GUARDA", salaGuarda, "ze", "maxMisses", 0)],
  ["mudar para cada um por si", () => guardas.setPlayMode("GUARDA", salaGuarda, "ze", "solo")],
  ["mudar o número de equipas", () => guardas.setTeamCount("GUARDA", salaGuarda, "ze", 4)],
  ["renomear equipa que não é dele", () => guardas.renameTeam("GUARDA", salaGuarda, "ze", "t2", "Roubada")],
  ["arbitrar uma letra", () => guardas.resolveGuess("GUARDA", salaGuarda, "ze", "ze", "b", "banana")],
  ["arbitrar a palavra inteira", () => guardas.resolveWordGuess("GUARDA", salaGuarda, "ze", "ze", "banana", "banana")],
  ["anular o traço de quem desenha", () => guardas.undoLastHangmanStroke("GUARDA", salaGuarda, "ze")],
  ["desenhar no quadro na Forca", () => guardas.pushHangmanDoodlePoints("GUARDA", salaGuarda, "ze", [{ x: 0.5, y: 0.5 }])],
  ["começar outra partida", () => guardas.startNewMatch("GUARDA", salaGuarda, "ze")],
  ["chamar a gata do caos", () => guardas.fireBoardChaos("GUARDA", salaGuarda, "ze", "banana")],
];
for (const [nome, chamada] of tentativas) {
  await chamada();
  check2(`recusa: ${nome}`, await estadoDoQuadro(), antes);
}

// E o contrário, que é o que impede o teste de passar por estar tudo trancado:
// quem TEM a caneta consegue mesmo fazê-lo.
await guardas.addHangmanMiss("GUARDA", salaGuarda, "caneta");
const comCaneta = (await getDb(refDb(dbTeste, CAMINHO))).val();
check2("quem tem a caneta marca o erro", comCaneta.misses, 2);
// O anfitrião pode passar a caneta mesmo sem a ter — é o que destranca a sala
// quando quem desenhava se vai embora.
await guardas.passHangmanPen("GUARDA", salaGuarda, "ze", "ze");
check2("o Zé não passa a caneta a si próprio",
  (await getDb(refDb(dbTeste, CAMINHO))).val().leaderId, "caneta");
await guardas.passHangmanPen("GUARDA", salaGuarda, "anfitriao", "ze");
check2("o anfitrião destranca a sala",
  (await getDb(refDb(dbTeste, CAMINHO))).val().leaderId, "ze");

console.log("36) Quem fecha a palavra fica registado — à vista ou às escondidas...");
// O "quem ganhou" só era guardado quando as tentativas eram anónimas. Como o
// normal é estarem à vista, o fim da ronda dizia "Acertaram!" sem dizer a
// quem, e no histórico da sessão nenhuma palavra tinha dono. Pior: mesmo no
// modo anónimo, o histórico lia o vencedor ANTERIOR (nulo), porque quem
// ganhava só era escrito na mesma atualização.
// Com as tentativas anónimas a folha é de cada um, por isso a do Zé tem de
// estar quase cheia também — senão ele não fecha nada e o teste só provava
// que uma letra não chega.
const salaFecho = (settings) => ({
  hostId: "cap",
  players: { cap: { connected: true }, ze: { connected: true } },
  hangman: {
    mode: "forca", leaderId: "cap", mask: "banan_", misses: 1,
    masks: settings.revealGuesses === 0 ? { ze: "banan_" } : null,
    hint: "fruta", turnOrder: ["ze"], settings, wordsDone: 0,
  },
});
for (const [comoE, settings] of [["à vista", { revealGuesses: 1 }], ["anónimas", { revealGuesses: 0 }]]) {
  const sala = salaFecho(settings);
  const alvo = `rooms/FECHO${settings.revealGuesses}/hangman`;
  await updateDb(refDb(dbTeste, alvo), JSON.parse(JSON.stringify(sala.hangman)));
  await guardas.resolveGuess(`FECHO${settings.revealGuesses}`, sala, "cap", "ze", "a", "banana");
  const fim = (await getDb(refDb(dbTeste, alvo))).val();
  check2(`${comoE}: a palavra fechou`, String(fim.solved), "true");
  check2(`${comoE}: quem a fechou ficou registado`, fim.winnerUid, "ze");
  const entrada = fim.history?.h0001;
  check2(`${comoE}: e o histórico guardou a palavra`, entrada?.word, "banana");
  check2(`${comoE}: com o dono certo, não o anterior`, entrada?.winnerUid, "ze");
}

console.log("37) A penalização a cada X erros também penaliza no modo livre...");
// Em modo de turnos, ficar de castigo era perder a vez — o advanceTurn salta
// quem está de castigo. Em modo livre não há vez para perder, e a penalização
// não fazia nada: as duas definições cancelavam-se em silêncio, como as
// equipas e as tentativas anónimas antes delas.
const { skippedNow } = await import("./js/room.js");
const salaCastigo = (settings, skipNext) => ({
  players: { cap: { connected: true }, ze: { connected: true }, ana: { connected: true } },
  hangman: {
    mode: "forca", leaderId: "cap", mask: "_a_a_a",
    turnOrder: ["ze", "ana"], skipNext, settings,
  },
});
const livre = { guessMode: "livre", missMode: "individuais", penaltyEvery: 2 };
const turnos = { guessMode: "turnos", missMode: "individuais", penaltyEvery: 2 };
check2("livre: quem está de castigo não arrisca",
  String(canGuessNow(salaCastigo(livre, { ze: true }), "ze")), "false");
check2("livre: quem não está, arrisca",
  String(canGuessNow(salaCastigo(livre, { ze: true }), "ana")), "true");
check2("turnos: continua a valer",
  String(canGuessNow(salaCastigo(turnos, { ze: true }), "ze")), "false");
// Se estiverem TODOS de castigo, ninguém fica: uma penalização que tranca o
// jogo deixa de ser penalização e passa a ser o fim do jogo.
check2("todos de castigo: o jogo não tranca",
  String(canGuessNow(salaCastigo(livre, { ze: true, ana: true }), "ze")), "true");
check2("e o skippedNow diz o mesmo",
  String(skippedNow(salaCastigo(livre, { ze: true, ana: true }), "ze")), "false");

console.log("38) Uma palavra nova apaga TAMBÉM os erros de cada um e os castigos...");
// Os erros da sala zeravam-se com a palavra nova; os de cada um e os castigos
// não. Ao fim de três palavras, metade da sala estava de castigo por erros de
// rondas de que já ninguém se lembrava.
const alvoP = "rooms/PENA/hangman";
await updateDb(refDb(dbTeste, alvoP), {
  leaderId: "cap", mask: "______", misses: 2,
  missesBy: { ze: 4 }, skipNext: { ze: true }, masks: { ze: "b_____" },
});
await guardas.setHangmanPuzzle("PENA", {
  hangman: { leaderId: "cap", mask: "______" },
  players: { cap: { connected: true }, ze: { connected: true } },
}, "cap", "_______", null);
const limpo = (await getDb(refDb(dbTeste, alvoP))).val();
check2("erros da sala a zero", limpo.misses, 0);
check2("erros de cada um apagados", String(limpo.missesBy === undefined || limpo.missesBy === null), "true");
check2("castigos apagados", String(limpo.skipNext === undefined || limpo.skipNext === null), "true");
check2("folhas pessoais apagadas", String(limpo.masks === undefined || limpo.masks === null), "true");

console.log("39) Erros de cada um não desligam a Dona Manga...");
// O caos dispara a cada N erros da RONDA, e olha para hangman.misses. Com
// erros de cada um, esse contador ficava em zero para sempre: ligar "erros de
// cada um" desligava o caos sem o dizer a ninguém. O total da ronda passa a
// contar nos dois modos — não serve para enforcar (com erros de cada um não há
// enforcado), serve para a gata saber quando entrar.
const alvoC = "rooms/CAOS/hangman";
const salaCaos = {
  players: { cap: { connected: true }, ze: { connected: true } },
  hangman: {
    mode: "forca", leaderId: "cap", mask: "_a_a_a", misses: 0, turnOrder: ["ze"],
    settings: { missMode: "individuais", maxMisses: 6, penaltyEvery: 0 },
  },
};
await updateDb(refDb(dbTeste, alvoC), JSON.parse(JSON.stringify(salaCaos.hangman)));
await guardas.resolveGuess("CAOS", salaCaos, "cap", "ze", "z", "banana");
const comErro = (await getDb(refDb(dbTeste, alvoC))).val();
check2("o erro de cada um foi contado", comErro.missesBy?.ze, 1);
check2("e o total da ronda também", comErro.misses, 1);

console.log("40) Definições que não fazem nada dizem-no...");
// Três vezes nesta sessão duas definições cancelaram-se em silêncio. O painel
// passa a marcar as que não têm efeito com as outras escolhas.
const specForca = BOARD_SETTINGS_SPEC.forca;
const acha = (k) => specForca.find((d) => d.key === k);
const comIndividuais = { hangman: { mode: "forca", settings: { missMode: "individuais" } } };
const comPartilhados = { hangman: { mode: "forca", settings: { missMode: "partilhados" } } };
check2("teto de erros: sem efeito com erros de cada um",
  String(!!acha("maxMisses").naoSeAplica(comIndividuais)), "true");
check2("teto de erros: vale com erros da sala",
  String(acha("maxMisses").naoSeAplica(comPartilhados)), "null");
check2("penalização: sem efeito com erros da sala",
  String(!!acha("penaltyEvery").naoSeAplica(comPartilhados)), "true");
check2("penalização: vale com erros de cada um",
  String(acha("penaltyEvery").naoSeAplica(comIndividuais)), "null");
