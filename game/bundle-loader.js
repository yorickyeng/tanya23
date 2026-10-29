/** Load a versioned archive from small static files; verify every part. */
export async function loadBundle(manifestUrl, {onProgress = () => {}, signal} = {}) {
  const url = new URL(manifestUrl, location.href);
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`Не удалось загрузить список файлов (${response.status}).`);
  const manifest = await response.json();
  if (!Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || !Array.isArray(manifest.parts) || !manifest.parts.length ||
      manifest.parts.some(p => !Number.isSafeInteger(p.bytes) || p.bytes <= 0 || !/^[a-f0-9]{64}$/.test(p.sha256) || typeof p.url !== 'string') ||
      manifest.parts.reduce((n, p) => n + p.bytes, 0) !== manifest.bytes) {
    throw new Error('Список файлов игры повреждён.');
  }
  const data = new Uint8Array(manifest.bytes);
  const offsets = []; let offset = 0;
  for (const part of manifest.parts) { offsets.push(offset); offset += part.bytes; }
  let next = 0, received = 0;
  onProgress(0, manifest.bytes, manifest.title);
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= manifest.parts.length) return;
      const part = manifest.parts[index];
      // Package URLs are relative to the manifest, keeping subfolder embeds portable.
      const partUrl = new URL(part.url, url);
      if (partUrl.origin !== url.origin) throw new Error('Файл игры находится на другом сайте.');
      const result = await fetch(partUrl, {signal});
      if (!result.ok) throw new Error(`Файл игры недоступен (${result.status}): ${part.url}`);
      const bytes = new Uint8Array(await result.arrayBuffer());
      if (bytes.length !== part.bytes) throw new Error(`Файл загружен не полностью: ${part.url}`);
      // WebCrypto is unavailable on an HTTP custom domain. Keep the same
      // integrity check there using a local, portable SHA-256 implementation.
      let digest;
      if (globalThis.crypto?.subtle) digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      else {
        const {sha256} = await import('./sha256.js');
        digest = sha256(bytes);
      }
      const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
      if (hash !== part.sha256) throw new Error(`Проверка файла не пройдена: ${part.url}. Обнови страницу.`);
      data.set(bytes, offsets[index]);
      received += bytes.length;
      onProgress(received, manifest.bytes, manifest.title);
    }
  }
  await Promise.all(Array.from({length: Math.min(3, manifest.parts.length)}, worker));
  return {data, manifest};
}
