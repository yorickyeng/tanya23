import { getContext, visibleMoments, formatTime, clockTime, mediaURL } from './core.mjs';

const app = document.getElementById('app');
const embedded = document.getElementById('site-content');
const pageParams = new URLSearchParams(location.search);
const momentID = pageParams.get('id');
let config;
let homeSignature = '';
let activeAudio;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(text, href, className) {
  const node = el('a', className, text);
  node.href = href;
  return node;
}

function route(id, search = location.search) {
  const params = new URLSearchParams(search);
  params.delete('id');
  if (id && config?.moments.some(moment => moment.id === id && moment.type === 'game')) {
    params.set('v', '4');
    return `./game/${params.size ? '?' + params.toString() : ''}`;
  }
  if (id) params.set('id', id);
  const file = id && !embedded ? 'moment.html' : 'index.html';
  return `./${file}${params.size ? '?' + params.toString() : ''}`;
}

function announcement(text) {
  const message = document.getElementById('announcement');
  if (message) message.textContent = text;
}

function previewBanner(context) {
  if (!context.isPreview) return null;
  const banner = el('aside', 'preview-banner');
  banner.append(el('span', '', context.all ? 'Предпросмотр · все блоки, включая черновики' :
    `Предпросмотр · 13 ноября, ${formatTime(context.now, config.timezone)} МСК`));
  banner.append(link('Обычный вид', route(momentID, '')));
  return banner;
}

function modeLinks(context) {
  if (!context.archive || context.isPreview) return null;
  const nav = el('nav', 'archive-nav');
  nav.setAttribute('aria-label', 'Просмотр воспоминаний');
  nav.append(link('Посмотреть всё', './index.html'));
  nav.append(document.createTextNode(' · '));
  nav.append(link('Повторить тот день', './index.html?replay=00%3A00'));
  if (context.isReplay) {
    const label = el('label', 'replay-picker', 'Время в тот день: ');
    const select = el('select');
    for (const time of ['00:00', '09:00', '13:00', '16:00', '20:00', '23:59']) {
      const option = el('option', '', time);
      option.value = time;
      option.selected = pageParams.get('replay') === time;
      select.append(option);
    }
    select.addEventListener('change', () => {
      const params = new URLSearchParams({replay: select.value});
      location.href = './index.html?' + params.toString();
    });
    label.append(select);
    nav.append(label);
  }
  return nav;
}

function renderHome(context) {
  const moments = visibleMoments(config, context);
  const signature = JSON.stringify([moments, context.archive, context.isPreview, context.isReplay]);
  if (homeSignature === signature) return;
  const wasRendered = Boolean(homeSignature);
  homeSignature = signature;
  document.body.className = 'home-page';
  document.title = config.title;
  const fragment = document.createDocumentFragment();
  const banner = previewBanner(context);
  if (banner) fragment.append(banner);
  fragment.append(el('h1', '', config.title));
  fragment.append(el('p', '', context.archive && !context.isReplay ?
    '13 ноября 2026. Здесь осталось всё хорошее.' : 'Небольшая страница для Тани.'));
  fragment.append(el('hr'));
  const heading = el('h2', '', context.archive && !context.isReplay ? 'На память' : 'Сегодня');
  fragment.append(heading);
  if (moments.length) {
    const list = el('ul', 'moment-list');
    for (const moment of moments) {
      const item = el('li');
      item.append(link(moment.title, route(moment.id)));
      if (context.isPreview && !moment.published) item.append(el('small', '', ' [черновик]'));
      item.append(el('p', '', moment.hint));
      list.append(item);
    }
    fragment.append(list);
    if (!context.archive || context.isReplay) fragment.append(el('p', '', 'Иногда заглядывай сюда снова.'));
  } else {
    fragment.append(el('p', '', context.now < Date.parse(`${config.birthday}T00:00:00+03:00`) ?
      'Здесь пока тихо. Загляни 13 ноября.' : 'Новая маленькая история появится чуть позже.'));
  }
  const modes = modeLinks(context);
  if (modes) fragment.append(modes);
  fragment.append(el('hr'));
  const footer = el('footer', '', 'С любовью. ');
  footer.append(el('span', 'tiny-heart', '♡'));
  fragment.append(footer);
  const live = el('p', 'visually-hidden');
  live.id = 'announcement';
  live.setAttribute('role', 'status');
  fragment.append(live);
  app.replaceChildren(fragment);
  app.setAttribute('aria-busy', 'false');
  if (wasRendered) announcement('На странице появились обновления.');
}

