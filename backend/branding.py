"""Optional private branding; public builds contain only the generic W.

No upload API, arbitrary path, SVG script, or external resource is accepted.
"""
from pathlib import Path
import math,re
import xml.etree.ElementTree as ET

PNG=b'\x89PNG\r\n\x1a\n'

def brand_mark(home, fallback):
    """Prefer a bounded, path-only local vector; fail closed to the PNG.

    Re-serialize a strict allowlist, never return an arbitrary SVG document.
    This format has no CSS, scripts, links, entities, filters, or embedded images.
    """
    root=Path(home).resolve();file=root/'brand'/'mark.svg'
    try:
        if file.is_symlink() or not file.resolve().is_relative_to(root):
            raise ValueError('Private brand must remain in its data home')
        if not 32<=file.stat().st_size<=8192:raise ValueError('Invalid vector size')
        data=file.read_bytes()
        if b'<!' in data or b'<?' in data:raise ValueError('Declarations are not accepted')
        svg=ET.fromstring(data);ns='{http://www.w3.org/2000/svg}'
        if svg.tag!=ns+'svg' or set(svg.attrib)-{'viewBox','width','height','fill'}:
            raise ValueError('Unsupported SVG root')
        view=[float(n) for n in svg.attrib['viewBox'].split()]
        if len(view)!=4 or not all(math.isfinite(n) and abs(n)<=10000 for n in view) or min(view[2:])<=0:
            raise ValueError('Invalid viewBox')
        for key in ('width','height'):
            if not svg.attrib.get(key,'').isdigit() or not 1<=int(svg.attrib[key])<=1024:
                raise ValueError('Invalid dimensions')
        if svg.attrib.get('fill','white') not in ('white','#fff','#ffffff'):
            raise ValueError('Only white path branding is accepted')
        svg.set('fill',svg.attrib.get('fill','white'))
        if not 1<=len(svg)<=16 or (svg.text or '').strip():raise ValueError('Invalid path count')
        for path in svg:
            if path.tag!=ns+'path' or len(path) or set(path.attrib)-{'d','fill'} or (path.text or '').strip() or (path.tail or '').strip():
                raise ValueError('Only plain paths are accepted')
            if path.attrib.get('fill','white') not in ('white','#fff','#ffffff'):
                raise ValueError('Only white paths are accepted')
            if not re.fullmatch(r'[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]{1,6000}',path.attrib.get('d','')):
                raise ValueError('Invalid path data')
        return ET.tostring(svg,encoding='utf-8'),'image/svg+xml'
    except (OSError,ValueError,KeyError,ET.ParseError):
        return brand_png(root,'mark.png',fallback),'image/png'

def brand_png(home, name, fallback):
    if name not in ('mark.png','icon.png'):
        raise ValueError('Unknown brand image')
    root=Path(home).resolve()
    file=root/'brand'/name
    try:
        if file.is_symlink() or not file.resolve().is_relative_to(root):
            raise ValueError('Private brand must remain in its data home')
        if not 32 <= file.stat().st_size <= 2*1024*1024:
            raise ValueError('Invalid brand size')
        data=file.read_bytes()
        if data[:8]!=PNG or data[12:16]!=b'IHDR' or not all(0<int.from_bytes(data[i:i+4],'big')<=1024 for i in (16,20)):
            raise ValueError('Invalid PNG brand')
        return data
    except (OSError,ValueError):
        return Path(fallback).read_bytes()
