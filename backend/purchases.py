"""Private purchase records, not a scraper or an autonomous decision maker."""
import datetime as dt
import json
import re
import uuid
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

STATUSES = {'research': '了解需求', 'waiting': '等待条件', 'ready': '准备决策',
            'decided': '已决定', 'shelved': '暂不考虑'}
ORIGINS = {'user': '用户记录', 'advice': 'AI建议', 'source': '资料摘录'}


def text(value, label, limit=4000):
    if not isinstance(value, str) or len(value) > limit or '\x00' in value:
        raise ValueError(f'{label}格式不正确或过长')
    return value.strip()


def date(value, label):
    value = text(value, label, 10)
    if value:
        try:
            if dt.date.fromisoformat(value).isoformat() != value:
                raise ValueError()
        except ValueError:
            raise ValueError(f'{label}请使用有效的YYYY-MM-DD日期')
    return value


def url(value):
    value = text(value, '链接', 2000)
    if value:
        try:
            p = urlsplit(value)
            if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
                raise ValueError()
        except ValueError:
            raise ValueError('只接受不含账号密码的HTTP/HTTPS链接')
    return value


class Purchases:
    def __init__(self, store, vault):
        self.store, self.vault = store, Path(vault).resolve()
        with store.connect() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS purchases(
                id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
                created TEXT NOT NULL, updated TEXT NOT NULL, payload TEXT NOT NULL)''')

    def validate(self, value):
        if not isinstance(value, dict):
            raise ValueError('购买记录格式错误')
        record = {k: text(value.get(k, ''), label, limit) for k, label, limit in (
            ('title', '购买事项', 100), ('category', '类别', 40), ('budget', '预算', 200),
            ('needs', '需求与排除项', 5000), ('conclusion', '当前结论', 5000),
            ('wait_condition', '等待条件', 2000), ('questions', '待核实问题', 2000))}
        if not record['title']:
            raise ValueError('请填写购买事项')
        record['status'] = value.get('status', 'research')
        record['origin'] = value.get('origin', 'user')
        if not isinstance(record['status'], str) or not isinstance(record['origin'], str) or record['status'] not in STATUSES or record['origin'] not in ORIGINS:
            raise ValueError('请选择有效的状态与结论来源')
        record['review_date'] = date(value.get('review_date', ''), '回看日期')
        record['source_url'] = url(value.get('source_url', ''))
        note = text(value.get('source_note', ''), '知识库笔记', 500)
        if note:
            if '\\' in note or ':' in note or any(x in note.split('/') for x in ('', '.', '..')):
                raise ValueError('资料笔记请填写知识库相对路径，不接受绝对路径或上级目录')
            p = PurePosixPath(note)
            if p.is_absolute() or p.parts[0] not in ('处理文件', '输出文件') or p.suffix != '.md':
                raise ValueError('资料笔记须位于处理文件或输出文件，且为Markdown笔记')
            try:
                (self.vault/note).resolve().relative_to(self.vault)
            except ValueError:
                raise ValueError('资料笔记不在知识库内')
        record['source_note'] = note
        candidates = value.get('candidates', [])
        if not isinstance(candidates, list) or len(candidates) > 12:
            raise ValueError('最多保存12个候选')
        record['candidates'] = []
        for row in candidates:
            if not isinstance(row, dict):
                raise ValueError('候选格式错误')
            candidate = {k: text(row.get(k, ''), label, limit) for k, label, limit in (
                ('name', '候选名称', 160), ('price', '记录价格', 200),
                ('channel', '报价渠道', 200), ('notes', '候选备注', 2000))}
            candidate['checked_at'] = date(row.get('checked_at', ''), '核价日期')
            candidate['url'] = url(row.get('url', ''))
            if not candidate['name']:
                raise ValueError('请填写候选名称，或移除空白候选')
            record['candidates'].append(candidate)
        return record

    @staticmethod
    def unpack(row):
        return {**json.loads(row['payload']), **{k: row[k] for k in ('id', 'revision', 'created', 'updated')}}

    def snapshot(self):
        records = [self.unpack(row) for row in self.store.rows('SELECT * FROM purchases ORDER BY updated DESC,id')]
        return {'records': records, 'statuses': STATUSES, 'origins': ORIGINS}

    def get(self, ident):
        rows = self.store.rows('SELECT * FROM purchases WHERE id=?', (ident,))
        if not rows:
            raise ValueError('购买记录不存在')
        return self.unpack(rows[0])

    def save(self, payload):
        record = self.validate(payload.get('record'))
        ident = payload.get('id', '')
        if not isinstance(ident, str) or (ident and not re.fullmatch(r'[a-f0-9]{32}', ident)):
            raise ValueError('购买记录ID无效')
        now = dt.datetime.now().astimezone().isoformat(timespec='microseconds')
        revision = payload.get('revision')
        with self.store.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if ident:
                old = c.execute('SELECT * FROM purchases WHERE id=?', (ident,)).fetchone()
                if not old:
                    raise ValueError('购买记录不存在')
                if type(revision) is not int or revision != old['revision']:
                    raise ValueError('这项记录已被其他操作更新。你的填写仍保留，请关闭后重新打开核对，不会覆盖新内容')
                c.execute('UPDATE purchases SET payload=?,revision=revision+1,updated=? WHERE id=?',
                          (json.dumps(record, ensure_ascii=False), now, ident))
            else:
                ident = uuid.uuid4().hex
                c.execute('INSERT INTO purchases VALUES(?,?,?,?,?)',
                          (ident, 1, now, now, json.dumps(record, ensure_ascii=False)))
        return {'ok': True, 'record': self.get(ident)}

    def reference(self, ident):
        note = self.get(ident)['source_note']
        if not note:
            raise ValueError('这项记录尚未关联知识库笔记')
        path = (self.vault/note).resolve()
        try:
            rel = path.relative_to(self.vault)
        except ValueError:
            raise ValueError('资料笔记不在知识库内')
        if rel.parts[0] not in ('处理文件', '输出文件') or path.suffix != '.md' or not path.is_file():
            raise ValueError('关联笔记不存在，请核对路径；购买记录仍然保留')
        return rel.as_posix()
