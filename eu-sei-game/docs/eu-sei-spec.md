# Eu sei — especificação do jogo

## Conceito
Versão digital do jogo de papel "Stop"/Scattergories, multiplayer online em tempo real.

## Stack técnico recomendado
- Frontend: HTML/CSS/JS (ou React)
- Backend/tempo real: Firebase Realtime Database ou Supabase (salas, sincronização, votos)
- Publicação: wrap em Electron/Tauri → .exe/.app → Steamworks

## Fluxo de uma ronda
1. **Mini-jogo da letra:** todos os jogadores veem uma bola vermelha aparecer após atraso aleatório (2-4s); quem clicar primeiro ganha a ronda de escolha.
   - Clique antes da bola aparecer = falso arranque, penalização leve (repete a espera).
2. **Escolha da letra:** o vencedor vê 3 letras sorteadas e escolhe uma. Os restantes jogadores podem votar (contador visível em cada letra) mas só o vencedor pode confirmar.
3. **Ronda de categorias:** mostra-se a letra escolhida + N categorias sorteadas do pool; cada jogador preenche uma caixa de texto por categoria; cronómetro visível.
4. Ronda termina quando: (a) um jogador clica "Acabei", ou (b) o tempo acaba.
5. **Votação de respostas:** todos os jogadores veem as respostas de todos (exceto as próprias) e votam:
   - **Inválida** ✕ — precisa de mais de metade dos outros jogadores para efetivamente invalidar (proteção anti-abuso)
   - **Glória** 👑 — +2 pontos por voto recebido, sem limite
   - **Engraçada** 😂 — resposta inválida mas divertida: 2 pontos fixos, independente do nº de votos
6. **Pontuação:** resposta válida e única = 10 pts; válida e repetida por outro jogador = 5 pts; inválida = 0 (+ bónus de Glória/Engraçada conforme aplicável)
7. Mostra-se tabela de pontos acumulados antes da ronda seguinte.

## Estrutura da partida
- Número fixo de rondas por partida (default: 5, configurável no setup)
- Sem limite técnico de jogadores por sala; UI otimizada até ~10-12 (Jackbox-style)
- Entrada na sala por código curto (4-5 caracteres)

## Setup configurável (por partida)
- Nº de categorias por ronda (default 8, min 4, max 15)
- Tempo limite por ronda (default 90s, min 30, max 300)
- Excluir letras difíceis (K, W, Y) — on/off
- Nº de rondas por partida (default 5)

## Pool de categorias (40)
Nomes, Países, Comida, Aplicação, Cidade, Animal, Fruta, Cor, Profissão, Marca,
Filme, Desporto, Instrumento musical, Objeto de cozinha, Peça de roupa, Planta,
Bebida, Carro, Super-herói, Jogo, Rio, Elemento químico, Disciplina escolar,
Ferramenta, Inseto, Ave, Peixe, Sobremesa, Personagem histórico, Série de TV,
Livro, Palavra em inglês, Capital, Doença, Signo, Rede social, Emoção, Verbo,
Objeto de casa de banho, Insulto (leve/família-friendly)

Nota: "Nomes" é uma categoria subjetiva — sem lista fechada possível, depende inteiramente da votação de jogadores (não dá para validação automática como em "País").

## Protótipo existente
`eu-sei-prototype.html` — versão 1 jogador, já implementa: mini-jogo da bola,
escolha de letra, categorias, cronómetro, validação automática básica
(começa com a letra certa) + confirmação manual. Falta: multiplayer real,
sistema de votos (Inválida/Glória/Engraçada), salas, Steamworks.

## Modos de jogo
- **Single-player:** mecânica sandbox/roguelike (progressão entre rondas, runs)
- **Multiplayer:** variedade, personalização, mini-jogos extra, easter eggs
- Um único jogo/produto Steam com os dois modos (não separar em dois títulos para já — evita duplicar taxa Steamworks, loja e marketing antes de validar o conceito)

## Monetização
- Preço único (ex. 4,99–9,99€) pelo jogo completo, os dois modos incluídos
- Sem anúncios, sem free-to-play
- Se crescer: DLC cosmético apenas (temas, skins da letra, sons) — nunca vantagem de jogo

## Próximo passo
Levar este documento + o protótipo para o Claude Code e construir a versão
com salas online (Firebase/Supabase), começando por 2 jogadores num mesmo
Wi-Fi antes de testar à distância.
