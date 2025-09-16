import os
import time
from typing import Optional, Dict, Any

import bcrypt
import jwt
from fastapi import FastAPI, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db import init_db, list_items, add_item, update_item, remove_item, find_by_id
from .templating import render_template, normalize_html, extract_highlighted_placeholders


JWT_SECRET = os.getenv('JWT_SECRET', 'dev_secret_change_me')
TOKEN_NAME = 'hrms_token'
TOKEN_MAX_AGE = 60 * 60 * 8  # seconds

app = FastAPI()

# CORS
allow_origins = [o.strip() for o in os.getenv('CORS_ORIGIN', '').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()
    # seed admin if empty
    users = list_items('users')
    if not users:
        pw = bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode('utf-8')
        add_item('users', {
            'id': 'seed-admin',
            'username': 'admin',
            'name': 'Admin',
            'dept': '',
            'role': 'admin',
            'passwordHash': pw,
        })


def sign_token(user: Dict[str, Any]) -> str:
    payload = {"sub": user['id'], "username": user['username'], "role": user['role']}
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def set_auth_cookie(response: Response, token: str):
    is_prod = os.getenv('NODE_ENV') == 'production'
    response.set_cookie(
        key=TOKEN_NAME,
        value=token,
        httponly=True,
        samesite='none' if is_prod else 'lax',
        secure=is_prod,
        max_age=TOKEN_MAX_AGE,
        path='/',
    )


def current_user(request: Request) -> Optional[dict]:
    token = request.cookies.get(TOKEN_NAME)
    if not token:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            token = auth[len('Bearer '):]
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        users = list_items('users')
        full = next((u for u in users if u['id'] == payload['sub']), None)
        return full
    except Exception:
        return None


def require_auth(user=Depends(current_user)):
    if not user:
        raise HTTPException(status_code=401, detail='Unauthorized')
    return user


def require_role(role: str):
    def _inner(user=Depends(require_auth)):
        if user.get('role') != role:
            raise HTTPException(status_code=403, detail='Forbidden')
        return user
    return _inner


class LoginBody(BaseModel):
    username: str
    password: str


@app.post('/api/auth/login')
def login(body: LoginBody, response: Response):
    users = list_items('users')
    user = next((u for u in users if u['username'] == body.username), None)
    if not user:
        raise HTTPException(400, 'Invalid credentials')
    if not bcrypt.checkpw(body.password.encode('utf-8'), user['password_hash'].encode('utf-8')) and \
       not bcrypt.checkpw(body.password.encode('utf-8'), user.get('passwordHash', '').encode('utf-8')):
        raise HTTPException(400, 'Invalid credentials')
    updated = update_item('users', user['id'], {}) or user
    # unify field names
    updated['passwordHash'] = updated.get('passwordHash') or updated.get('password_hash')
    token = sign_token({
        'id': updated['id'],
        'username': updated['username'],
        'role': updated['role'],
    })
    set_auth_cookie(response, token)
    safe = {k: v for k, v in updated.items() if k not in ('passwordHash', 'password_hash')}
    return {"user": safe, "token": token}


@app.post('/api/auth/logout')
def logout(response: Response):
    response.delete_cookie(TOKEN_NAME, path='/')
    return {"ok": True}


@app.get('/api/me')
def me(user=Depends(current_user)):
    if not user:
        return {"user": None}
    safe = {k: v for k, v in user.items() if k not in ('passwordHash', 'password_hash')}
    return {"user": safe}


class CreateUserBody(BaseModel):
    username: str
    name: Optional[str] = None
    role: Optional[str] = 'editor'
    password: str


@app.post('/api/auth/users')
def create_user(body: CreateUserBody, _=Depends(require_role('admin'))):
    users = list_items('users')
    if any(u['username'] == body.username for u in users):
        raise HTTPException(400, 'Username taken')
    pw = bcrypt.hashpw(body.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user = add_item('users', {
        'username': body.username,
        'name': body.name or body.username,
        'role': body.role or 'editor',
        'dept': '',
        'passwordHash': pw,
    })
    safe = {k: v for k, v in user.items() if k not in ('passwordHash', 'password_hash')}
    return {"user": safe}


@app.get('/api/auth/users')
def list_users(_=Depends(require_role('admin'))):
    rows = list_items('users')
    users = []
    for u in rows:
        d = dict(u)
        d.pop('password_hash', None)
        d.pop('passwordHash', None)
        users.append(d)
    return {"users": users}


class UpdateUserBody(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


@app.put('/api/auth/users/{id}')
def update_user(id: str, body: UpdateUserBody, _=Depends(require_role('admin'))):
    db_users = list_items('users')
    target = next((u for u in db_users if u['id'] == id), None)
    if not target:
        raise HTTPException(404, 'User not found')
    if target['role'] == 'admin' and body.role and body.role != 'admin':
        admin_count = len([u for u in db_users if u['role'] == 'admin'])
        if admin_count <= 1:
            raise HTTPException(400, 'Cannot demote the last admin')
    changes: Dict[str, Any] = {}
    if body.name is not None:
        changes['name'] = body.name
    if body.role is not None:
        changes['role'] = body.role
    if body.password:
        changes['passwordHash'] = bcrypt.hashpw(body.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    updated = update_item('users', id, changes)
    if not updated:
        raise HTTPException(404, 'User not found')
    safe = {k: v for k, v in updated.items() if k not in ('passwordHash', 'password_hash')}
    return {"user": safe}


@app.delete('/api/auth/users/{id}')
def delete_user(id: str, user=Depends(require_role('admin'))):
    if user['id'] == id:
        raise HTTPException(400, 'Cannot delete yourself')
    db_users = list_items('users')
    target = next((u for u in db_users if u['id'] == id), None)
    if not target:
        raise HTTPException(404, 'User not found')
    if target['role'] == 'admin':
        admin_count = len([u for u in db_users if u['role'] == 'admin'])
        if admin_count <= 1:
            raise HTTPException(400, 'Cannot delete the last admin')
    ok = remove_item('users', id)
    if not ok:
        raise HTTPException(500, 'Delete failed')
    return {"ok": True}


# Templates
class TemplateBody(BaseModel):
    name: str
    content: str
    description: Optional[str] = ""


@app.get('/api/templates')
def list_templates(_=Depends(require_auth)):
    return {"items": list_items('templates')}


@app.post('/api/templates')
def create_template(body: TemplateBody, user=Depends(require_auth)):
    if user.get('role') == 'viewer':
        raise HTTPException(403, 'Forbidden')
    item = add_item('templates', body.model_dump())
    return {"item": item}


@app.put('/api/templates/{id}')
def update_template(id: str, body: TemplateBody, user=Depends(require_auth)):
    if user.get('role') == 'viewer':
        raise HTTPException(403, 'Forbidden')
    updated = update_item('templates', id, body.model_dump())
    if not updated:
        raise HTTPException(404, 'Not found')
    return {"item": updated}


@app.delete('/api/templates/{id}')
def delete_template(id: str, user=Depends(require_auth)):
    if user.get('role') == 'viewer':
        raise HTTPException(403, 'Forbidden')
    ok = remove_item('templates', id)
    if not ok:
        raise HTTPException(404, 'Not found')
    return {"ok": True}


@app.get('/api/templates/{id}')
def get_template(id: str, _=Depends(require_auth)):
    t = find_by_id('templates', id)
    if not t:
        raise HTTPException(404, 'Not found')
    return {"item": t}


@app.post('/api/templates/import')
def import_template(file: UploadFile = File(...), _=Depends(require_role('editor'))):
    import mammoth
    name = os.path.splitext(file.filename)[0] if file.filename else 'Imported Template'
    data = file.file.read()
    html = ''
    if (file.filename or '').lower().endswith('.docx'):
        result = mammoth.convert_to_html(data)
        html = result.value or ''
    else:
        html = data.decode('utf-8', errors='ignore')
    html = normalize_html(html)
    ph = extract_highlighted_placeholders(html)
    content = normalize_html(ph['html'])
    return {"name": name, "content": content, "vars": ph['vars'], "defaults": ph['defaults']}


# Documents
class RenderBody(BaseModel):
    templateId: Optional[str] = None
    content: Optional[str] = None
    data: Optional[dict] = None
    fileName: Optional[str] = None


@app.get('/api/documents')
def list_documents(_=Depends(require_auth)):
    return {"items": list_items('documents')}


@app.post('/api/documents')
def render_and_save(body: RenderBody, user=Depends(require_auth)):
    if user.get('role') == 'viewer':
        raise HTTPException(403, 'Forbidden')
    tpl = body.content
    if not tpl and body.templateId:
        t = find_by_id('templates', body.templateId)
        if not t:
            raise HTTPException(404, 'Template not found')
        tpl = t.get('content')
    if not tpl:
        raise HTTPException(400, 'templateId or content required')
    rendered = render_template(tpl, body.data or {})
    doc = add_item('documents', {
        'templateId': body.templateId or None,
        'content': tpl,
        'data': body.data or {},
        'rendered': rendered,
        'fileName': None,
    })
    return {"item": doc}


@app.post('/api/documents/pdf')
def generate_pdf(body: RenderBody, response: Response, _=Depends(require_auth)):
    from weasyprint import HTML
    tpl = body.content
    if not tpl and body.templateId:
        t = find_by_id('templates', body.templateId)
        if not t:
            raise HTTPException(404, 'Template not found')
        tpl = t.get('content')
    if not tpl:
        raise HTTPException(400, 'templateId or content required')
    rendered = render_template(tpl, body.data or {})
    preferred = (body.fileName or '').strip()
    doc = add_item('documents', {
        'templateId': body.templateId or None,
        'content': tpl,
        'data': body.data or {},
        'rendered': rendered,
        'fileName': preferred or None,
    })
    html = f"""<!doctype html><html><head><meta charset='utf-8'>
    <style>@page {{ size: A4; margin: 30mm 16mm 20mm 16mm; }} body {{ font-family: system-ui, Segoe UI, Roboto, Ubuntu, sans-serif; color: #111; line-height: 1.5; }} h1,h2,h3,strong {{ color: #000; }} p, li, div, td, th {{ text-align: justify; text-justify: inter-word; }} .page-break {{ page-break-before: always; break-before: page; }}</style>
    </head><body>{rendered}</body></html>"""
    pdf_bytes = HTML(string=html).write_pdf()
    response.headers['Content-Type'] = 'application/pdf'
    fname = doc.get('fileName') or f"document-{doc['id']}.pdf"
    response.headers['Content-Disposition'] = f'attachment; filename="{fname}"'
    return Response(content=pdf_bytes, media_type='application/pdf')


@app.get('/api/documents/{id}')
def get_document(id: str, _=Depends(require_auth)):
    doc = find_by_id('documents', id)
    if not doc:
        raise HTTPException(404, 'Not found')
    return {"item": doc}


@app.get('/api/documents/{id}/download')
def download_html(id: str, response: Response, _=Depends(require_auth)):
    doc = find_by_id('documents', id)
    if not doc:
        raise HTTPException(404, 'Not found')
    filename = f"document-{doc['id']}.html"
    html = f"<!doctype html><html><head><meta charset='utf-8'><title>{filename}</title></head><body>{doc.get('rendered','')}</body></html>"
    response.headers['Content-Disposition'] = f'attachment; filename={filename}'
    return Response(content=html, media_type='text/html; charset=utf-8')


@app.get('/api/documents/{id}/download-pdf')
def download_pdf(id: str, response: Response, _=Depends(require_auth)):
    from weasyprint import HTML
    doc = find_by_id('documents', id)
    if not doc:
        raise HTTPException(404, 'Not found')
    html = f"""<!doctype html><html><head><meta charset='utf-8'>
    <style>@page {{ size: A4; margin: 30mm 16mm 20mm 16mm; }} body {{ font-family: system-ui, Segoe UI, Roboto, Ubuntu, sans-serif; color: #111; line-height: 1.5; }} h1,h2,h3,strong {{ color: #000; }}</style>
    </head><body>{doc.get('rendered','')}</body></html>"""
    pdf_bytes = HTML(string=html).write_pdf()
    fname = doc.get('fileName') or f"document-{doc['id']}.pdf"
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'attachment; filename="{fname}"'
    return Response(content=pdf_bytes, media_type='application/pdf')

