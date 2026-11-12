/** Fullscreen changes presentation only: the guest canvas remains 800 × 600. */
export function setupControls({onHome=()=>{}}={}){
  const player=document.querySelector('#player'),home=document.querySelector('#home'),button=document.querySelector('#fullscreen');
  const status=document.querySelector('#player-status'),stage=document.querySelector('#stage');
  const destination=new URL('../index.html',location.href),params=new URLSearchParams(location.search);
  for(const key of ['preview','replay'])if(params.has(key))destination.searchParams.set(key,params.get(key));
  home.href=destination.href;home.addEventListener('click',onHome);
  const request=player.requestFullscreen||player.webkitRequestFullscreen;
  let expanded=false;
  const nativeActive=()=>document.fullscreenElement===player||document.webkitFullscreenElement===player;
  const active=()=>nativeActive()||expanded;
  const update=()=>{
    const label=active()?'Свернуть':'На весь экран';button.setAttribute('aria-pressed',String(active()));
    player.dataset.expanded=String(expanded);document.body.classList.toggle('expanded',expanded);
    button.setAttribute('aria-label',label);button.title=label;button.querySelector('span').textContent=label;
  };
  button.addEventListener('click',async()=>{
    try{
      if(nativeActive())await (document.exitFullscreen||document.webkitExitFullscreen).call(document);
      else if(expanded)expanded=false;
      else if(request)await request.call(player,{navigationUI:'hide'});
      else expanded=true;
      update();
    }catch{expanded=true;update();document.querySelector('#fullscreen-message').textContent='Игровое окно развёрнуто внутри страницы.';}
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded){expanded=false;update();event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('fullscreenchange',update);document.addEventListener('webkitfullscreenchange',update);
  const labels={loading:'Подготовка…',starting:'Запускаем…',running:'Готово к игре',paused:'Пауза',ended:'До новой встречи',error:'Загрузка прервана'};
  const state=()=>{status.querySelector('span').textContent=labels[stage.dataset.state]||'Подготовка…';status.dataset.ready=String(stage.dataset.state==='running');};
  new MutationObserver(state).observe(stage,{attributes:true,attributeFilter:['data-state']});state();
}
