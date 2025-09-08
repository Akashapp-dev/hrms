import re
from typing import Dict

_var = re.compile(r"{{\s*([a-zA-Z0-9_\.]+)\s*}}")


def render_template(tpl: str, data: Dict) -> str:
    def get_value(path: str):
        cur = data
        for key in path.split('.'):
            if isinstance(cur, dict):
                cur = cur.get(key, '')
            else:
                return ''
        return '' if cur is None else str(cur)

    return _var.sub(lambda m: escape_html(get_value(m.group(1))), tpl)


def escape_html(s: str) -> str:
    return (
        s.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&#39;')
    )

