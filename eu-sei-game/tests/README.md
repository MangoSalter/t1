# Testes headless do "Eu sei!"

Testes de ponta a ponta com Playwright: abrem o jogo mesmo num browser sem
interface, carregam nos botões e verificam o que aparece no ecrã e o que fica
guardado. Não há mocks da app — só a base de dados é substituída.

## Correr

```sh
node tests/run.mjs            # tudo
node tests/run.mjs solo       # só os casos com "solo" no nome
node tests/run.mjs mp-race    # um caso
```

Precisa de `playwright` instalado e de um Chromium. Neste ambiente:
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

## Como funciona

O runner copia `public/` para uma pasta temporária, e **só nessa cópia** troca
o `js/firebase-init.js` verdadeiro pelo `tests/stub/firebase-init.js`. O stub
guarda tudo em memória e partilha o estado entre separadores por
`BroadcastChannel`, o que permite testar dois clientes reais na mesma sala
(um jogador desenha, o outro tem de ver). `public/` nunca é modificado, por
isso não há maneira de o stub chegar ao site publicado.

Servem-se duas portas (8936 e 8937) porque os casos multijogador abrem dois
separadores.

## Escrever um caso novo

Cada caso é um `.mjs` autónomo em `cases/` que lança o browser, faz o que
tem a fazer e termina com `process.exitCode = 1` se algo falhar. Convenções:

- **Testar a regra, não só o comportamento.** Ex.: `solo-chaos-test.mjs`
  falha se um evento futuro tiver um tipo capaz de tirar vidas ao jogador,
  não apenas se o evento atual se portar mal.
- **Nada de números fixos que o jogo faz variar.** A Memória mostra mais
  cartas em rondas avançadas; fixar "têm de ser 5" fazia o teste falhar
  conforme a sorte de quando o mini-jogo calhava.
- **Escolher onde o teste vive.** Um evento que só acontece 6 a 14 segundos
  depois do início precisa de um mini-jogo que dure — a Memória não tem
  pressão de tempo na escolha, os outros acabam antes.
- **Limitar seletores ao ecrã ativo.** `[data-solo-leave]` existe em vários
  ecrãs; sem `.screen.active` à frente, o Playwright escolhe o primeiro, que
  está escondido.
- Para voltar à escolha de letra a meio de uma run, usar
  `backToLetterpick(page)` de `cases/test-helpers.mjs` — atravessa o portão
  "pronto?", o HUD e o ecrã de fim sozinho.