function widgetShell(moment, context) {
  document.body.className = `moment-page theme-${moment.type}`;
  document.title = `${moment.title} · ${config.title}`;
  const fragment = document.createDocumentFragment();
  const banner = previewBanner(context);
  if (banner) fragment.append(banner);
  const header = el('header', 'widget-header');
  header.append(link('← На главную', route(null), 'back-link'));
  header.append(el('span', 'wordmark', config.title));
  fragment.append(header);
  const section = el('section', 'widget-intro');
  section.append(el('p', 'eyebrow', moment.eyebrow));
  section.append(el('h1', '', moment.heading));
  if (moment.description) section.append(el('p', 'intro-description', moment.description));
  fragment.append(section);
  const body = el('section', `widget-body ${moment.type}-body`);
  fragment.append(body);
  fragment.append(el('footer', 'widget-footer', 'Для тебя. Чтобы возвращаться.'));
  app.replaceChildren(fragment);
  app.setAttribute('aria-busy', 'false');
  return body;
}

function renderLetter(moment, context) {
  const body = widgetShell(moment, context);
  const envelope = el('div', 'envelope');
  envelope.append(el('span', 'envelope-back'));
  const paper = el('article', 'letter-paper');
  paper.id = 'letter-paper';
  paper.setAttribute('aria-label', 'Письмо');
  paper.hidden = true;
  paper.append(el('span', 'paper-date', '13 ноября 2026'));
  for (const paragraph of moment.paragraphs || []) paper.append(el('p', '', paragraph));
  paper.append(el('p', 'signature', moment.signature));
  const flap = el('span', 'envelope-flap');
  flap.setAttribute('aria-hidden', 'true');
  const front = el('span', 'envelope-front');
  front.setAttribute('aria-hidden', 'true');
  const seal = el('button', 'wax-seal', '♡');
  seal.type = 'button';
  seal.setAttribute('aria-label', 'Открыть письмо');
  seal.setAttribute('aria-expanded', 'false');
  seal.setAttribute('aria-controls', 'letter-paper');
  seal.addEventListener('click', () => {
    const opened = envelope.classList.toggle('is-open');
    paper.hidden = !opened;
    seal.setAttribute('aria-expanded', String(opened));
    seal.setAttribute('aria-label', opened ? 'Свернуть письмо' : 'Открыть письмо');
    note.textContent = opened ? 'Побудь здесь немного.' : 'Нажми на сердечко.';
  });
  envelope.append(paper, flap, front, seal);
  body.append(envelope);
  const note = el('p', 'handwritten envelope-note', 'Нажми на сердечко.');
  body.append(note);
}

