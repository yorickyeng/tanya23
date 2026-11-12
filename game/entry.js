import {getContext, visibleMoments} from '../core.mjs?v=7';

// Check direct game links too, before downloading the emulator or any game data.
const loading = document.querySelector('#loading');
const loadingMarkup = loading.innerHTML;
const home = new URL('../index.html', location.href);
const query = new URLSearchParams(location.search);
for (const key of ['preview', 'replay']) if (query.has(key)) home.searchParams.set(key, query.get(key));
document.querySelector('#home').href = home.href;
document.querySelector('#fullscreen').disabled = true;
let started = false;
let checking = false;
let lastConfig;

function showWaiting(message) {
  const text = document.createElement('p');
  text.textContent = message;
  const back = document.createElement('a');
  back.textContent = '← На главную';
  const params = new URLSearchParams(location.search);
  params.delete('v'); params.delete('diagnostics');
  back.href = '../index.html' + (params.size ? '?' + params.toString() : '');
  loading.replaceChildren(text, back);
  loading.style.pointerEvents = 'auto';
}

async function checkSchedule() {
  if (started || checking) return;
  checking = true;
  try {
    try {
      const response = await fetch('../content.json', {cache:'no-store'});
      if (!response.ok) throw new Error('Content unavailable');
      lastConfig = await response.json();
    } catch (error) { if (!lastConfig) throw error; }
    const context = getContext(location.search, Date.now(), lastConfig);
    if (!visibleMoments(lastConfig, context).some(moment => moment.type === 'game')) {
      showWaiting('Эта история откроется чуть позже.');
      return;
    }
    started = true;
    loading.innerHTML = loadingMarkup;
    loading.style.pointerEvents = '';
    const preload = document.createElement('link');
    preload.rel = 'preload'; preload.as = 'script'; preload.href = './runtime/jit/boxedwine.js?v=4';
    document.head.append(preload);
    document.querySelector('#fullscreen').disabled = false;
    await import('./engine.js?v=6');
  } catch {
    showWaiting('Не получилось загрузить страницу. Попробуй обновить её.');
  } finally { checking = false; }
}

checkSchedule();
setInterval(checkSchedule, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSchedule(); });
window.addEventListener('pageshow', checkSchedule);
