"""Read-only homepage bindings. Personal content lives in the private runtime,
not in this module. Only explicitly selected Markdown sources are read."""
import datetime as dt
import json
import re
import threading
from pathlib import Path


def plain(value):
    text = re.sub(r'\[\[([^\]]+)\]\]', lambda m: m[1].split('|')[-1].split('/')[-1], str(value or ''))
    text = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', text)
    return re.sub(r'[*`]|<!--.*?-->', '', text).strip()


def section(text, heading):
    if not heading:
        return text
    lines = text.splitlines()
    start = None
    level = 0
    for n, line in enumerate(lines):
        match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if match and match[2].startswith(heading):
            start, level = n + 1, len(match[1])
            break
    if start is None:
        raise ValueError('资料章节已变化，请核对入口')
    for n in range(start, len(lines)):
        match = re.match(r'^(#{1,6})\s+', lines[n])
        if match and len(match[1]) <= level:
            return '\n'.join(lines[start:n])
    return '\n'.join(lines[start:])


def table_rows(text):
    for line in text.splitlines():
        if not line.strip().startswith('|'):
            continue
        masked = re.sub(r'\[\[[^\]]*\]\]', lambda m: m[0].replace('|', '\x00'), line)
        cells = [plain(c.replace('\x00', '|').replace('\\|', '|')) for c in re.split(r'(?<!\\)\|', masked.strip().strip('|'))]
        if cells and not all(re.fullmatch(r'[:\s-]*', c) for c in cells):
            yield cells


