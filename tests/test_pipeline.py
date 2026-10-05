import json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
import av
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]

class PipelineTests(unittest.TestCase):
    def test_storyboard_uses_bundled_decoder(self):
        (ROOT/'build').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT/'build') as folder:
            work=Path(folder)
            with av.open(str(work/'video.mp4'),'w') as out:
                stream=out.add_stream('mpeg4',rate=10);stream.width=160;stream.height=90;stream.pix_fmt='yuv420p'
                for n in range(30):
                    frame=av.VideoFrame.from_image(Image.new('RGB',(160,90),(n*7,30,50)))
                    for packet in stream.encode(frame):out.mux(packet)
                for packet in stream.encode():out.mux(packet)
            (work/'meta.json').write_text(json.dumps({'duration':3}),encoding='utf-8')
            command=[sys.executable,str(ROOT/'backend/pipeline/visual_frames.py'),'1000000000000000001','--outdir',str(work)]
            subprocess.run(command,check=True)
            data=json.loads((work/'visual_frames.json').read_text(encoding='utf-8'))
            self.assertEqual(len(data['frames']),3)
            self.assertTrue(all(0<=f['timestamp_seconds']<=3 for f in data['frames']))
            self.assertTrue(all((work/f['file']).is_file() for f in data['frames']))
            self.assertTrue((work/'visual_contact_sheet.jpg').is_file())
            before=(work/'visual_frames.json').stat().st_mtime_ns
            subprocess.run(command,check=True)
            self.assertEqual(before,(work/'visual_frames.json').stat().st_mtime_ns)

if __name__=='__main__':unittest.main()
