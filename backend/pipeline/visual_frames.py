"""Timestamped storyboard using PyAV + Pillow, with no system FFmpeg dependency."""
import argparse,json,math
from pathlib import Path
import av
from PIL import Image,ImageDraw

def main():
    p=argparse.ArgumentParser();p.add_argument('video_id');p.add_argument('--outdir',required=True)
    a=p.parse_args();work=Path(a.outdir)
    if (work/'visual_frames.json').exists() and (work/'visual_contact_sheet.jpg').exists():return
    folder=work/'visual_frames';folder.mkdir(exist_ok=True)
    meta=json.loads((work/'meta.json').read_text(encoding='utf-8'))
    with av.open(str(work/'video.mp4')) as container:
        stream=container.streams.video[0]
        duration=float(meta.get('duration') or (container.duration or 0)/av.time_base)
        count=min(24,max(3,math.ceil(duration/15)))
        stamps=[max(0,min(duration-.05,(i+.3)*duration/count)) for i in range(count)]
        frames=[];thumbs=[]
        for n,stamp in enumerate(stamps):
            container.seek(int(stamp*av.time_base),backward=True,any_frame=False)
            image=None;actual=stamp
            for frame in container.decode(stream):
                if frame.time is not None and frame.time>=stamp-.02:
                    image=frame.to_image();actual=float(frame.time);break
            if image is None:continue
            name=f'visual_frames/frame_{n:03d}.jpg';image.save(work/name,quality=88)
            frames.append(dict(file=name,timestamp_seconds=actual,width=image.width,height=image.height))
            image.thumbnail((280,210));cell=Image.new('RGB',(300,245),'#111111')
            cell.paste(image,((300-image.width)//2,10));ImageDraw.Draw(cell).text((10,222),f'{actual:.2f}s',fill='white');thumbs.append(cell)
    if not frames:raise RuntimeError('No decodable video frames; not generating an empty storyboard')
    sheet=Image.new('RGB',(1200,245*math.ceil(len(thumbs)/4)),'#111111')
    for n,t in enumerate(thumbs):sheet.paste(t,((n%4)*300,(n//4)*245))
    sheet.save(work/'visual_contact_sheet.jpg',quality=88)
    (work/'visual_frames.json').write_text(json.dumps(dict(frames=frames,duration=duration),ensure_ascii=False),encoding='utf-8')

if __name__=='__main__':main()
