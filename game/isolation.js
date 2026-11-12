/** Install isolation for later navigations without delaying or reloading a first visit. */
export async function enableIsolation(){
  if(window.crossOriginIsolated||!window.isSecureContext||!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register(new URL('./coi-worker.js',import.meta.url),{scope:'./'}).catch(error=>console.warn('Audio isolation unavailable; using buffered output',error));
}
