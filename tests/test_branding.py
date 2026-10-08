import tempfile,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from branding import brand_png,brand_mark

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

    def vector(self,extra='',path='M 0 0 L 20 0 L 10 20 Z'):
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1024" height="1024" {extra}><path d="{path}"/></svg>'.encode()
    def test_missing_vector_falls_back_to_png(self):
        self.assertEqual(brand_mark(self.root,self.fallback),(self.png,'image/png'))
    def test_plain_vector_keeps_geometry_and_white_fill(self):
        (self.brand/'mark.svg').write_bytes(self.vector())
        data,kind=brand_mark(self.root,self.fallback)
        self.assertEqual(kind,'image/svg+xml');self.assertIn(b'M 0 0 L 20 0 L 10 20 Z',data);self.assertIn(b'fill="white"',data)
    def test_vector_active_attributes_are_rejected(self):
        for extra in ('onload="alert(1)"','style="fill:url(https://invalid.test/)"','href="file:///private"'):
            with self.subTest(extra=extra):
                (self.brand/'mark.svg').write_bytes(self.vector(extra))
                self.assertEqual(brand_mark(self.root,self.fallback),(self.png,'image/png'))
    def test_vector_active_elements_are_rejected(self):
        for child in ('<script>alert(1)</script>','<image href="https://invalid.test/"/>','<use href="#x"/>','<g><path d="M0 0"/></g>'):
            with self.subTest(child=child):
                (self.brand/'mark.svg').write_bytes(self.vector().replace(b'</svg>',child.encode()+b'</svg>'))
                self.assertEqual(brand_mark(self.root,self.fallback),(self.png,'image/png'))
    def test_vector_entities_and_oversize_are_rejected(self):
        for data in (b'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///private">]>'+self.vector(),self.vector()+b' ' * 8192):
            (self.brand/'mark.svg').write_bytes(data)
            self.assertEqual(brand_mark(self.root,self.fallback),(self.png,'image/png'))
    def test_vector_nonfinite_and_impossible_viewboxes_are_rejected(self):
        for box in ('0 0 NaN 24','0 0 -1 24','0 0 24','0 0 inf 24','0 0 24000 24'):
            (self.brand/'mark.svg').write_bytes(self.vector().replace(b'0 0 24 24',box.encode()))
            self.assertEqual(brand_mark(self.root,self.fallback),(self.png,'image/png'))
    def test_vector_path_attribute_and_payload_are_rejected(self):
        for data in (self.vector(path='url(https://invalid.test)'),self.vector().replace(b'<path ',b'<path onload="alert(1)" ')):
            (self.brand/'mark.svg').write_bytes(data)
            self.assertEqual(brand_mark(self.root,self.fallback),(self.png,'image/png'))
