import booths from './data/booths.js';

const IS_FILE = window.location.protocol === 'file:';
const ASSET = IS_FILE ? './public/assets/' : '/assets/';
const STORAGE_KEY = 'english-booth-progress-v1';
const app = document.querySelector('#app');

const state = {
  screen: 'home',
  booths: [],
  completed: new Set(),
  activeBoothId: null,
  modal: null,
  selectedOption: null,
  textAnswer: '',
  matchAnswers: {},
  selectedLotId: null,
  feedback: ''
};

const boothHotspots = {
  1: { left: 6.2, top: 49.6, width: 12.2, height: 23.5 },
  2: { left: 19.0, top: 61.0, width: 12.0, height: 18.5 },
  3: { left: 33.2, top: 46.0, width: 12.5, height: 19.0 },
  4: { left: 46.2, top: 58.4, width: 12.2, height: 18.4 },
  5: { left: 60.0, top: 42.2, width: 11.8, height: 18.0 },
  6: { left: 73.2, top: 60.0, width: 11.8, height: 19.0 },
  7: { left: 85.5, top: 46.0, width: 12.2, height: 18.5 }
};

const playerStops = [
  { left: 5.0, top: 71.5 },
  { left: 8.8, top: 63.0 },
  { left: 23.2, top: 67.0 },
  { left: 36.0, top: 52.0 },
  { left: 50.0, top: 64.5 },
  { left: 64.2, top: 48.5 },
  { left: 77.6, top: 65.0 },
  { left: 90.4, top: 52.0 }
];

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.completed = new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    state.completed = new Set();
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.completed]));
}

async function boot() {
  loadProgress();
  state.booths = booths;
  render();
}

function activeBooth() {
  return state.booths.find((booth) => String(booth.id) === String(state.activeBoothId));
}

function setScreen(screen) {
  state.screen = screen;
  state.modal = null;
  state.activeBoothId = null;
  state.selectedOption = null;
  state.textAnswer = '';
  state.matchAnswers = {};
  state.selectedLotId = null;
  state.feedback = '';
  render();
}

function openModal(modal, boothId = null) {
  state.modal = modal;
  state.activeBoothId = boothId;
  state.selectedOption = null;
  state.textAnswer = '';
  state.matchAnswers = {};
  state.selectedLotId = null;
  state.feedback = '';
  render();
}

function closeModal() {
  state.modal = null;
  state.activeBoothId = null;
  state.selectedOption = null;
  state.textAnswer = '';
  state.matchAnswers = {};
  state.selectedLotId = null;
  state.feedback = '';
  render();
}

function completeBooth(boothId) {
  state.completed.add(String(boothId));
  saveProgress();
}

function resetProgress() {
  state.completed.clear();
  saveProgress();
  closeModal();
}

function iconMarkup(type) {
  const map = {
    '🎬': 'clapper',
    '🗣️': 'cap',
    '🧮': 'abacus',
    '📊': 'book',
    '🎟️': 'tea',
    '🧩': 'notebook',
    '🎧': 'gear'
  };
  const icon = map[type] || type || 'book';
  return `<span class="pixel-icon pixel-icon-${icon}" aria-hidden="true"></span>`;
}

function render() {
  app.innerHTML = `
    <main class="game-shell">
      <section class="stage ${state.screen === 'map' ? 'stage-map' : 'stage-home'}">
        ${state.screen === 'home' ? renderHome() : renderMap()}
        ${renderModal()}
      </section>
    </main>
  `;
  bindEvents();
}

function renderHome() {
  return `
    <img class="screen-bg" src="${ASSET}home.png" alt="" />
    <div class="home-actions" aria-label="Home actions">
      <button class="pixel-btn secondary" data-action="menu">Menu</button>
      <button class="pixel-btn primary" data-action="play">Let’s Play!</button>
    </div>
  `;
}

function renderMap() {
  const total = state.booths.length || 7;
  const completeCount = completedCount();
  const playerPos = playerStops[Math.min(completeCount, playerStops.length - 1)];
  return `
    <img class="screen-bg" src="${ASSET}map.png" alt="" />
    <div class="map-ui" aria-label="Game progress">
      <div class="progress-pill">Progress ${completeCount} / ${total}</div>
      <div class="star-strip">${state.booths.map((booth) => `<span class="star ${isCompleted(booth) ? 'on' : ''}">★</span>`).join('')}</div>
    </div>
    <div class="map-counter-overlay" aria-label="${completeCount} out of ${total} stars collected">
      <span>${completeCount}</span>
      <strong>/</strong>
      <span>${total}</span>
      <small>stars collected</small>
    </div>
    <div class="moving-player" style="left:${playerPos.left}%;top:${playerPos.top}%;" aria-label="Player progress marker">
      <span class="moving-player-shadow"></span>
      <span class="moving-player-body"></span>
    </div>
    <div class="booth-hotspots" aria-label="Booth map">
      ${state.booths.map((booth) => renderHotspot(booth)).join('')}
    </div>
    ${completeCount === total ? `<button class="draw-entry pixel-btn primary" data-action="draw">Lucky Draw</button>` : ''}
    <button class="reset-link" data-action="reset" type="button">Reset progress</button>
  `;
}

