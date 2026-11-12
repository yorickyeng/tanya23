/** Resume an interrupted static file using HTTP byte ranges; callers verify SHA-256. */
export async function downloadBytes(url,expectedBytes,{signal,onProgress=()=>{}}={}){
  const bytes=new Uint8Array(expectedBytes);let received=0,reported=0;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{signal,headers:received?{Range:`bytes=${received}-`}:undefined});
      if(!response.ok){
        const error=new Error(`Файл недоступен (${response.status}): ${url}`);
        if(response.status<500)error.permanent=true;
        throw error;
      }
      if(response.status===206){
        const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')||'');
        if(!range||Number(range[1])!==received||Number(range[3])!==expectedBytes)throw Object.assign(new Error('Invalid resumed file range'),{permanent:true});
      }else received=0; // A server may ignore Range and return the complete file.
      const reader=response.body.getReader();
      for(;;){
        const {done,value}=await reader.read();if(done)break;
        if(received+value.length>expectedBytes)throw Object.assign(new Error('Unexpected downloaded file size'),{permanent:true});
        bytes.set(value,received);received+=value.length;
        reported=Math.max(reported,received);onProgress(reported);
      }
      if(received===expectedBytes)return bytes;
      throw new Error('Файл загружен не полностью.');
    }catch(error){
      if(signal?.aborted||error?.name==='AbortError'||error?.permanent||attempt===2)throw error;
      await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
    }
  }
}
