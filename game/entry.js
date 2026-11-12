import {getContext, visibleMoments} from '../core.mjs?v=7';

// Check direct game links too, before downloading the emulator or any game data.
const loading = document.querySelector('#loading');
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
    loading.innerHTML = '<span class="spinner" aria-hidden="true"></span><progress id="progress" max="100" value="0" aria-label="Загрузка"></progress><span class="sr-only">Один момент…</span>';
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './runtime/browserfs.boxedwine.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Runtime unavailable'));
      document.head.append(script);
    });
    await import('./engine.js?v=4');
  } catch {
    showWaiting('Не получилось загрузить страницу. Попробуй обновить её.');
  } finally { checking = false; }
}

checkSchedule();
setInterval(checkSchedule, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSchedule(); });
window.addEventListener('pageshow', checkSchedule);
