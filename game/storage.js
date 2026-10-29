/** Read the previous BrowserFS save store without changing or deleting it. */
export async function loadLegacySaves(){
  try{
    if(!window.indexedDB?.databases||!window.BrowserFS)return [];
    if(!(await indexedDB.databases()).some(db=>db.name==='tanya23-game-v1'))return [];
    const create=(type,options)=>new Promise((resolve,reject)=>BrowserFS.FileSystem[type].Create(options,(error,fs)=>error?reject(error):resolve(fs)));
    const database=await create('IndexedDB',{storeName:'tanya23-game-v1'});
    const mirror=await create('AsyncMirror',{sync:new BrowserFS.FileSystem.InMemory(),async:database});
    BrowserFS.initialize(mirror);const fs=BrowserFS.BFSRequire('fs'),files=[];
    function visit(dir){
      for(const name of fs.readdirSync(dir)){
        if(name.startsWith('.'))continue;
        const path=(dir==='/'?'':dir)+'/'+name,stat=fs.statSync(path);
        if(stat.isDirectory())visit(path);
        else if(stat.size<=8*1024*1024)files.push({path,data:new Uint8Array(fs.readFileSync(path))});
      }
    }
    visit('/');return files;
  }catch{return [];}
}
/** Use the runtime's native ZIP reader and persistent write overlay, avoiding BrowserFS in gameplay. */
export function prepareStorage(legacy,log){
  FS.mkdirTree('/state');
  const boot=()=>{
    const c='/state/home/username/.wine/drive_c/';FS.mkdirTree(c+'game');
    const marker='/state/legacy-save-imported';
    if(!FS.analyzePath(marker).exists){
      for(const file of legacy){
        const path=c+'game'+file.path;
        if(!FS.analyzePath(path).exists){FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));FS.writeFile(path,file.data);}
      }
      FS.writeFile(marker,'1');
    }
    FS.writeFile(c+'start.cmd','@echo off\r\nC:\r\ncd \\game\r\nNP.EXE\r\n');
  };
  try{
    FS.mount(Module.IDBFS,{autoPersist:true},'/state');
    addRunDependency('game-saves');
    FS.syncfs(true,error=>{
      if(error)log('Save storage unavailable:',error);
      try{boot();}finally{removeRunDependency('game-saves');}
    });
  }catch(error){log('Using temporary save storage:',error);boot();}
}
