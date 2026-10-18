"""Private measurements and explicit, user-requested knowledge-note imports."""
import datetime as dt
from decimal import Decimal, InvalidOperation
import re
import uuid


def note_measurements(text):
    """Only explicit dated table measurements; never frontmatter dates or goals."""
    from home import table_rows
    result = set()
    for cells in table_rows(text):
        if len(cells) < 2:
            continue
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', cells[0]):
            body = ' '.join(cells[:3])
        elif '体重' in cells[0]:
            body = re.split(r'上次|此前|历史', cells[1])[0]
        else:
            continue
        if re.search(r'目标|预计|预估|计划|估计|大约|左右|接近|不到|超过|约\s*\d', body):
            continue
        dates = re.findall(r'\d{4}-\d{2}-\d{2}', body)
        weights = re.findall(r'(?<![\w.,+~\-])(\d+(?:\.\d+)?)\s*(kg|公斤|千克|斤)\b', body, re.I)
        if len(dates) != 1 or len(weights) != 1:
            continue
        try:
            day = dt.date.fromisoformat(dates[0])
            grams = Decimal(weights[0][0]) * (500 if weights[0][1] == '斤' else 1000)
            if day > dt.date.today() or not 1000 <= grams <= 500000 or grams != grams.to_integral_value():
                continue
        except ValueError:
            continue
        result.add((day.isoformat(), int(grams)))
    return sorted(result)


class Health:
    def __init__(self, store, homepage=None):
        self.store = store
        self.homepage = homepage
        with store.connect() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS weight_records(
                id TEXT PRIMARY KEY, day TEXT NOT NULL, grams INTEGER NOT NULL,
                revision INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL)''')
            # Retain import receipts after manual edits/deletion: refresh must not resurrect them.
            c.execute('''CREATE TABLE IF NOT EXISTS weight_imports(
                id TEXT PRIMARY KEY, source TEXT NOT NULL, day TEXT NOT NULL,
                grams INTEGER NOT NULL, UNIQUE(source,day,grams))''')

    def snapshot(self):
        return dict(records=self.store.rows('''SELECT w.*, COALESCE(i.source,'') AS source
            FROM weight_records w LEFT JOIN weight_imports i ON i.id=w.id ORDER BY w.day,w.created,w.id'''))

    def sync(self):
        if self.homepage is None:
            raise ValueError('尚未绑定知识库体重来源')
        key = self.homepage.config().get('health_source', 'profile')
        source = self.homepage.reference(key)
        path = self.homepage.path(source)
        try:
            if path.stat().st_size > 1_000_000:
                raise ValueError('体重来源过大，请选择更小的权威笔记')
            measurements = note_measurements(path.read_text(encoding='utf-8-sig'))
        except (OSError, UnicodeError) as e:
            raise ValueError('知识库体重来源读取失败；已有记录保留') from e
        if not measurements:
            raise ValueError('来源中未找到明确日期和单位的实测体重；未使用笔记更新时间或目标体重')
        added, existing, conflicts = 0, 0, []
        now = dt.datetime.now().astimezone().isoformat(timespec='microseconds')
        with self.store.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            for day in sorted({day for day, _ in measurements}):
                values = sorted({grams for date, grams in measurements if date == day})
                rows = c.execute('SELECT grams FROM weight_records WHERE day=?', (day,)).fetchall()
                current = sorted({row['grams'] for row in rows})
                if len(values) != 1 or (current and current != values):
                    conflicts.append(dict(day=day, incoming=values, existing=current))
                    continue
                grams = values[0]
                receipt = c.execute('SELECT id FROM weight_imports WHERE source=? AND day=? AND grams=?', (source, day, grams)).fetchone()
                if current or receipt:
                    existing += 1
                    continue
                ident = str(uuid.uuid4())
                c.execute('INSERT INTO weight_records VALUES(?,?,?,1,?,?)', (ident, day, grams, now, now))
                c.execute('INSERT INTO weight_imports VALUES(?,?,?,?)', (ident, source, day, grams))
                added += 1
        return dict(ok=True, added=added, existing=existing, conflicts=conflicts, source=source)

    def save(self, data):
        day = data.get('day')
        try:
            if not isinstance(day, str) or dt.date.fromisoformat(day).isoformat() != day:
                raise ValueError()
            if dt.date.fromisoformat(day) > dt.date.today():
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError('请填写有效的测量日期，不能晚于今天')
        unit = data.get('unit')
        if unit not in ('kg', 'jin'):
            raise ValueError('请选择公斤或斤')
        try:
            if isinstance(data.get('value'), bool):
                raise ValueError()
            value = Decimal(str(data.get('value')))
            grams = value * (1000 if unit == 'kg' else 500)
            if not grams.is_finite() or grams != grams.to_integral_value() or not 1000 <= grams <= 500000:
                raise ValueError()
        except (ValueError, InvalidOperation, TypeError):
            raise ValueError('请填写有效体重（公斤精确到0.001，斤精确到0.002）')
        ident = data.get('id', '')
        if not isinstance(ident, str):
            raise ValueError('记录标识无效')
        now = dt.datetime.now().astimezone().isoformat(timespec='microseconds')
        with self.store.connect() as c:
            if ident:
                row = c.execute('SELECT revision FROM weight_records WHERE id=?', (ident,)).fetchone()
                if not row or type(data.get('revision')) is not int or row['revision'] != data['revision']:
                    raise ValueError('记录已变化或删除，请刷新后再修改')
                updated = c.execute('UPDATE weight_records SET day=?,grams=?,revision=revision+1,updated=? WHERE id=? AND revision=?',
                                    (day, int(grams), now, ident, data['revision']))
                if updated.rowcount != 1:
                    raise ValueError('记录已变化，请刷新后再修改')
            else:
                ident = str(uuid.uuid4())
                c.execute('INSERT INTO weight_records VALUES(?,?,?,1,?,?)', (ident, day, int(grams), now, now))
        return dict(ok=True, id=ident)

    def delete(self, data):
        if not isinstance(data.get('id'), str) or type(data.get('revision')) is not int:
            raise ValueError('请选择有效的记录')
        with self.store.connect() as c:
            result = c.execute('DELETE FROM weight_records WHERE id=? AND revision=?', (data['id'], data['revision']))
            if result.rowcount != 1:
                raise ValueError('记录已变化或删除，请刷新后再操作')
        return dict(ok=True)
