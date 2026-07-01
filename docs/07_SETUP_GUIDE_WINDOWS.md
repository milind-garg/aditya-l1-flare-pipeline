# Windows Setup Guide

## 1. Prerequisites to Install
1. **Python 3.11+** — download from python.org, during install check "Add python.exe to PATH".
2. **Node.js LTS (v20+)** — download from nodejs.org (includes `npm`).
3. **Git** — download from git-scm.com.
4. **VS Code** (recommended editor) with extensions: Python, Pylance, ESLint, Prettier.
5. **(Optional but recommended) Windows Terminal** for a nicer shell experience.
6. **(Optional)** Anaconda/Miniconda if you prefer conda environments over `venv` — instructions below use plain `venv` for simplicity.

## 2. Verify Installations (open PowerShell or Windows Terminal)
```powershell
python --version
node --version
npm --version
git --version
```
If `python` isn't recognized, reinstall Python and ensure "Add to PATH" was checked, or use `py` instead of `python`.

## 3. Create Project Folder & Git Repo
```powershell
mkdir aditya-l1-flare-pipeline
cd aditya-l1-flare-pipeline
git init
```

## 4. Python Environment Setup
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```
If you get an execution-policy error on `Activate.ps1`, run PowerShell as Administrator once and execute:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
then retry activation.

Install core Python packages:
```powershell
pip install --upgrade pip
pip install fastapi uvicorn[standard] pandas numpy scipy astropy spacepy cdflib scikit-learn xgboost matplotlib jupyter pyarrow sqlalchemy python-dotenv pydantic
```
(If `spacepy` fails to install on Windows — it has tricky native dependencies — skip it for now and use `cdflib` or `astropy` depending on which format SoLEXS/HEL1OS actually turn out to be; confirm format first per `01_DATA_UNDERSTANDING.md`.)

Freeze dependencies once stable:
```powershell
pip freeze > requirements.txt
```

## 5. Frontend Setup
```powershell
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install recharts axios
npm run dev
```
This starts the frontend dev server (default `http://localhost:5173`). Leave this terminal running during development.

## 6. Running the Backend (separate terminal)
```powershell
.\venv\Scripts\Activate.ps1
cd backend
uvicorn main:app --reload --port 8000
```
Backend will be at `http://localhost:8000`; FastAPI auto-docs available at `http://localhost:8000/docs` (very useful for testing endpoints without the frontend).

## 7. Recommended: Two Terminal Tabs Always Open
- Terminal 1: backend (`uvicorn ... --reload`)
- Terminal 2: frontend (`npm run dev`)
- Use a 3rd terminal for ad hoc scripts/notebooks (`jupyter lab` or run `.py` scripts in `src/`).

## 8. Folder Permissions / Antivirus Note
Windows Defender or antivirus can occasionally slow down `npm install` or flag large data file downloads from PRADAN — if downloads/installs hang, temporarily check Defender's real-time protection logs, not a security bypass, just diagnostic.

## 9. Common Windows Gotchas
| Issue | Fix |
|---|---|
| `python` not found | Use `py` instead, or fix PATH as above |
| PowerShell blocks venv activation script | Run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` once |
| Long file paths error on `pip install` | Enable long paths: `git config --system core.longpaths true`, and/or enable Win32 long path support in Group Policy/Registry |
| Port already in use (8000 or 5173) | `netstat -ano | findstr :8000` then `taskkill /PID <pid> /F` |
| `pip install xgboost` build errors | Use prebuilt wheel: `pip install xgboost --only-binary :all:` |

## 10. Quick End-to-End Smoke Test
1. Activate venv → `python -c "import pandas, fastapi, sklearn; print('ok')"`.
2. `uvicorn main:app --reload` → visit `http://localhost:8000/docs`, confirm it loads.
3. In `frontend/`, `npm run dev` → visit `http://localhost:5173`, confirm the default Vite page loads.
4. Now you're ready to start building per `08_VIBE_CODING_STEP_BY_STEP.md`.