function renderSong(moment, context) {
  const body = widgetShell(moment, context);
  const player = el('div', 'record-player');
  const sleeve = el('div', 'record-sleeve');
  sleeve.append(el('span', 'sleeve-mark', '♡'));
  const record = el('button', 'vinyl');
  record.type = 'button';
  record.setAttribute('aria-label', 'Включить песню');
  const recordLabel = el('span', 'record-label');
  recordLabel.append(el('span', '', 'сторона А'), el('strong', '', moment.trackTitle), el('i', 'record-hole'));
  record.append(recordLabel);
  sleeve.append(record);
  player.append(sleeve);
  const info = el('div', 'track-info');
  info.append(el('p', 'track-kicker', 'ЗАПИСАНО ДЛЯ ТЕБЯ'));
  info.append(el('h2', '', moment.trackTitle));
  info.append(el('p', 'artist', moment.artist));
  const audio = el('audio');
  audio.preload = 'metadata';
  activeAudio = audio;
  const source = mediaURL(moment.src, document.baseURI);
  if (source) audio.src = source;
  const playButton = el('button', 'play-button', source ? '▶ Слушать' : 'Запись ещё готовится');
  playButton.type = 'button';
  playButton.disabled = !source;
  record.disabled = !source;
  const rangeLabel = el('label', 'visually-hidden', 'Позиция воспроизведения');
  rangeLabel.htmlFor = 'track-position';
  const range = el('input', 'track-position');
  range.id = 'track-position';
  range.type = 'range';
  range.min = '0'; range.max = '0'; range.value = '0'; range.step = '0.1';
  range.disabled = true;
  const timeRow = el('div', 'time-row');
  const elapsed = el('span', '', '0:00');
  const total = el('span', '', '—:—');
  timeRow.append(elapsed, total);
  const status = el('p', 'player-status', source ? 'Лучше слушать в наушниках.' : 'Эта маленькая сцена ждёт свою песню.');
  status.setAttribute('role', 'status');
  async function togglePlay() {
    if (!source) return;
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); status.textContent = 'С любовью, от первой ноты до последней.'; }
    catch { status.textContent = 'Не получилось включить запись. Попробуй ещё раз.'; }
  }
  playButton.addEventListener('click', togglePlay);
  record.addEventListener('click', togglePlay);
  function updatePlaying() {
    const playing = !audio.paused && !audio.ended;
    player.classList.toggle('is-playing', playing);
    playButton.textContent = playing ? 'Ⅱ Пауза' : '▶ Слушать';
    record.setAttribute('aria-label', playing ? 'Приостановить песню' : 'Включить песню');
    playButton.setAttribute('aria-pressed', String(playing));
  }
  audio.addEventListener('play', updatePlaying);
  audio.addEventListener('pause', updatePlaying);
  audio.addEventListener('ended', updatePlaying);
  audio.addEventListener('loadedmetadata', () => {
    range.max = Number.isFinite(audio.duration) ? String(audio.duration) : '0';
    range.disabled = !Number.isFinite(audio.duration);
    total.textContent = clockTime(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    elapsed.textContent = clockTime(audio.currentTime);
    range.value = String(audio.currentTime);
    range.setAttribute('aria-valuetext', `${clockTime(audio.currentTime)} из ${clockTime(audio.duration)}`);
  });
  audio.addEventListener('error', () => { status.textContent = 'Запись пока недоступна. Загляни сюда немного позже.'; });
  range.addEventListener('input', () => { if (Number.isFinite(audio.duration)) audio.currentTime = Number(range.value); });
  info.append(playButton, rangeLabel, range, timeRow, status, audio);
  player.append(info);
  body.append(player);
  if (moment.lyrics?.length) {
    const details = el('details', 'lyrics');
    details.append(el('summary', '', 'Слова песни'));
    for (const line of moment.lyrics) details.append(el('p', '', line));
    body.append(details);
  }
}

function renderGallery(moment, context) {
  const body = widgetShell(moment, context);
  const grid = el('div', 'memory-grid');
  const items = moment.items || [];
  if (!items.length) {
    for (const [i, label] of ['Маленькие радости', 'Наши места', 'Обыкновенное счастье'].entries()) {
      const card = el('figure', `memory-card memory-placeholder placeholder-${i}`);
      const frame = el('div', 'placeholder-art');
      frame.setAttribute('aria-hidden', 'true');
      frame.append(el('span', '', i === 0 ? '☀' : i === 1 ? '⌂' : '♡'));
      card.append(frame, el('figcaption', '', label));
      grid.append(card);
    }
    body.append(el('p', 'empty-gallery', 'Здесь появятся наши фотографии и короткие видео.'));
  }
  const dialog = el('dialog', 'lightbox');
  dialog.setAttribute('aria-label', 'Фотография');
  const close = el('button', 'lightbox-close', 'Закрыть ×');
  close.type = 'button';
  const full = el('img', 'lightbox-image');
  const caption = el('p', 'lightbox-caption');
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.append(close, full, caption);
  for (const item of items) {
    const card = el('figure', 'memory-card');
    const source = mediaURL(item.src, document.baseURI);
    if (item.type === 'video') {
      const video = el('video', 'memory-image');
      video.src = source;
      video.controls = true; video.playsInline = true; video.preload = 'metadata';
      if (item.poster) video.poster = mediaURL(item.poster, document.baseURI);
      video.setAttribute('aria-label', item.caption || 'Наше видео');
      card.append(video);
    } else {
      const button = el('button', 'photo-button');
      button.type = 'button';
      button.setAttribute('aria-label', `Увеличить: ${item.alt || item.caption || 'фотографию'}`);
      const image = el('img', 'memory-image');
      image.src = source;
      image.alt = item.alt || item.caption || '';
      image.loading = 'lazy'; image.decoding = 'async';
      button.append(image);
      button.addEventListener('click', () => {
        full.src = source; full.alt = image.alt;
        caption.textContent = item.caption || '';
        dialog.showModal();
      });
      card.append(button);
    }
    card.append(el('figcaption', '', item.caption || ''));
    grid.append(card);
  }
  body.append(grid, dialog);
}

