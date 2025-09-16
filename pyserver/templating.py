import re

_ph_re = re.compile(r"{{\s*([a-zA-Z0-9_.]+)\s*}}")

def render_template(tpl: str, data: dict) -> str:
    if not isinstance(tpl, str):
        return ""
    if not isinstance(data, dict):
        data = {}
    def repl(m):
        k = m.group(1)
        v = data.get(k)
        return "" if v is None else str(v)
    return _ph_re.sub(repl, tpl)

def normalize_html(html: str) -> str:
    if not isinstance(html, str):
        return ""
    out = html
    out = re.sub(r"<p>\s*</p>", "", out, flags=re.I)
    out = re.sub(r"<p>(?:&nbsp;|\s)+</p>", "", out, flags=re.I)
    out = re.sub(r"(<br\s*/?>\s*){2,}", "<br>", out, flags=re.I)
    out = re.sub(r">\s+<", "><", out)
    return out

def extract_highlighted_placeholders(html: str):
    if not isinstance(html, str):
        return {"html": "", "vars": [], "defaults": {}}
    idx = 1
    defaults = {}
    vars_ = []
    def to_safe_var(text: str, i: int) -> str:
        if not text:
            return f"field_{i}"
        s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
        return s or f"field_{i}"
    pattern = re.compile(r"<([a-zA-Z0-9]+)([^>]*style\s*=\s*\"(?:[^\"]*?\\bbackground(?:-color)?\s*:\s*(?:yellow|#?ffff00)[^\"]*)\")[^>]*>([\s\S]*?)</\\1>", re.I)
    def _replace(m):
        nonlocal idx
        inner = m.group(3) or ""
        text = re.sub(r"<[^>]+>", "", inner).strip()
        key = to_safe_var(text, idx)
        idx += 1
        if key not in vars_:
            vars_.append(key)
        if defaults.get(key) is None:
            defaults[key] = text or ""
        return f"{{{{{key}}}}}"
    out = pattern.sub(_replace, html)
    return {"html": out, "vars": vars_, "defaults": defaults}

