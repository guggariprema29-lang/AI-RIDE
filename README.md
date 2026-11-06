# AI Ride App

## Quick Start (Easiest Method)

Just double-click **`start_app.bat`** in the project folder! It will automatically:
1. Start PostgreSQL 17 database service.
2. Launch the FastAPI Backend on `http://127.0.0.1:8000`.
3. Launch the Frontend server on `http://127.0.0.1:8080`.
4. Open the app in your default browser.

---

## Run backend + frontend manually

### Terminal 1 — backend

```powershell
cd "C:\Users\Prema\OneDrive\Desktop\AI-RIDE\AI-RIDE\backend"
& "C:\Users\Prema\OneDrive\Desktop\AI-RIDE\.venv\Scripts\python.exe" -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

### Terminal 2 — frontend

```powershell
cd "C:\Users\Prema\OneDrive\Desktop\AI-RIDE\AI-RIDE\frontend"
python -m http.server 8080 --bind 127.0.0.1
```

---

## Browser URLs

- Frontend UI: `http://127.0.0.1:8080/`
- Backend API docs: `http://127.0.0.1:8000/docs`

> If you see `chrome-error://chromewebdata/`, close that tab and paste `http://127.0.0.1:8080/` directly into a new browser tab.
