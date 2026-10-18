"""Local ASR only. No API keys, cloud cleaning or vault path configuration."""
import argparse, datetime, json, os, subprocess, sys, time
from pathlib import Path

def main():
    p=argparse.ArgumentParser()
    p.add_argument('command',choices=['transcribe']);p.add_argument('video_id')
    p.add_argument('--outdir',required=True);p.add_argument('--model',default='small')
    p.add_argument('--device',choices=['auto','cuda','cpu'],default='auto')
    a=p.parse_args();work=Path(a.outdir);target=work/'transcript_raw.txt'
    if target.exists():return
    if a.device=='auto':
        # A CUDA DLL failure can terminate Python; isolate GPU work before CPU fallback.
        print('ASR: trying CUDA / float16',flush=True)
        try:
            result=subprocess.run([sys.executable,str(Path(__file__).resolve()),'transcribe',a.video_id,
                '--outdir',str(work),'--model',a.model,'--device','cuda'],
                timeout=1200,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            if result.returncode==0 and target.exists():return
            print('ASR: GPU process failed; falling back to CPU / int8',flush=True)
        except (OSError,subprocess.TimeoutExpired) as error:
            print('ASR: GPU unavailable ('+type(error).__name__+'); falling back to CPU / int8',flush=True)
        a.device='cpu'
    dll_handles=[]
    if a.device=='cuda' and os.name=='nt':
        home=Path(os.environ.get('WORKDESK_HOME',Path(os.environ.get('APPDATA',Path.home()/'.local/share'))/'Workdesk'))
        config=Path(os.environ.get('WORKDESK_CONFIG',home/'config.json'))
        settings=json.loads(config.read_text(encoding='utf-8-sig')) if config.exists() else {}
        cuda_root=Path(settings.get('asr_cuda_path') or home/'components/cuda')
        folders=[folder for folder in (cuda_root/'nvidia').glob('*/bin') if folder.is_dir()]
        for folder in folders:dll_handles.append(os.add_dll_directory(str(folder.resolve())))
        os.environ['PATH']=os.pathsep.join([str(f.resolve()) for f in folders]+[os.environ.get('PATH','')])
    started=time.monotonic()
    from faster_whisper import WhisperModel
    precision='float16' if a.device=='cuda' else 'int8'
    model=WhisperModel(a.model,device=a.device,compute_type=precision)
    print(f'ASR: model={a.model}, device={a.device}, compute_type={precision}',flush=True)
    segments,_=model.transcribe(str(work/'video.mp4'),language='zh',beam_size=5,vad_filter=True)
    text='\n'.join(f'[{datetime.timedelta(seconds=int(s.start))}] {s.text.strip()}' for s in segments)
    pending=target.with_suffix('.tmp')
    pending.write_text(text,encoding='utf-8')
    os.replace(pending,target)
    print(f'ASR: completed in {time.monotonic()-started:.1f}s',flush=True)

if __name__=='__main__':main()