function renderHotspot(booth) {
  const pos = boothHotspots[booth.id];
  if (!pos) return '';
  const done = isCompleted(booth);
  return `
    <button
      class="booth-hotspot ${done ? 'completed' : ''}"
      data-action="booth"
      data-booth="${booth.id}"
      style="left:${pos.left}%;top:${pos.top}%;width:${pos.width}%;height:${pos.height}%"
      aria-label="${booth.name}${done ? ', completed' : ''}"
    >
      <span class="hotspot-star">${done ? '★' : '☆'}</span>
    </button>
  `;
}

function renderModal() {
  if (!state.modal) return '';
  if (state.modal === 'menu') return renderMenuModal();
  if (state.modal === 'booth') return renderBoothModal();
  if (state.modal === 'question') return renderQuestionModal();
  if (state.modal === 'success') return renderSuccessModal();
  if (state.modal === 'draw') return renderDrawModal();
  return '';
}

function renderMenuModal() {
  return `
    <div class="modal-layer">
      <article class="pixel-modal menu-modal" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <div class="modal-window-bar"><span></span><span></span><span></span></div>
        <h2 id="menu-title">How to Play</h2>
        <div class="modal-rule">
          <span class="rule-star">★</span>
          <p>完成每个 booth 的英语小挑战，点亮对应星星。</p>
        </div>
        <div class="modal-rule">
          <span class="rule-star">★</span>
          <p>集齐 7 颗星星后，即可解锁抽奖入口！</p>
        </div>
        <button class="pixel-btn primary compact" data-action="close">Got it!</button>
      </article>
    </div>
  `;
}

function renderBoothModal() {
  const booth = activeBooth();
  if (!booth) return '';
  const done = isCompleted(booth);
  return `
    <div class="modal-layer">
      <article class="pixel-modal booth-modal ${booth.theme}" role="dialog" aria-modal="true" aria-labelledby="booth-title">
        <header class="booth-head" style="--theme:${themeColor(booth)}">
          ${iconMarkup(booth.icon || booth.emoji)}
          <div>
            <h2 id="booth-title">${booth.name}</h2>
            <p>${booth.stageName} · ${booth.theme}</p>
          </div>
          <span class="status-badge">${done ? 'Completed ★' : 'Ready'}</span>
        </header>
        <section class="booth-body">
          <h3>${booth.shortName}</h3>
          <p>${booth.question}</p>
          <p class="reward-note">+1 star after completion</p>
        </section>
        <footer class="modal-actions">
          <button class="pixel-btn secondary compact" data-action="close">BACK</button>
          <button class="pixel-btn primary compact" data-action="start-question" data-booth="${booth.id}">START</button>
        </footer>
      </article>
    </div>
  `;
}

function renderQuestionModal() {
  const booth = activeBooth();
  if (!booth) return '';
  return `
    <div class="modal-layer">
      <article class="pixel-modal question-modal ${booth.theme}" role="dialog" aria-modal="true" aria-labelledby="question-title">
        <header class="question-head" style="--theme:${themeColor(booth)}">
          ${iconMarkup(booth.icon || booth.emoji)}
          <div>
            <h2>${booth.name}</h2>
            <p>${booth.stageName} · ${booth.theme}</p>
          </div>
          <span class="status-badge">Question 1 / 1</span>
        </header>
        <section class="question-body">
          ${renderQuestionContent(booth)}
        </section>
        <footer class="modal-actions question-actions">
          <p class="reward-note">+1 star after completion</p>
          <div class="button-pair">
            <button class="pixel-btn secondary compact" data-action="booth-back">BACK</button>
            <button class="pixel-btn primary compact" data-action="submit">SUBMIT</button>
          </div>
        </footer>
        ${state.feedback ? `<p class="feedback" role="status">${state.feedback}</p>` : ''}
      </article>
    </div>
  `;
}

function renderOption(option, index) {
  const label = String.fromCharCode(65 + index);
  const selected = state.selectedOption === index;
  return `
    <button class="option-card ${selected ? 'selected' : ''}" data-action="select-option" data-index="${index}">
      <span class="option-letter">${label}</span>
      <span>${option}</span>
    </button>
  `;
}

function renderQuestionContent(booth) {
  if (booth.type === 'equation') return renderEquationQuestion(booth);
  if (booth.type === 'draw') return renderDrawQuestion(booth);
  if (booth.type === 'match') return renderMatchQuestion(booth);
  if (booth.type === 'audio') return renderAudioQuestion(booth);
  return renderChoiceQuestion(booth);
}

