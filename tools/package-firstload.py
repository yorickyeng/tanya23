"""Build reduced first-download assets from the unmodified source archives.

Requires Python 3 and macOS afconvert for AAC encoding. Original packages remain intact.
"""
import argparse, concurrent.futures, gzip, hashlib, io, json, struct, subprocess, tempfile, wave, zipfile
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--wine-files',type=Path,required=True)
args=parser.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest()
def original(name):
 p=args.source/'game/assets'/name;m=json.loads((p/'manifest.json').read_text())
 return b''.join((p/part['url']).read_bytes() for part in m['parts'])
def archive(files):
 output=io.BytesIO()
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,9) as z:
  for name,data in sorted(files.items()):
   info=zipfile.ZipInfo(name,(2002,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
   z.writestr(info,data)
 return output.getvalue()
def bundle(name,data):
 p=args.output/name;p.mkdir(parents=True,exist_ok=True);parts=[]
 for i,start in enumerate(range(0,len(data),4*1024*1024)):
  block=data[start:start+4*1024*1024];file=f'part-{i:03d}.bin';(p/file).write_bytes(block)
  parts.append({'url':file,'bytes':len(block),'sha256':sha(block)})
 (p/'manifest.json').write_text(json.dumps({'title':'Данные','bytes':len(data),'sha256':sha(data),'parts':parts},indent=2)+'\n')
 return len(data)
args.output.mkdir(parents=True,exist_ok=True)
wine=zipfile.ZipFile(io.BytesIO(original('wine-jit-v1')))
keep=set(json.loads(args.wine_files.read_text()))
wf={n:wine.read(n) for n in wine.namelist() if n in keep or n.endswith('/')}
wine_bytes=bundle('wine',archive(wf))
game=zipfile.ZipFile(io.BytesIO(original('game-fast-v1')))
gf={n:game.read(n) for n in game.namelist() if not n.endswith('/') and n!='SOUNDS.RES'}
game_bytes=bundle('game',archive(gf))
sounds=game.read('SOUNDS.RES');audio=args.output/'audio';audio.mkdir(exist_ok=True)
tracks=[];seen={}
for index in range(50,60):
 offset,size=struct.unpack_from('<II',sounds,index*8)
 if offset==0xffffffff:continue
 key=(offset,size)
 if key not in seen:
  seen[key]=f'music-{index:02d}.m4a'
  tracks.append({'file':seen[key],'offset':16000+offset,'pcmBytes':size,'frames':size//4,'ids':[]})
 next(track for track in tracks if track['file']==seen[key])['ids'].append(index)
base=sounds[:min(track['offset'] for track in tracks)];base_gz=gzip.compress(base,compresslevel=9,mtime=0);(audio/'effects.gz').write_bytes(base_gz)
with tempfile.TemporaryDirectory() as td:
 def encode(track):
  wav=Path(td)/(track['file']+'.wav')
  with wave.open(str(wav),'wb') as w:
   w.setnchannels(2);w.setsampwidth(2);w.setframerate(22050);w.writeframes(sounds[track['offset']:track['offset']+track['pcmBytes']])
  dest=audio/track['file']
  subprocess.run(['/usr/bin/afconvert','-f','m4af','-d','aac ','-b','48000','-q','127',str(wav),str(dest)],check=True)
  encoded=dest.read_bytes();track.update(bytes=len(encoded),sha256=sha(encoded))
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(encode,tracks))
audio_manifest={'sampleRate':22050,'channels':2,'bankBytes':len(sounds),'tableBytes':16000,'base':{'file':'effects.gz','bytes':len(base_gz),'sha256':sha(base_gz),'rawBytes':len(base),'rawSha256':sha(base)},'tracks':tracks}
(audio/'manifest.json').write_text(json.dumps(audio_manifest,indent=2)+'\n')
wasm=(args.source/'game/runtime/jit/boxedwine.wasm').read_bytes();wasm_gz=gzip.compress(wasm,compresslevel=9,mtime=0);(args.output/'runtime.wasm.gz').write_bytes(wasm_gz)
manifest={'version':3,'wineBytes':wine_bytes,'gameBytes':game_bytes,'audioBytes':len(base_gz)+sum(track['bytes'] for track in tracks),'runtime':{'file':'runtime.wasm.gz','bytes':len(wasm_gz),'sha256':sha(wasm_gz),'rawBytes':len(wasm),'rawSha256':sha(wasm)}}
manifest['downloadBytes']=wine_bytes+game_bytes+manifest['audioBytes']+len(wasm_gz)
(args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
