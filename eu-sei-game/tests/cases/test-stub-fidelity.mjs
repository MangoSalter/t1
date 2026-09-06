// Onde o duplo de teste difere do sistema real, um teste que passa não prova
// nada. Já aconteceu quatro vezes nesta base de código: o stub transmitia a
// raiz inteira quando o Firebase transmite por caminho; não apagava as chaves
// escritas a null, que o Firebase apaga; tinha o onDisconnect a não fazer
// nada; e dava a cada separador uma identidade própria quando o Firebase dá a
// mesma conta a todos os separadores do mesmo browser. Cada uma dessas
// mentiras escondeu uma classe inteira de defeitos.
//
// Este ficheiro compara o stub com o ficheiro verdadeiro nos pontos em que os
// testes dependem de eles concordarem. Não é uma leitura de código a fingir
// que é um teste: é o único sítio onde a diferença entre os dois pode ser
// vista de todo, porque na cópia onde os testes correm o verdadeiro já foi
// substituído.
import { readFile } from "node:fs/promises";
import path from "node:path";

let falhas = 0;
const check = (nome, ok, detalhe) => {
  console.log(`   ${ok ? "ok" : "FALHOU"}  ${nome}${ok ? "" : ` — ${detalhe}`}`);
  if (!ok) falhas += 1;
};

const publicDir = process.env.EU_SEI_PUBLIC;
const stubPath = process.env.EU_SEI_STUB;
if (!publicDir || !stubPath) {
  console.log("   FALHOU: sem EU_SEI_PUBLIC/EU_SEI_STUB — o test runner tem de os passar");
  process.exit(1);
}
const real = await readFile(path.join(publicDir, "js", "firebase-init.js"), "utf8");
const stub = await readFile(stubPath, "utf8");

console.log("1) A identidade de jogador é POR SEPARADOR nos dois...");
// A conta anónima do Firebase é a mesma em todos os separadores do mesmo
// browser. Se o getUid verdadeiro a devolvesse tal e qual, duas pessoas a
// jogar no mesmo computador seriam o mesmo jogador — e nenhum teste
// multi-cliente daria por isso, porque o stub sempre deu um id por separador.
const guardaPorSeparador = (src) => /sessionStorage\s*\.\s*setItem\s*\(\s*UID_KEY/.test(src)
  && /sessionStorage\s*\.\s*getItem\s*\(\s*UID_KEY/.test(src);
check("o verdadeiro guarda a identidade no sessionStorage", guardaPorSeparador(real),
  "sem isto, dois separadores do mesmo browser são o mesmo jogador");
check("o stub faz o mesmo", guardaPorSeparador(stub),
  "o stub deixou de espelhar o verdadeiro");
// E é o getUid — o que a app chama — que tem de o fazer. Ter sessionStorage
// algures no ficheiro não chega: o corpo da função é que decide.
const corpoDoGetUid = (src) => {
  const i = src.search(/export\s+(?:async\s+)?function\s+getUid\s*\(/);
  return i === -1 ? "" : src.slice(i);
};
check("é o próprio getUid que usa a identidade do separador",
  /UID_KEY/.test(corpoDoGetUid(real)),
  "o getUid devolve o uid da conta, que é partilhado por todos os separadores");
check("e no stub também", /UID_KEY/.test(corpoDoGetUid(stub)),
  "o stub deixou de espelhar o verdadeiro");

console.log("2) As duas metades do getUid continuam a existir no verdadeiro...");
// Acesso e identidade são coisas diferentes: as regras da base de dados
// exigem auth != null (por isso a conta anónima tem de continuar a ser
// criada), e o jogo exige um jogador por separador.
check("continua a autenticar-se", /signInAnonymously/.test(real),
  "sem conta anónima, as regras recusam a leitura e a escrita");
check("e a autenticação é esperada antes de dar a identidade",
  /await\s+autenticar\(\)/.test(real),
  "dar a identidade antes de haver conta deixa a app a escrever sem acesso");

if (falhas > 0) {
  console.log(`=> test-stub-fidelity FALHOU (${falhas})`);
  process.exit(1);
}
console.log("=> test-stub-fidelity ok");
