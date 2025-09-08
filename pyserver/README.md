Python API (FastAPI)

Run locally:

- python -m venv .venv && .venv/Scripts/activate (Windows) or source .venv/bin/activate (macOS/Linux)
- pip install -r requirements.txt
- set JWT_SECRET=change_me (Windows: $env:JWT_SECRET="change_me")
- uvicorn pyserver.app:app --reload --host 0.0.0.0 --port 8000

Configure frontend:

- In public/index.html add: <meta name="api-base" content="http://localhost:8000">

Deploy (Render):

- New Web Service → Python
- Build command: pip install -r pyserver/requirements.txt
- Start command: uvicorn pyserver.app:app --host 0.0.0.0 --port $PORT
- Env: JWT_SECRET, NODE_ENV=production, CORS_ORIGIN=https://<user>.github.io/<repo>

