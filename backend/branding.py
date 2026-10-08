"""Optional private raster branding; public builds contain only the generic W.

No upload API, arbitrary path, SVG script, or external resource is accepted.
"""
from pathlib import Path

PNG=b'\x89PNG\r\n\x1a\n'

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