function externalLink(text, href, className) {
  const node = link(text, href, className);
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  return node;
}

function renderFood(moment, context) {
  const body = widgetShell(moment, context);
  const intro = document.querySelector('.widget-intro');
  const art = el('img', 'food-hero-art');
  art.src = './assets/birthday-treats.svg';
  art.alt = '';
  art.width = 300; art.height = 240;
  intro.append(art);
  const nav = el('nav', 'food-day-nav');
  nav.setAttribute('aria-label', 'Когда хочется вкусненького');
  moment.stages.forEach(stage => nav.append(link(`${stage.icon} ${stage.shortTitle}`, `#${stage.id}`)));
  body.append(nav);
  const note = el('p', 'food-little-note', 'Пять вкусных поводов улыбнуться. Выбирай по настроению — успевать везде необязательно ♡');
  body.append(note);

  for (const [index, stage] of moment.stages.entries()) {
    const section = el('section', 'food-stage');
    section.id = stage.id;
    section.setAttribute('aria-labelledby', `${stage.id}-title`);
    const label = el('div', 'food-stage-label');
    label.append(el('span', 'food-stage-number', `0${index + 1}`));
    const heading = el('h2', '', stage.title);
    heading.id = `${stage.id}-title`;
    label.append(heading, el('p', '', stage.when));
    section.append(label);
    const places = el('div', 'food-places');
    for (const place of stage.places) {
      const card = el('article', `food-card food-card-${place.id}`);
      const icon = el('span', 'food-place-icon', place.icon);
      icon.setAttribute('aria-hidden', 'true');
      const content = el('div', 'food-place-content');
      content.append(el('p', 'food-place-tag', place.tag), el('h3', '', place.name));
      content.append(externalLink(place.address, place.addressUrl || place.mapUrl, 'food-address'));
      const gift = el('p', 'food-gift');
      gift.append(el('span', '', 'Твой подарок'), el('strong', '', place.gift));
      content.append(gift);
      if (place.condition) content.append(el('p', 'food-condition', place.condition));
      if (place.loveNote) content.append(el('p', 'food-love-note', place.loveNote));
      const actions = el('div', 'food-actions');
      const routeURL = new URL('https://yandex.ru/maps/');
      routeURL.search = new URLSearchParams({mode: 'routes', rtext: `~Москва, ${place.address}`, rtt: 'pd'});
      const walk = externalLink('Идём пешком ↗', routeURL.href, 'food-walk');
      walk.setAttribute('aria-label', `Пеший маршрут до ${place.name} в Яндекс Картах (новая вкладка)`);
      const details = el('details', 'food-map');
      const summary = el('summary', '', 'На карте');
      summary.setAttribute('aria-label', `${place.name} — показать карту`);
      details.append(summary);
      details.addEventListener('toggle', () => {
        if (!details.open || details.querySelector('iframe')) return;
        const frame = el('iframe', 'food-map-frame');
        frame.title = `${place.name}, ${place.address} — Яндекс Карты`;
        frame.loading = 'lazy';
        frame.referrerPolicy = 'no-referrer-when-downgrade';
        const params = place.mapOid
          ? new URLSearchParams({ol: 'biz', oid: place.mapOid, z: '16'})
          : new URLSearchParams({mode: 'search', text: `Москва, ${place.address}`, z: '16'});
        frame.src = `https://yandex.ru/map-widget/v1/?${params}`;
        details.append(frame);
        details.append(externalLink('Открыть в Яндекс Картах ↗', place.mapUrl, 'food-map-external'));
      });
      actions.append(walk, details);
      content.append(actions);
      card.append(icon, content);
      places.append(card);
    }
    section.append(places);
    body.append(section);
  }
  const ending = el('aside', 'food-ending');
  ending.append(el('span', 'food-ending-heart', '♡'), el('p', '', 'Пусть даже рабочий день будет немножко праздником.'), el('span', '', 'И очень вкусным. Обнимаю!'));
  body.append(ending);
}

