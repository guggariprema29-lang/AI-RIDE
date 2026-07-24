# AI Ride App

## Run backend + frontend

### Option 1: Open both in new PowerShell windows (one copy/paste)

Open a PowerShell window and paste this block exactly:

```powershell
cd "C:\Users\Prema\OneDrive\Desktop\AI-Ride-App"
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd backend; .\venv\Scripts\Activate.ps1; python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000"
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd frontend; python -m http.server 8080 --bind 127.0.0.1"
```

This will start:
- backend API server at `http://127.0.0.1:8000`
- frontend app at `http://127.0.0.1:8080`

---

### Option 2: Start manually in two terminals

#### Terminal 1 — backend

```powershell
cd "C:\Users\Prema\OneDrive\Desktop\AI-Ride-App\backend"
.\venv\Scripts\Activate.ps1
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

#### Terminal 2 — frontend

```powershell
cd "C:\Users\Prema\OneDrive\Desktop\AI-Ride-App\frontend"
python -m http.server 8080 --bind 127.0.0.1
```

---

## Browser URLs

- Frontend UI: `http://127.0.0.1:8080/`
- Backend API docs: `http://127.0.0.1:8000/docs`

> If you see `chrome-error://chromewebdata/`, close that tab and paste `http://127.0.0.1:8080/` directly into a new browser tab.

---

## Important terminal error fix

If you see this error:

```text
'.\venv\Scripts\python.exe' is not recognized as the name of a cmdlet
```

it means you are not inside the `backend` folder. Use the exact `cd` command above first.

---

## Notes

- Backend must run from `backend/` because the FastAPI app file is there.
- Frontend must run from `frontend/` to serve `index.html` correctly.
