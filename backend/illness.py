"""Local, user-entered illness history. No diagnosis or inferred health facts."""
import datetime as dt
import uuid


class Illness:
    def __init__(self, store):
        self.store = store
        with store.connect() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS illness_records(
                id TEXT PRIMARY KEY, day TEXT NOT NULL, symptoms TEXT NOT NULL,
                content TEXT NOT NULL, revision INTEGER NOT NULL,
                created TEXT NOT NULL, updated TEXT NOT NULL)''')

    def snapshot(self):
        return dict(records=self.store.rows(
            'SELECT * FROM illness_records ORDER BY day DESC,created DESC,id'))

    def save(self, data):
        day = data.get('day')
        try:
            if not isinstance(day, str) or dt.date.fromisoformat(day).isoformat() != day or dt.date.fromisoformat(day) > dt.date.today():
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError('请填写有效的生病日期，不能晚于今天')
        symptoms, content = data.get('symptoms'), data.get('content', '')
        if not isinstance(symptoms, str) or not symptoms.strip() or len(symptoms) > 300:
            raise ValueError('请填写症状，不超过300字')
        if not isinstance(content, str) or len(content) > 10000:
            raise ValueError('补充内容不能超过10000字')
        ident = data.get('id', '')
        if not isinstance(ident, str):
            raise ValueError('记录标识无效')
        now = dt.datetime.now().astimezone().isoformat(timespec='microseconds')
        with self.store.connect() as c:
            if ident:
                if type(data.get('revision')) is not int:
                    raise ValueError('请刷新后再修改')
                result = c.execute('''UPDATE illness_records SET day=?,symptoms=?,content=?,
                    revision=revision+1,updated=? WHERE id=? AND revision=?''',
                    (day, symptoms.strip(), content.strip(), now, ident, data['revision']))
                if result.rowcount != 1:
                    raise ValueError('记录已变化或删除，请刷新后再修改')
            else:
                ident = str(uuid.uuid4())
                c.execute('INSERT INTO illness_records VALUES(?,?,?,?,1,?,?)',
                          (ident, day, symptoms.strip(), content.strip(), now, now))
        return dict(ok=True, id=ident)

    def delete(self, data):
        if not isinstance(data.get('id'), str) or type(data.get('revision')) is not int:
            raise ValueError('请选择有效的记录')
        with self.store.connect() as c:
            result = c.execute('DELETE FROM illness_records WHERE id=? AND revision=?',
                               (data['id'], data['revision']))
            if result.rowcount != 1:
                raise ValueError('记录已变化或删除，请刷新后再操作')
        return dict(ok=True)