function renderLocked(context) {
  document.body.className = 'home-page';
  document.title = config.title;
  const title = el('h1', '', config.title);
  app.replaceChildren(title, el('p', '', 'Эта история откроется чуть позже.'), link('Вернуться на главную', route(null)));
  app.setAttribute('aria-busy', 'false');
}

function renderInvitation(moment, context) {
  const body = widgetShell(moment, context);
  const intro = app.querySelector('.widget-intro');
  const questions = moment.questions;
  // Author previews must not unlock the recipient's real invitation on the same device.
  const mode = context.isPreview ? `preview:${pageParams.get('preview')}` : context.isReplay ? 'replay' : 'live';
  const storageKey = `tanya23:invitation:${moment.id}:${moment.opensAt}:v${moment.quizVersion}:${mode}`;
  let step = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Number.isInteger(saved) && saved >= 0 && saved <= questions.length) step = saved;
  } catch { /* The quiz also works when browser storage is unavailable. */ }

  function saveStep() {
    try { localStorage.setItem(storageKey, JSON.stringify(step)); } catch { /* Keep progress in memory. */ }
  }

  function focusHeading() {
    const heading = body.querySelector('h2');
    heading.tabIndex = -1;
    heading.focus({preventScroll: true});
    if (body.getBoundingClientRect().top < 0) body.scrollIntoView({block: 'start'});
  }

  function showInvitation(focus = false) {
    intro.querySelector('.eyebrow').textContent = moment.invitation.eyebrow;
    intro.querySelector('h1').textContent = moment.invitation.heading;
    intro.querySelector('.intro-description').hidden = true;
    const invite = moment.invitation;
    const fragment = document.createDocumentFragment();
    const figure = el('figure', 'dinner-view');
    const photo = el('img');
    photo.src = mediaURL(invite.photo.src, document.baseURI);
    photo.alt = invite.photo.alt;
    photo.width = 1680; photo.height = 840;
    photo.decoding = 'async';
    const caption = el('figcaption');
    caption.append(el('span', '', invite.photo.caption), link(invite.photo.credit, invite.photo.sourceUrl));
    figure.append(photo, caption);
    fragment.append(figure);
    const ticket = el('article', 'dinner-ticket');
    const letter = el('div', 'dinner-letter');
    letter.append(el('p', 'eyebrow', 'У нас с тобой свидание'), el('h2', '', invite.venue), el('p', '', invite.message));
    letter.append(el('p', 'dinner-love-note', invite.note));
    const details = el('div', 'dinner-details');
    const date = el('time', 'dinner-date', invite.dateLabel);
    date.dateTime = invite.startsAt;
    const time = el('time', 'dinner-time', formatTime(invite.startsAt, config.timezone));
    time.dateTime = invite.startsAt;
    details.append(date, time, el('span', 'dinner-timezone', 'по московскому времени'));
    details.append(el('p', 'dinner-booked', 'Столик уже забронирован ♡'));
    const address = el('address', 'dinner-address');
    address.append(el('span', '', invite.address), el('span', '', invite.locationNote));
    details.append(address, link('Посмотреть на карте ↗', invite.mapUrl, 'dinner-map'));
    ticket.append(letter, details);
    fragment.append(ticket);
    const sources = el('details', 'dinner-sources');
    sources.append(el('summary', '', 'Истории за подсказками'));
    const list = el('ul');
    for (const source of invite.sources) {
      const item = el('li');
      item.append(link(source.label, source.url));
      list.append(item);
    }
    sources.append(list, el('p', '', invite.sourceNote));
    fragment.append(sources);
    const restart = el('button', 'dinner-restart', 'Пройти мини-тест ещё раз');
    restart.type = 'button';
    restart.addEventListener('click', () => {
      step = 0;
      saveStep();
      intro.querySelector('.eyebrow').textContent = moment.eyebrow;
      intro.querySelector('h1').textContent = moment.heading;
      intro.querySelector('.intro-description').hidden = false;
      showQuestion(true);
    });
    fragment.append(restart);
    body.replaceChildren(fragment);
    if (focus) focusHeading();
  }

  function showQuestion(focus = false) {
    const question = questions[step];
    const card = el('article', 'dinner-quiz');
    const top = el('div', 'quiz-top');
    top.append(el('span', '', 'Маленькая тайна на двоих'), el('span', '', `${step + 1} / ${questions.length}`));
    const progress = el('div', 'quiz-progress');
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', 'Собрано подсказок');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', String(questions.length));
    progress.setAttribute('aria-valuenow', String(step));
    for (let index = 0; index < questions.length; index++) {
      const dot = el('span', index < step ? 'is-collected' : index === step ? 'is-current' : '');
      progress.append(dot);
    }
    const star = el('span', 'quiz-star', '✧');
    star.setAttribute('aria-hidden', 'true');
    card.append(top, progress, star, el('p', 'quiz-kicker', question.kicker));
    const heading = el('h2', '', question.question);
    heading.id = 'quiz-question';
    card.append(heading);
    const options = el('div', 'quiz-options');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-labelledby', heading.id);
    const feedback = el('div', 'quiz-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const next = el('button', 'quiz-next', step === questions.length - 1 ? 'Открыть моё приглашение ♡' : 'Следующая подсказка →');
    next.type = 'button';
    next.hidden = true;
    let answered = false;
    question.options.forEach((option, index) => {
      const button = el('button', 'quiz-option');
      button.type = 'button';
      button.append(el('span', 'quiz-option-number', String(index + 1).padStart(2, '0')), el('span', '', option));
      button.addEventListener('click', () => {
        if (answered) return;
        if (index !== question.answer) {
          button.disabled = true;
          button.classList.add('is-wrong');
          feedback.className = 'quiz-feedback is-hint';
          feedback.replaceChildren(el('strong', '', 'Держи маленькую подсказку'), el('p', '', question.hint));
          return;
        }
        answered = true;
        button.classList.add('is-correct');
        for (const optionButton of options.children) optionButton.disabled = true;
        progress.setAttribute('aria-valuenow', String(step + 1));
        progress.children[step].className = 'is-collected';
        feedback.className = 'quiz-feedback is-success';
        feedback.replaceChildren(el('strong', '', 'Именно ♡'), el('p', '', question.fact));
        next.hidden = false;
        next.focus({preventScroll: true});
      });
      options.append(button);
    });
    next.addEventListener('click', () => {
      if (!answered) return;
      step++;
      saveStep();
      if (step === questions.length) showInvitation(true);
      else showQuestion(true);
    });
    card.append(options, feedback, next);
    const note = el('p', 'quiz-note', 'Можно угадывать и ошибаться. Я буду подсказывать ♡');
    body.replaceChildren(card, note);
    if (focus) focusHeading();
  }

  if (step === questions.length) showInvitation();
  else showQuestion();
}

