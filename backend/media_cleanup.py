"""Reclaim only verified, published media; never remove a note or its dependencies."""
import hashlib, html, json, re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import url2pathname
from storage import read_json


def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def normalized(value):return re.sub(r'/+','/',unquote(html.unescape(str(value))).replace('\\','/')).casefold()


def local_file(root, value):
    path=root/value
    if path.is_symlink() or (hasattr(path,'is_junction') and path.is_junction()):raise ValueError('Linked media is protected')
    resolved=path.resolve();resolved.relative_to(root)
    # Reject linked parent directories, including links back into the same root.
    for parent in path.parents:
        if parent==root:break
        if parent.is_symlink() or (hasattr(parent,'is_junction') and parent.is_junction()):raise ValueError('Linked media is protected')
    return resolved


def referenced_files(vault, files, vid):
    """Read references only; unknown/unreadable notes abort cleanup rather than guess."""
    protected=set();keys={normalized(p):p for p in files}
    links=re.compile(r'\[\[([^\]\n]+)\]\]|\[[^\]\n]*\]\(([^)\n]+)\)|(?:src|href)\s*=\s*[\"\']([^\"\']+)[\"\']',re.I)
    notes=(p for zone in ('原始资料','处理文件','输出文件','skills') for p in (vault/zone).rglob('*'))
    def inspect(note):
        found=set()
        text=note.read_text(encoding='utf-8-sig')
        if note.suffix.lower()=='.canvas':text=json.dumps(json.loads(text),ensure_ascii=False)
        plain=normalized(text)
        found.update(p for key,p in keys.items() if key in plain)
        for match in links.finditer(text):
            target=next(x for x in match.groups() if x is not None).split('|',1)[0].strip()
            target=html.unescape(target).split('#',1)[0].strip('<>')
            if vid in plain:
                # Retain ambiguous relative frame/image links in this work's notes too.
                found.update(p for p in files if normalized(target).endswith('/'+p.name.casefold()) or normalized(target)==p.name.casefold())
            if target.lower().startswith('file:'):
                url=urlsplit(target)
                if url.netloc not in ('','localhost'):continue
                target=url2pathname(url.path)
            elif re.match(r'^[a-z][\w+.-]+:',target,re.I) and not re.match(r'^[a-z]:[/\\]',target,re.I):continue
            else:target=unquote(target)
            for base in (note.parent,vault):
                resolved=(base/target).resolve()
                if normalized(resolved) in keys:found.add(keys[normalized(resolved)])
        return found
    notes=(p for p in notes if p.suffix.lower() in {'.md','.canvas','.base'} and p.is_file() and '.git' not in p.relative_to(vault).parts)
    with ThreadPoolExecutor(max_workers=4) as workers:
        for found in workers.map(inspect,notes):protected.update(found)
    return protected


def cleanup_media(media, vault, vid, run, note, statuses, *, dry_run=False):
    if not re.fullmatch(r'\d{15,22}',vid):raise ValueError('Invalid media identity')
    if not statuses or 'completed' not in statuses or any(s not in {'completed','skipped'} for s in statuses):raise ValueError('Unfinished or failed jobs retain their media')
    media=Path(media).resolve();vault=Path(vault).resolve();folder=local_file(media,vid)
    if folder.is_relative_to(vault) or vault.is_relative_to(folder):raise ValueError('Vault content is never cleanup media')
    meta=read_json(folder/'meta.json',{})
    if str(meta.get('aweme_id'))!=vid or meta.get('kind','video') not in {'video','images'}:raise ValueError('Media identity not verified')
    journal=read_json(Path(run)/'publish-journal.json',{})
    if journal.get('note')!=note:raise ValueError('Missing publication proof')
    published={}
    for key,zone in (('note','处理文件'),('raw','原始资料')):
        path=local_file(vault,journal.get(key,''));path.relative_to(vault/zone)
        if path.suffix!='.md' or not journal.get(key+'_sha256') or digest(path)!=journal[key+'_sha256']:raise ValueError('Publication changed or is incomplete')
        text=path.read_text(encoding='utf-8-sig')
        if not re.search(r'(?:/video/|/note/|modal_id=)'+vid+r'(?!\d)',text):raise ValueError('Published source does not match')
        published[key]=(path,text)
    index=published['note'][0].parent/'_索引.md'
    if f'[[{note}]]' not in index.read_text(encoding='utf-8-sig'):raise ValueError('Publication index is incomplete')
    log=vault/'原始资料/已处理/_处理日志.md'
    if log.exists() and f'<!-- douyin-workbench:{vid} -->' not in log.read_text(encoding='utf-8-sig'):raise ValueError('Publication log is incomplete')
    names=['video.mp4','video.part','visual_contact_sheet.jpg']
    names.extend(p.relative_to(folder).as_posix() for p in (folder/'visual_frames').glob('frame_*.jpg') if re.fullmatch(r'frame_\d{3}\.jpg',p.name))
    image_rows={}
    if meta.get('kind')=='images':
        manifest=read_json(folder/'images.json',{});rows=manifest.get('images',[])
        if not rows or len(rows)!=manifest.get('count') or len(rows)!=meta.get('image_count'):raise ValueError('Incomplete image manifest')
        for row in rows:
            name=row.get('file','')
            if not re.fullmatch(r'image_\d{3}\.(?:jpg|png|webp)',name):raise ValueError('Unknown original image')
            image_rows[name]=row;names.append(name)
    candidates={}
    for name in names:
        path=local_file(folder,name)
        if path.is_file():candidates[path]=path.stat()
    protected=referenced_files(vault,candidates,vid) if candidates else set()
    for key,(path,_) in published.items():
        if digest(path)!=journal[key+'_sha256']:raise ValueError('Publication changed during reference checks')
    for name,row in image_rows.items():
        original=local_file(folder,name)
        if original not in candidates:continue
        attachment=vault/'原始资料/已处理'/f'抖音_{vid}_图{int(row["image_number"]):02d}{original.suffix}'
        rel=attachment.relative_to(vault).as_posix()
        # Originals are duplicates only after an intact, explicitly embedded vault copy exists.
        if f'![[{rel}]]' not in published['raw'][1] or not attachment.is_file() or attachment.is_symlink() or not attachment.resolve().is_relative_to(vault) or digest(original)!=row.get('sha256') or digest(attachment)!=row.get('sha256'):
            protected.add(original)
    result=dict(dry_run=dry_run,deleted=[],protected=[],errors=[],bytes=0)
    for path,stat in candidates.items():
        name=path.relative_to(folder).as_posix()
        if path in protected:result['protected'].append(name);continue
        try:
            current=path.stat()
            if (current.st_size,current.st_mtime_ns)!=(stat.st_size,stat.st_mtime_ns):result['protected'].append(name);continue
            local_file(folder,name)
            if not dry_run:path.unlink()
            result['deleted'].append(name);result['bytes']+=stat.st_size
        except OSError:result['errors'].append(name)
    return result
