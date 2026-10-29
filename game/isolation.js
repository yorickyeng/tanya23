/** Enable a dedicated audio thread on static hosts that cannot configure HTTP headers. */
export async function enableIsolation(){
  if(window.crossOriginIsolated||!window.isSecureContext||!('serviceWorker' in navigator))return;
  const marker='tanya23-game-isolation-v1';
  try{
    await navigator.serviceWorker.register(new URL('./coi-worker.js',import.meta.url),{scope:'./'});
    await navigator.serviceWorker.ready;
    if(!sessionStorage.getItem(marker)){
      sessionStorage.setItem(marker,'1');location.reload();
      await new Promise(()=>{});
    }
  }catch(error){console.warn('Audio isolation unavailable; using compatible output',error);}
}
