"""Local ASR only. No API keys, cloud cleaning or vault path configuration."""
import argparse, datetime, os
from pathlib import Path

def main():
    p=argparse.ArgumentParser()
    p.add_argument('command',choices=['transcribe']);p.add_argument('video_id')
    p.add_argument('--outdir',required=True);p.add_argument('--model',default='small')
    a=p.parse_args();work=Path(a.outdir);target=work/'transcript_raw.txt'
    if target.exists():return
    from faster_whisper import WhisperModel
    model=WhisperModel(a.model,device='cpu',compute_type='int8')
    segments,_=model.transcribe(str(work/'video.mp4'),language='zh',beam_size=5,vad_filter=True)
    text='\n'.join(f'[{datetime.timedelta(seconds=int(s.start))}] {s.text.strip()}' for s in segments)
    target.write_text(text,encoding='utf-8')

if __name__=='__main__':main()