function renderChoiceQuestion(booth) {
  return `
    ${booth.coverImage ? `<img class="question-media" src="${booth.coverImage}" alt="" />` : ''}
    <h3 id="question-title">${booth.question}</h3>
    ${booth.prompt ? `<p class="prompt">${formatLines(booth.prompt)}</p>` : ''}
    <div class="options">
      ${(booth.options || []).map((option, index) => renderOption(option, index)).join('')}
    </div>
  `;
}

function renderEquationQuestion(booth) {
  return `
    ${booth.referenceImage ? `<img class="question-media small" src="${booth.referenceImage}" alt="" />` : ''}
    <h3 id="question-title">${booth.question}</h3>
    <p class="equation-display">${booth.equation}</p>
    <div class="symbol-hints">
      ${(booth.symbolHints || []).map((hint) => `<span>${hint.symbol}: ${hint.text}</span>`).join('')}
    </div>
    <textarea class="answer-input" data-answer-input placeholder="Type your English sentence here">${state.textAnswer}</textarea>
  `;
}

function renderDrawQuestion(booth) {
  const lots = booth.lots || [];
  const selected = lots.find((lot) => String(lot.id) === String(state.selectedLotId)) || lots[0];
  return `
    <h3 id="question-title">${booth.question}</h3>
    <p class="prompt">请选择一支签，现场扫码或根据对应题目完成挑战。</p>
    <div class="lot-grid">
      ${lots.map((lot) => `<button class="lot-card ${String(lot.id) === String(selected?.id) ? 'selected' : ''}" data-action="select-lot" data-lot="${lot.id}">${lot.name}</button>`).join('')}
    </div>
    ${selected ? `
      <div class="lot-preview">
        <strong>${selected.name}</strong>
        <span>${selected.blessing}</span>
        ${selected.qrAsset ? `<img src="${selected.qrAsset}" alt="${selected.name} QR code" />` : ''}
      </div>
    ` : ''}
  `;
}

function renderMatchQuestion(booth) {
  const items = (booth.wordBank || []).slice(0, 6);
  const meanings = [...items].sort((a, b) => a.meaning.localeCompare(b.meaning, 'zh-Hans-CN'));
  return `
    <h3 id="question-title">${booth.question}</h3>
    <div class="match-list">
      ${items.map((item) => `
        <label class="match-row">
          <span>${item.word}</span>
          <select data-match-word="${item.id}">
            <option value="">选择释义</option>
            ${meanings.map((meaning) => `<option value="${meaning.id}" ${String(state.matchAnswers[item.id] || '') === String(meaning.id) ? 'selected' : ''}>${meaning.meaning}</option>`).join('')}
          </select>
        </label>
      `).join('')}
    </div>
  `;
}

function renderAudioQuestion(booth) {
  return `
    <h3 id="question-title">${booth.question}</h3>
    ${booth.audioFile ? `<audio class="audio-player" controls src="${booth.audioFile}"></audio>` : ''}
    <input class="answer-input single" data-answer-input value="${escapeAttr(state.textAnswer)}" placeholder="Type the missing word" />
  `;
}

function renderSuccessModal() {
  const booth = activeBooth();
  const allDone = completedCount() === state.booths.length;
  return `
    <div class="modal-layer">
      <article class="pixel-modal success-modal" role="dialog" aria-modal="true">
        <div class="success-star">★</div>
        <h2>Challenge Completed!</h2>
        <p>${booth?.name || 'Booth'} cleared. You earned +1 star.</p>
        <div class="modal-actions centered">
          <button class="pixel-btn secondary compact" data-action="map">Back to Map</button>
          ${allDone ? `<button class="pixel-btn primary compact" data-action="draw">Lucky Draw</button>` : ''}
        </div>
      </article>
    </div>
  `;
}

function renderDrawModal() {
  return `
    <div class="modal-layer">
      <article class="pixel-modal draw-modal" role="dialog" aria-modal="true">
        <div class="draw-ticket">LUCKY DRAW</div>
        <h2>Lucky Draw Unlocked!</h2>
        <p>You completed all 7 booths. Show this screen to enter the lucky draw.</p>
        <div class="modal-actions centered">
          <button class="pixel-btn secondary compact" data-action="map">BACK</button>
          <button class="pixel-btn primary compact" data-action="close">Got it!</button>
        </div>
      </article>
    </div>
  `;
}

function formatLines(text) {
  return String(text || '').split('\n').map((line) => `<span>${line}</span>`).join('');
}

