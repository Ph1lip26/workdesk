"""Manual private measurements. No inferred diagnosis or imported personal data."""
import datetime as dt
from decimal import Decimal, InvalidOperation
import uuid


class Health:
    def __init__(self, store):
        self.store = store
        with store.connect() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS weight_records(
                id TEXT PRIMARY KEY, day TEXT NOT NULL, grams INTEGER NOT NULL,
                revision INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL)''')

    def snapshot(self):
        return dict(records=self.store.rows('SELECT * FROM weight_records ORDER BY day,created,id'))

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