function render() {
  const context = getContext(location.search, Date.now(), config);
  if (!momentID) { renderHome(context); return; }
  const moment = visibleMoments(config, context).find(item => item.id === momentID);
  if (!moment) { renderLocked(context); return; }
  const renderers = {letter: renderLetter, song: renderSong, gallery: renderGallery, food: renderFood, invitation: renderInvitation,
    game: () => location.replace(route(moment.id))};
  (renderers[moment.type] || (() => renderLocked(context)))(moment, context);
}

async function refreshContent() {
  if (embedded) return;
  try {
    const response = await fetch('./content.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('Content unavailable');
    config = await response.json();
    if (!momentID) render();
  } catch { /* Keep the last successfully loaded content during a brief network interruption. */ }
}

async function start() {
  if (embedded) config = JSON.parse(embedded.textContent);
  else {
    const response = await fetch('./content.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('Content unavailable');
    config = await response.json();
  }
  render();
  // A locked deep link should unlock without reloading. Do not rebuild an open player or letter.
  setInterval(() => {
    if (!momentID) render();
    else if (document.body.classList.contains('home-page')) render();
  }, 15000);
  if (!embedded) setInterval(refreshContent, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshContent(); });
  window.addEventListener('pagehide', () => activeAudio?.pause());
}

start().catch(() => {
  app.replaceChildren(el('h1', '', 'tanya23'), el('p', '', 'Не получилось открыть страницу. Попробуй обновить её немного позже.'));
  app.setAttribute('aria-busy', 'false');
});