function bindEvents() {
  app.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', (event) => {
      const action = event.currentTarget.dataset.action;
      const boothId = event.currentTarget.dataset.booth;
      const index = event.currentTarget.dataset.index;
      const lotId = event.currentTarget.dataset.lot;
      handleAction(action, { boothId, index, lotId });
    });
  });
  app.querySelectorAll('[data-answer-input]').forEach((el) => {
    el.addEventListener('input', (event) => {
      state.textAnswer = event.currentTarget.value;
      state.feedback = '';
    });
  });
  app.querySelectorAll('[data-match-word]').forEach((el) => {
    el.addEventListener('change', (event) => {
      state.matchAnswers[event.currentTarget.dataset.matchWord] = event.currentTarget.value;
      state.feedback = '';
    });
  });
}

function handleAction(action, payload = {}) {
  const { boothId, index, lotId } = payload;
  if (action === 'menu') { playSfx('click'); openModal('menu'); }
  if (action === 'play') { playSfx('start'); setScreen('map'); }
  if (action === 'map') { playSfx('click'); setScreen('map'); }
  if (action === 'close') { playSfx('click'); closeModal(); }
  if (action === 'reset') { playSfx('click'); resetProgress(); }
  if (action === 'booth') { playSfx('click'); openModal('booth', boothId); }
  if (action === 'start-question') { playSfx('start'); openModal('question', boothId); }
  if (action === 'booth-back') { playSfx('click'); openModal('booth', state.activeBoothId); }
  if (action === 'draw') { playSfx('draw'); openModal('draw'); }
  if (action === 'select-option') {
    playSfx('select');
    state.selectedOption = Number(index);
    state.feedback = '';
    render();
  }
  if (action === 'select-lot') {
    playSfx('select');
    state.selectedLotId = lotId;
    state.feedback = '';
    render();
  }
  if (action === 'submit') submitAnswer();
}

function submitAnswer() {
  const booth = activeBooth();
  if (!booth) return;
  if (isAnswerCorrect(booth)) {
    const wasCompleted = isCompleted(booth);
    completeBooth(booth.id);
    playSfx(wasCompleted ? 'correct' : 'complete');
    state.modal = 'success';
    state.feedback = '';
    render();
    return;
  }
  playSfx('wrong');
  state.feedback = '再试一次';
  render();
}

function isAnswerCorrect(booth) {
  if (booth.type === 'equation') {
    const answers = booth.acceptedAnswers?.length ? booth.acceptedAnswers : [booth.answer];
    if (!state.textAnswer.trim()) return false;
    return answers.some((answer) => normalizeAnswer(answer) === normalizeAnswer(state.textAnswer));
  }
  if (booth.type === 'audio') {
    return normalizeAnswer(state.textAnswer) === normalizeAnswer(booth.answer);
  }
  if (booth.type === 'draw') {
    return Boolean(state.selectedLotId || booth.lots?.length);
  }
  if (booth.type === 'match') {
    const items = (booth.wordBank || []).slice(0, 6);
    if (!items.length) return false;
    return items.every((item) => String(state.matchAnswers[item.id]) === String(item.id));
  }
  if (booth.type === 'choice') {
    if (state.selectedOption === null) return false;
    return (booth.options || [])[state.selectedOption] === booth.answer;
  }
  return false;
}

function normalizeAnswer(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.。!！?？]/g, '')
    .replace(/\s+/g, ' ');
}

function isCompleted(booth) {
  return state.completed.has(String(booth.id));
}

function completedCount() {
  return state.booths.filter((booth) => isCompleted(booth)).length;
}

function themeColor(booth) {
  const byId = {
    1: '#77DDF2',
    2: '#FFD66B',
    3: '#92E98E',
    4: '#F4E5C7',
    5: '#FF9BC2',
    6: '#C7B8FF',
    7: '#42576B'
  };
  return booth.color || byId[booth.id] || '#77DDF2';
}

function escapeAttr(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

let audioContext;

function playSfx(type) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const patterns = {
      click: [420, 0.035, 'square', 0.035],
      select: [620, 0.045, 'square', 0.03],
      start: [520, 0.06, 'triangle', 0.04],
      correct: [740, 0.07, 'triangle', 0.045, 940],
      complete: [660, 0.08, 'triangle', 0.05, 880, 1120],
      wrong: [180, 0.12, 'sawtooth', 0.04],
      draw: [560, 0.08, 'triangle', 0.05, 760, 980]
    };
    const pattern = patterns[type] || patterns.click;
    const [, duration, wave, gainValue, ...extra] = pattern;
    [pattern[0], ...extra].forEach((freq, index) => {
      const delay = index * duration * 0.72;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(gainValue, audioContext.currentTime + delay + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + delay + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(audioContext.currentTime + delay);
      osc.stop(audioContext.currentTime + delay + duration + 0.02);
    });
  } catch {
    // Audio is optional; browsers may block it until a user gesture.
  }
}

boot();
