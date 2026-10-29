/** Scheduled native Web Audio output for HTTP / browsers without shared worklet memory. */
export function installBufferedAudio(audio,getHeap,module,{force=false,Audio=globalThis.AudioContext||globalThis.webkitAudioContext,setTimer=setInterval,clearTimer=clearInterval}={}){
  if(!audio||!Audio||(!force&&audio.available()))return false;
  Object.assign(audio,{devices:new Map(),nextId:1,context:null,failed:false,timer:null,resume:null});
  const queued=device=>{
    const now=audio.context.currentTime;let remaining=0;
    device.segments=device.segments.filter(segment=>{
      const played=Math.min(segment.frames,Math.max(0,Math.floor((now-segment.start)*device.rate+1e-6)));
      remaining+=segment.frames-played;return played<segment.frames;
    });
    device.consumed=device.written-remaining;return remaining;
  };
  const dispose=device=>{
    for(const source of device.nodes){try{source.stop();source.disconnect();}catch{}}
    device.nodes.clear();device.segments=[];audio.devices.delete(device.id);
  };
  audio.available=()=>!audio.failed;
  audio.initialize=()=>{
    if(audio.context)return;
    const context=audio.context=new Audio({latencyHint:'playback'});module.boxedwineAudio=audio;
    audio.resume=()=>{if(context.state==='suspended')context.resume().catch(()=>{});};
    if(typeof window!=='undefined')for(const name of ['pointerdown','keydown'])window.addEventListener(name,audio.resume,true);
    if(globalThis.navigator?.userActivation?.hasBeenActive)audio.resume();
    audio.timer=setTimer(()=>{for(const device of audio.devices.values())if(device.closing&&!queued(device))dispose(device);},25);
  };
  audio.open=(channels,rate,targetFrames)=>{
    if(audio.failed||channels<1||channels>8||rate<=0||!targetFrames)return 0;
    try{
      audio.initialize();let capacity=1;while(capacity<rate/2)capacity*=2;
      const id=audio.nextId++;audio.devices.set(id,{id,channels,rate,targetFrames,capacity,segments:[],nodes:new Set(),
        written:0,consumed:0,nextTime:0,maxQueued:0,starvedFrames:0,starvationEpisodes:0,queueFailures:0,closing:false});return id;
    }catch{audio.failed=true;return 0;}
  };
  audio.queued=queued;
  audio.queue=(id,pointer,frames)=>{
    const device=audio.devices.get(id);if(!device||device.closing||audio.failed)return 0;
    if(frames>device.capacity-queued(device)){device.queueFailures++;return 0;}
    if(!frames)return 1;
    try{
      // Read the current heap each time: JIT memory may grow between packets.
      const heap=getHeap(),view=new DataView(heap.buffer,heap.byteOffset+pointer,frames*device.channels*4);
      const buffer=audio.context.createBuffer(device.channels,frames,device.rate);
      for(let c=0;c<device.channels;c++){
        const samples=buffer.getChannelData(c);
        for(let i=0;i<frames;i++)samples[i]=view.getFloat32((i*device.channels+c)*4,true);
      }
      const now=audio.context.currentTime;let start=device.nextTime;
      if(!device.written)start=now+0.07;
      else if(start<now){
        if(now-start>0.005){device.starvationEpisodes++;device.starvedFrames+=Math.round((now-start)*device.rate);}
        start=now+0.02;
      }
      const source=audio.context.createBufferSource();source.buffer=buffer;source.connect(audio.context.destination);
      device.nodes.add(source);source.onended=()=>{device.nodes.delete(source);source.disconnect();};
      source.start(start);device.segments.push({start,frames});device.nextTime=start+frames/device.rate;device.written+=frames;
      device.maxQueued=Math.max(device.maxQueued,queued(device));return 1;
    }catch{audio.failed=true;return 0;}
  };
  audio.close=(id,drain)=>{const device=audio.devices.get(id);if(device){device.closing=true;if(!drain||!queued(device))dispose(device);}};
  audio.snapshot=()=>({backend:'scheduled-audio',failed:audio.failed,state:audio.context?.state,sampleRate:audio.context?.sampleRate,
    baseLatencyMs:audio.context?.baseLatency*1000,outputLatencyMs:audio.context?.outputLatency*1000,
    devices:Array.from(audio.devices.values(),device=>{
      const count=queued(device);return {id:device.id,channels:device.channels,inputRate:device.rate,ready:true,
        targetQueueMs:device.targetFrames*1000/device.rate,queuedFrames:count,queuedMs:count*1000/device.rate,
        consumedFrames:device.consumed,writtenFrames:device.written,starvedFrames:device.starvedFrames,
        starvationEpisodes:device.starvationEpisodes,maxQueuedMs:device.maxQueued*1000/device.rate,
        queueFailures:device.queueFailures,closing:device.closing};
    })});
  audio.shutdown=()=>{
    for(const device of [...audio.devices.values()])dispose(device);
    if(audio.timer!==null)clearTimer(audio.timer);
    if(typeof window!=='undefined')for(const name of ['pointerdown','keydown'])window.removeEventListener(name,audio.resume,true);
    audio.context?.close().catch(()=>{});audio.context=null;audio.timer=null;
  };
  return true;
}
