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

console.log("1) Quantos votos são precisos (maioria simples dos ligados)...");
check("1 jogador", votesNeeded(["a"]), 1);
check("2 jogadores", votesNeeded(["a", "b"]), 2);
check("3 jogadores", votesNeeded(["a", "b", "c"]), 2);
check("4 jogadores", votesNeeded(["a", "b", "c", "d"]), 3);
check("5 jogadores", votesNeeded(["a", "b", "c", "d", "e"]), 3);

console.log("2) Um voto sozinho NÃO decide por uma sala cheia...");
const cinco = ["a", "b", "c", "d", "e"];
check("1 voto em 5", voteWinner({ a: "forca" }, cinco), null);
check("2 votos em 5", voteWinner({ a: "forca", b: "forca" }, cinco), null);
check("3 votos em 5", voteWinner({ a: "forca", b: "forca", c: "forca" }, cinco), "forca");

console.log("3) Empate não decide nada...");
check("2 contra 2 em 4", voteWinner({ a: "forca", b: "forca", c: "livre", d: "livre" }, ["a","b","c","d"]), null);

console.log("4) Votos de quem já saiu não contam...");
// Uma sala que esvaziou não pode ficar presa num resultado que já ninguém
// quer: os votos de quem se desligou saem da contagem.
check("2 votos, mas 1 saiu", voteWinner({ a: "forca", z: "forca" }, ["a", "b", "c"]), null);
check("contagem ignora ausentes", tallyVotes({ a: "forca", z: "forca" }, ["a", "b"]), { forca: 1 });

console.log("5) Um voto por pessoa: mudar de ideias substitui, não acumula...");
// O voto é guardado por uid, por isso votar outra vez sobrepõe-se. Se
// acumulasse, uma pessoa sozinha atingia a maioria a carregar várias vezes.
const votos = {};
votos["a"] = "forca";
votos["a"] = "livre";
check("dois cliques da mesma pessoa", tallyVotes(votos, ["a", "b", "c"]), { livre: 1 });

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
