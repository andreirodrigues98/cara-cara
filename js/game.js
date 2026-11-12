(() => {
  'use strict';

  const CHARACTERS = [
    ['jorge', 'Jorge'], ['beto', 'Beto'], ['ana', 'Ana'], ['pedro', 'Pedro'],
    ['paulo', 'Paulo'], ['daniel', 'Daniel'], ['clara', 'Clara'], ['helio', 'Hélio'],
    ['ricardo', 'Ricardo'], ['roberto', 'Roberto'], ['zeca', 'Zeca'], ['luis', 'Luís'],
    ['henrique', 'Henrique'], ['chico', 'Chico'], ['joao', 'João'], ['marcos', 'Marcos'],
    ['sonia', 'Sonia'], ['carlos', 'Carlos'], ['maria', 'Maria'], ['tony', 'Tony'],
    ['fernando', 'Fernando'], ['alfredo', 'Alfredo'], ['lucia', 'Lúcia'], ['edu', 'Edu']
  ].map(([id, name]) => ({ id, name }));

  const STORAGE_KEY = 'quem-e-tabuleiro-classico-v1';
  const idMap = new Map(CHARACTERS.map(character => [character.id, character]));
  const $ = id => document.getElementById(id);
  const screens = { home: $('homeScreen'), game: $('gameScreen'), results: $('resultsScreen') };
  const embedded = window.__EMBEDDED_IMAGES__ || null;
  const imageSrc = id => (embedded && embedded[id]) || `assets/personagens/${id}.webp`;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const normalizeName = (name, fallback) => name.trim().replace(/\s+/g, ' ').slice(0, 20) || fallback;

  let game = null;
  let selectedMode = 'two';
  let selectedGuess = null;
  let pendingConfirmation = null;

  // Sorteio local: não depende de servidor, Firebase ou compartilhamento de dados.
  function randomIndex(total) {
    if (window.crypto && crypto.getRandomValues) {
      const data = new Uint32Array(1);
      const limit = Math.floor(4294967296 / total) * total;
      do { crypto.getRandomValues(data); } while (data[0] >= limit);
      return data[0] % total;
    }
    return Math.floor(Math.random() * total);
  }

  function drawSecret(except = null) {
    const options = CHARACTERS.filter(character => character.id !== except);
    return options[randomIndex(options.length)].id;
  }

  function emptyPlayer(name, secret) {
    return { name, secret, eliminated: [], history: [], secretVisible: false };
  }

  function freshGame() {
    const name0 = normalizeName($('nameOne').value, selectedMode === 'two' ? 'Você' : 'Jogador 1');
    const name1 = normalizeName($('nameTwo').value, selectedMode === 'two' ? 'Outra pessoa' : 'Jogador 2');
    const first = drawSecret();
    const second = selectedMode === 'one' ? drawSecret(first) : null;
    game = {
      version: 2,
      mode: selectedMode,
      phase: 'playing',
      players: [emptyPlayer(name0, first), emptyPlayer(name1, second)],
      current: 0,
      round: 1,
      turn: 1,
      result: null
    };
    save();
    openGame(true);
  }

  function save() {
    if (!game) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(game)); } catch (_) { /* Funciona mesmo sem acesso ao armazenamento. */ }
  }

  function readSavedGame() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || ![1, 2].includes(saved.version) || !['one', 'two'].includes(saved.mode)) return null;
      if (!Array.isArray(saved.players) || saved.players.length !== 2) return null;
      if (!['playing', 'finished'].includes(saved.phase) || ![0, 1].includes(saved.current)) return null;
      const players = saved.players.map((player, i) => ({
        name: normalizeName(String(player.name || ''), `Jogador ${i + 1}`),
        secret: idMap.has(player.secret) ? player.secret : null,
        eliminated: Array.isArray(player.eliminated) ? [...new Set(player.eliminated.filter(id => idMap.has(id)))] : [],
        history: Array.isArray(player.history) ? player.history.filter(item => item && idMap.has(item.id) && typeof item.wasOut === 'boolean').slice(-200) : [],
        secretVisible: player.secretVisible === true
      }));
      if (!players[0].secret || (saved.mode === 'one' && !players[1].secret)) return null;
      saved.players = players;
      delete saved.score;
      saved.version = 2;
      saved.round = Math.max(1, Math.min(999, Number(saved.round) || 1));
      saved.turn = Math.max(1, Math.min(9999, Number(saved.turn) || 1));
      return saved;
    } catch (_) { return null; }
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, element]) => element.classList.toggle('hidden', key !== name));
    if (name !== 'game') hideSecret();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function home() {
    $('handoff').classList.add('hidden');
    showScreen('home');
    const saved = readSavedGame();
    $('resumeBox').classList.toggle('hidden', !saved);
    if (saved) {
      $('nameOne').value = saved.players[0].name;
      $('nameTwo').value = saved.players[1].name;
      chooseMode(saved.mode);
    }
  }

  function chooseMode(mode) {
    selectedMode = mode;
    document.querySelectorAll('.mode-option').forEach(button => {
      const on = button.dataset.mode === mode;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-checked', String(on));
    });
    $('nameLabel').textContent = mode === 'two' ? 'SEU NOME' : 'NOME DO JOGADOR 1';
    $('setupHint').innerHTML = mode === 'two'
      ? '<span aria-hidden="true">ⓘ</span> Cada celular faz seu próprio sorteio. Não precisam conectar os aparelhos.'
      : '<span aria-hidden="true">ⓘ</span> O aplicativo guarda dois personagens secretos e troca o tabuleiro com segurança a cada vez.';
  }

  function openGame(firstOpen = false) {
    if (!game) return home();
    if (game.phase === 'finished') return renderResults();
    renderGame();
    showScreen('game');
    if (game.mode === 'one' && firstOpen) showHandoff();
  }

  function showHandoff() {
    hideSecret();
    $('handoffName').textContent = game.players[game.current].name;
    $('handoffTitle').querySelector('span').textContent = game.players[game.current].name;
    $('handoff').classList.remove('hidden');
    $('handoffReady').focus();
  }

  function activePlayer() { return game.players[game.current]; }

  function renderGame() {
    const player = activePlayer();
    const remaining = CHARACTERS.length - player.eliminated.length;
    $('currentPlayer').textContent = player.name;
    $('playerTitle').textContent = game.mode === 'two' ? 'SEU TABULEIRO' : `VEZ ${game.turn} · JOGADOR ${game.current + 1}`;
    $('gameCaption').textContent = game.mode === 'two'
      ? 'Pergunte em voz alta. Toque nas cartas para eliminá-las.'
      : 'Faça uma pergunta e elimine as cartas. Depois passe o aparelho.';
    $('nextTurnBtn').classList.toggle('hidden', game.mode === 'two');
    $('guessBtn').textContent = '◎ Dar meu palpite';
    $('secretImage').src = imageSrc(player.secret);
    $('secretImage').alt = `Seu personagem secreto: ${idMap.get(player.secret).name}`;
    syncSecretDisplay();
    $('boardGrid').innerHTML = CHARACTERS.map(character => {
      const eliminated = player.eliminated.includes(character.id);
      return `<button type="button" class="face-card ${eliminated ? 'is-eliminated' : ''}" data-character="${character.id}" aria-label="${escapeHtml(character.name)}: ${eliminated ? 'eliminado, toque para voltar' : 'em pé, toque para eliminar'}" aria-pressed="${eliminated}">
        <span class="face-inner"><span class="face-front"><span class="face-photo"><img src="${imageSrc(character.id)}" loading="lazy" draggable="false" alt=""></span><span class="face-name">${escapeHtml(character.name)}</span></span><span class="face-back"><span class="back-symbol">?</span><small>ELIMINADO</small></span></span>
      </button>`;
    }).join('');
    updateCounts();
  }

  function updateCounts() {
    const player = activePlayer();
    const remaining = CHARACTERS.length - player.eliminated.length;
    $('remainingNumber').textContent = remaining;
    $('eliminatedLabel').textContent = `${player.eliminated.length} de 24 cartas eliminadas`;
    $('undoBtn').disabled = player.history.length === 0;
  }

  function syncFace(id) {
    const button = [...$('boardGrid').querySelectorAll('[data-character]')].find(node => node.dataset.character === id);
    if (!button) return;
    const out = activePlayer().eliminated.includes(id);
    button.classList.toggle('is-eliminated', out);
    button.setAttribute('aria-pressed', String(out));
    button.setAttribute('aria-label', `${idMap.get(id).name}: ${out ? 'eliminado, toque para voltar' : 'em pé, toque para eliminar'}`);
  }

  function flip(id) {
    if (!game || game.phase !== 'playing' || !idMap.has(id)) return;
    const player = activePlayer();
    const wasOut = player.eliminated.includes(id);
    player.eliminated = wasOut ? player.eliminated.filter(item => item !== id) : [...player.eliminated, id];
    player.history.push({ id, wasOut });
    if (player.history.length > 200) player.history.shift();
    syncFace(id);
    updateCounts();
    save();
    if (navigator.vibrate) navigator.vibrate(9);
  }

  function undo() {
    const player = activePlayer();
    const previous = player.history.pop();
    if (!previous) return;
    player.eliminated = player.eliminated.filter(id => id !== previous.id);
    if (previous.wasOut) player.eliminated.push(previous.id);
    syncFace(previous.id);
    updateCounts();
    save();
  }

  // Um toque alterna entre mostrar e esconder; não depende de manter o dedo pressionado.
  function syncSecretDisplay() {
    if (!game || game.phase !== 'playing') return;
    const player = activePlayer();
    const visible = player.secretVisible === true;
    $('secretThumbnail').classList.toggle('is-peeking', visible);
    $('secretThumbnail').setAttribute('aria-hidden', String(!visible));
    $('secretHint').textContent = visible ? idMap.get(player.secret).name : 'Um segredo só seu';
    $('secretDescription').textContent = visible
      ? 'Carta visível até você tocar em Esconder carta.'
      : 'Toque para mostrar sua carta pelo tempo que quiser.';
    $('secretHold').innerHTML = visible ? 'Esconder carta <span aria-hidden="true">◎</span>' : 'Mostrar carta <span aria-hidden="true">◉</span>';
    $('secretHold').setAttribute('aria-pressed', String(visible));
    $('secretHold').setAttribute('aria-label', visible ? 'Esconder meu personagem secreto' : 'Mostrar meu personagem secreto');
    $('secretArea').classList.toggle('is-visible', visible);
  }

  function hideSecret() {
    if (!game || game.phase !== 'playing') return;
    const player = activePlayer();
    if (player.secretVisible) {
      player.secretVisible = false;
      save();
    }
    syncSecretDisplay();
  }

  function toggleSecret() {
    if (!game || game.phase !== 'playing' || screens.game.classList.contains('hidden') || !$('handoff').classList.contains('hidden')) return;
    const player = activePlayer();
    player.secretVisible = !player.secretVisible;
    save();
    syncSecretDisplay();
  }

  function showDialog(id) {
    const dialog = $(id);
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(id) {
    const dialog = $(id);
    if (dialog.open) dialog.close();
  }

  function openGuess() {
    if (!game || game.phase !== 'playing') return;
    selectedGuess = null;
    const eliminated = activePlayer().eliminated;
    $('guessGrid').innerHTML = CHARACTERS.map(character => `<button type="button" class="guess-choice ${eliminated.includes(character.id) ? 'is-out' : ''}" data-guess="${character.id}" aria-pressed="false"><img src="${imageSrc(character.id)}" loading="lazy" alt=""><span>${escapeHtml(character.name)}</span></button>`).join('');
    $('guessSelection').textContent = 'Selecione uma carta para continuar.';
    $('confirmGuessBtn').disabled = true;
    showDialog('guessDialog');
  }

  function selectGuess(id) {
    if (!idMap.has(id)) return;
    selectedGuess = id;
    $('guessGrid').querySelectorAll('.guess-choice').forEach(button => {
      const on = button.dataset.guess === id;
      button.classList.toggle('is-selected', on);
      button.setAttribute('aria-pressed', String(on));
    });
    $('guessSelection').textContent = `Seu palpite: ${idMap.get(id).name}. Esse palpite substitui a pergunta do turno.`;
    $('confirmGuessBtn').disabled = false;
  }

  function confirmGuess() {
    if (!selectedGuess || !game) return;
    closeDialog('guessDialog');
    if (game.mode === 'one') {
      const opponent = game.players[1 - game.current];
      finishRound(selectedGuess === opponent.secret);
    } else {
      const character = idMap.get(selectedGuess);
      $('verifyFace').innerHTML = `<img src="${imageSrc(character.id)}" alt=""><strong>${escapeHtml(character.name)}</strong>`;
      $('verifyTitle').textContent = `Era ${character.name}?`;
      showDialog('verifyDialog');
    }
  }

  function finishRound(correct) {
    if (!game || game.phase !== 'playing' || !selectedGuess) return;
    const winner = correct ? game.current : 1 - game.current;
    game.phase = 'finished';
    game.result = { guessedId: selectedGuess, correct, winner, manual: game.mode === 'two' };
    save();
    closeDialog('verifyDialog');
    renderResults();
  }

  function renderResults() {
    const result = game.result;
    if (!result) { game.phase = 'playing'; return openGame(true); }
    const winner = game.players[result.winner].name;
    $('resultHeading').textContent = game.mode === 'two' ? (result.correct ? 'Você acertou!' : 'Palpite errado!') : `Vitória de ${winner}!`;
    $('resultEmblem').textContent = result.correct ? '✦' : '×';
    $('resultSubheading').textContent = game.mode === 'one'
      ? result.correct
        ? `Palpite certeiro! ${winner} descobriu o personagem secreto.`
        : `O palpite estava errado. ${winner} ganhou a partida.`
      : result.correct
        ? 'Você acertou o personagem secreto da outra pessoa!'
        : 'O palpite estava errado. A outra pessoa ganhou esta partida.';

    const revealCards = game.mode === 'one'
      ? game.players.map((player, i) => ({ ...idMap.get(player.secret), title: `CARTA DE ${player.name.toUpperCase()}`, secondary: i !== result.winner }))
      : [
        { ...idMap.get(result.guessedId), title: 'SEU PALPITE', secondary: false },
        { ...idMap.get(game.players[0].secret), title: 'SUA CARTA SECRETA', secondary: true }
      ];
    $('resultCards').innerHTML = revealCards.map(character => `<div class="result-card ${character.secondary ? 'is-secondary' : ''}"><span>${escapeHtml(character.title)}</span><img src="${imageSrc(character.id)}" alt="${escapeHtml(character.name)}"><strong>${escapeHtml(character.name)}</strong></div>`).join('');
    $('handoff').classList.add('hidden');
    showScreen('results');
  }

  function newRound() {
    if (!game) return;
    const first = drawSecret();
    const second = game.mode === 'one' ? drawSecret(first) : null;
    game.players[0] = emptyPlayer(game.players[0].name, first);
    game.players[1] = emptyPlayer(game.players[1].name, second);
    game.current = game.mode === 'one' ? (game.round % 2) : 0;
    game.round++;
    game.turn = 1;
    game.phase = 'playing';
    game.result = null;
    selectedGuess = null;
    save();
    openGame(true);
  }

  function askConfirm(title, text, action) {
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    pendingConfirmation = action;
    showDialog('confirmDialog');
  }

  function initPreview() {
    const ids = ['ana', 'henrique', 'jorge', 'clara', 'maria', 'carlos', 'luis', 'pedro', 'fernando', 'zeca', 'lucia', 'roberto'];
    $('previewFaces').innerHTML = ids.map((id, i) => {
      const character = idMap.get(id);
      return `<div class="preview-face ${i === 7 || i === 11 ? 'muted' : ''}"><img src="${imageSrc(character.id)}" alt=""><small>${escapeHtml(character.name)}</small></div>`;
    }).join('');
  }

  function initEvents() {
    document.querySelectorAll('.mode-option').forEach(button => button.addEventListener('click', () => chooseMode(button.dataset.mode)));
    $('setupForm').addEventListener('submit', event => {
      event.preventDefault();
      if (readSavedGame()) {
        askConfirm('Começar uma nova partida?', 'Uma partida antiga está salva neste aparelho. Iniciar uma nova substituirá o tabuleiro anterior.', freshGame);
      } else freshGame();
    });
    $('resumeBtn').addEventListener('click', () => { game = readSavedGame(); openGame(true); });
    $('brandHome').addEventListener('click', () => home());
    $('leaveBtn').addEventListener('click', () => home());
    $('finishBtn').addEventListener('click', () => home());
    $('helpBtn').addEventListener('click', () => showDialog('helpDialog'));
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    $('boardGrid').addEventListener('click', event => {
      const card = event.target.closest('[data-character]');
      if (card) flip(card.dataset.character);
    });
    $('undoBtn').addEventListener('click', undo);
    $('resetBoardBtn').addEventListener('click', () => askConfirm('Levantar todas as cartas?', 'As 24 cartas deste tabuleiro voltarão a ficar em pé. Seu personagem secreto será mantido.', () => {
      const player = activePlayer();
      player.eliminated = [];
      player.history = [];
      save(); renderGame();
    }));
    $('nextTurnBtn').addEventListener('click', () => {
      if (!game || game.mode !== 'one') return;
      hideSecret();
      game.current = 1 - game.current;
      game.turn++;
      save();
      showHandoff(); // Esconde a tela antes de carregar o tabuleiro seguinte.
      renderGame();
    });
    $('handoffReady').addEventListener('click', () => { $('handoff').classList.add('hidden'); $('boardGrid').focus(); });
    $('guessBtn').addEventListener('click', openGuess);
    $('guessGrid').addEventListener('click', event => {
      const choice = event.target.closest('[data-guess]');
      if (choice) selectGuess(choice.dataset.guess);
    });
    $('confirmGuessBtn').addEventListener('click', confirmGuess);
    $('verifyRight').addEventListener('click', () => finishRound(true));
    $('verifyWrong').addEventListener('click', () => finishRound(false));
    $('rematchBtn').addEventListener('click', newRound);
    $('confirmCancel').addEventListener('click', () => closeDialog('confirmDialog'));
    $('confirmProceed').addEventListener('click', () => {
      const action = pendingConfirmation;
      pendingConfirmation = null;
      closeDialog('confirmDialog');
      if (action) action();
    });
    $('confirmDialog').addEventListener('close', () => { pendingConfirmation = null; });

    $('secretHold').addEventListener('click', toggleSecret);
    // Troca de jogador sempre oculta a carta anterior; não esconde durante o uso normal do tabuleiro.

  }

  function init() {
    initPreview();
    initEvents();
    chooseMode('two');
    home();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    }
  }

  init();
})();