class Homepage:
    def __init__(self, vault, home):
        self.vault = Path(vault).resolve()
        self.file = Path(home) / 'homepage.json'
        self.lock = threading.RLock()
        self.cache_key = None
        self.cache = None

    def config(self):
        try:
            if self.file.stat().st_size > 250_000:
                return {}
            config = json.loads(self.file.read_text(encoding='utf-8-sig'))
            if not isinstance(config, dict) or config.get('schema') != 1 or not isinstance(config.get('stage', {}), dict):
                return {}
            for name in ('sources', 'stages', 'plans', 'projects', 'waiting', 'links', 'overview'):
                if not isinstance(config.get(name, []), list) or any(not isinstance(s, dict) for s in config.get(name, [])):
                    return {}
            ids = [s.get('id') for s in config.get('sources', [])]
            if any(not isinstance(s, str) or not re.fullmatch(r'[\w-]{1,60}', s) for s in ids) or len(set(ids)) != len(ids):
                return {}
            return config
        except (OSError, ValueError):
            return {}

    def path(self, value):
        relative = Path(str(value))
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('资料路径不在选定的知识库内')
        path = (self.vault / relative).resolve()
        parts = path.relative_to(self.vault).parts
        if not parts or parts[0] not in ('处理文件', '输出文件') or path.suffix.lower() != '.md':
            raise ValueError('首页只读取选定的知识笔记或输出文件')
        return path

    def reference(self, key):
        source = next((s for s in self.config().get('sources', []) if s.get('id') == key), None)
        if not source:
            raise ValueError('该资料入口不存在，请重新读取首页')
        path = self.path(source.get('path', ''))
        if not path.is_file():
            raise ValueError('资料已移动或不存在，请核对知识库入口')
        return path.relative_to(self.vault).as_posix()

    def snapshot(self, day=None):
        day = day or dt.date.today()
        with self.lock:
            config = self.config()
            if not config:
                return dict(configured=False, date=day.isoformat(), sources=[], actions=[], schedule=[], projects=[], waiting=[], links=[])
            sources = config.get('sources', [])[:30]
            stats = []
            for source in sources:
                try:
                    stat = self.path(source.get('path', '')).stat()
                    stats.append((source.get('id'), stat.st_mtime_ns, stat.st_size))
                except (OSError, ValueError):
                    stats.append((source.get('id'), None))
            key = (self.file.stat().st_mtime_ns, day.isoformat(), tuple(stats))
            if key == self.cache_key:
                return self.cache
            documents, metadata = {}, []
            for source in sources:
                sid = str(source.get('id', ''))
                try:
                    path = self.path(source.get('path', ''))
                    if path.stat().st_size > 1_000_000:
                        raise ValueError('资料过大，需选更小的权威入口')
                    text = path.read_text(encoding='utf-8-sig')
                    body = section(text, source.get('heading', ''))
                    front = text.split('---', 2)[1] if text.startswith('---') else ''
                    updated = re.search(r'(?m)^updated:\s*(\d{4}-\d{2}-\d{2})', front)
                    documents[sid] = (text, body)
                    metadata.append(dict(id=sid, title=str(source.get('title') or path.stem), updated=updated[1] if updated else '', available=True))
                except (OSError, ValueError):
                    metadata.append(dict(id=sid, title=str(source.get('title', '资料入口')), updated='', available=False))
            available = {s['id'] for s in metadata if s['available']}

            def records(name):
                result = []
                for entry in config.get(name, [])[:12]:
                    item = {k: plain(entry.get(k))[:600] for k in ('id', 'title', 'summary', 'status', 'origin', 'source', 'trigger')}
                    item['deferred'] = entry.get('deferred') is True
                    item['attention'] = entry.get('attention') is True
                    sid = item['source']
                    item['available'] = sid in available
                    if sid not in documents:
                        item['summary'], item['status'] = '资料入口已变化，需核对', '待核对'
                    else:
                        text, body = documents[sid]
                        if entry.get('contains'):
                            matching = [line for line in body.splitlines() if entry['contains'] in line]
                            if not matching:
                                continue  # A resolved blocker must not stay on the home screen.
                            line = matching[0]
                            row = next(table_rows(line), None)
                            item['summary'] = (row[1] if row and len(row) > 1 else plain(line).lstrip('> '))[:600]
                        elif entry.get('table_key'):
                            row = next((r for r in table_rows(body) if r[0] == entry['table_key']), None)
                            item['summary'] = row[1][:600] if row and len(row) > 1 else '记录结构已变化，请打开资料核对'
                        elif entry.get('frontmatter'):
                            match = re.search(r'(?m)^' + re.escape(entry['frontmatter']) + r':\s*(.+)$', text.split('---', 2)[1] if text.startswith('---') else '')
                            item['status'] = plain(match[1]).strip('"\'') if match else '待核对'
                    result.append(item)
                return result

            schedule = []
            for plan in config.get('plans', [])[:6]:
                sid = plan.get('source')
                if sid not in documents:
                    continue
                for row in table_rows(documents[sid][1]):
                    match = re.fullmatch(r'(\d{1,2})/(\d{1,2})', row[0])
                    if not match or len(row) < 4:
                        continue
                    try:
                        date = dt.date(int(plan['year']), int(match[1]), int(match[2]))
                    except (ValueError, KeyError):
                        continue
                    if not day <= date <= day + dt.timedelta(days=6):
                        continue
                    note = row[4] if len(row) > 4 else ''
                    uncertain = any(term in note + row[3] for term in ('待确认', '未收到', '未报完成', '未确认'))
                    schedule.append(dict(id=f'{sid}:{date}', date=date.isoformat(), title=row[3], category=str(plan.get('title', '安排')), summary=note,
                                         status='待确认' if uncertain else '原计划', source=sid, available=True))
            primary = config.get('primary_source', '')
            reported = ''
            if primary in documents:
                text = documents[primary][0]
                match = re.search(r'最新实报截至\s*(\d{1,2})-(\d{1,2})', text)
                if match:
                    updated = next((s['updated'] for s in metadata if s['id'] == primary), '')
                    reported = f'{updated[:4] or day.year}-{int(match[1]):02d}-{int(match[2]):02d}'
            out = dict(configured=True, date=day.isoformat(), reported_until=reported,
                       stage={k: plain(config.get('stage', {}).get(k))[:250] for k in ('title', 'subtitle', 'focus', 'source')},
                       stages=records('stages'), projects=records('projects'), waiting=records('waiting'), links=records('links'), overview=records('overview'),
                       schedule=sorted(schedule, key=lambda s: s['date']), actions=[s for s in schedule if s['date'] == day.isoformat()], sources=metadata)
            self.cache_key, self.cache = key, out
            return out
