import tempfile,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from branding import brand_png

class PrivateBrandTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name);self.brand=self.root/'brand';self.brand.mkdir()
        self.fallback=Path(__file__).resolve().parents[1]/'backend/static/brand.png'
        self.png=self.fallback.read_bytes()
    def tearDown(self):self.tmp.cleanup()
    def test_missing_override_uses_generic(self):
        self.assertEqual(brand_png(self.root,'mark.png',self.fallback),self.png)
    def test_valid_local_png_is_used(self):
        (self.brand/'mark.png').write_bytes(self.png)
        self.assertEqual(brand_png(self.root,'mark.png',self.fallback),self.png)
    def test_svg_and_oversize_are_not_served(self):
        file=self.brand/'mark.png';file.write_bytes(b'<svg onload="alert(1)"></svg>')
        self.assertEqual(brand_png(self.root,'mark.png',self.fallback),self.png)
        file.write_bytes(self.png+b'0'*(2*1024*1024))
        self.assertEqual(brand_png(self.root,'mark.png',self.fallback),self.png)
    def test_impossible_dimensions_are_not_served(self):
        data=bytearray(self.png);data[16:20]=(65535).to_bytes(4,'big')
        (self.brand/'mark.png').write_bytes(data)
        self.assertEqual(brand_png(self.root,'mark.png',self.fallback),self.png)
    def test_arbitrary_names_are_rejected(self):
        with self.assertRaises(ValueError):brand_png(self.root,'../config.json',self.fallback)
