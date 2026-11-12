export function getContext(search, realNow, config) {
  const params = new URLSearchParams(search);
  const preview = params.get('preview');
  const previewTime = preview && preview !== 'all' ? Date.parse(preview) : NaN;
  const isPreview = preview === 'all' || Number.isFinite(previewTime);
  const archive = realNow >= Date.parse(config.archiveAt);
  const replay = params.get('replay');
  const replayTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(replay || '')
    ? Date.parse(`${config.birthday}T${replay}:00+03:00`) : NaN;
  const isReplay = archive && Number.isFinite(replayTime) && !isPreview;
  return {
    isPreview, all: preview === 'all', archive, isReplay,
    now: Number.isFinite(previewTime) ? previewTime : isReplay ? replayTime : realNow
  };
}

export function visibleMoments(config, context) {
  return config.moments.filter(moment => context.all ||
    (moment.published === true && Date.parse(moment.opensAt) <= context.now));
}

export function formatTime(timestamp, timezone = 'Europe/Moscow') {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit'
  }).format(new Date(timestamp));
}

export function clockTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function mediaURL(source, base) {
  if (!source || typeof source !== 'string') return '';
  const url = new URL(source, base);
  const baseURL = new URL(base);
  if (url.protocol === 'file:' && baseURL.protocol === 'file:') return url.href;
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported media URL');
  if (url.origin !== baseURL.origin) throw new Error('Media must be stored with the site');
  return url.href;
}

export function matchesDateAnswer(answer, acceptedDates) {
  const value = String(answer).normalize('NFKC').trim().toLowerCase();
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const numeric = value.match(/^(\d{1,2})[.\/\s-]+(\d{1,2})(?:[.\/\s-]+(\d{4}|\d{2}))?\.?$/);
  const november = value.match(/^(\d{1,2})\s+ноябр[яь](?:\s+(\d{4})(?:\s+года?)?)?\.?$/);
  let day, month, year;
  if (iso) [, year, month, day] = iso;
  else if (numeric) [, day, month, year] = numeric;
  else if (november) { [, day, year] = november; month = '11'; }
  else return false;
  if (year?.length === 2) year = `20${year}`;
  return acceptedDates.some(date => {
    const [expectedYear, expectedMonth, expectedDay] = date.split('-').map(Number);
    return Number(day) === expectedDay && Number(month) === expectedMonth && (!year || Number(year) === expectedYear);
  });
}
