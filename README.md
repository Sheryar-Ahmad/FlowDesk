# FlowDesk

FlowDesk is a unified developer workspace for saving code, writing notes, planning tasks, using AI help, comparing code, focusing work sessions, and running small-to-medium programs from one app.

## Features

- Snippets: save, tag, search, copy, import, and export reusable code.
- Notes: rich developer notes with templates, formatting tools, and AI summaries.
- Tasks: project-based Kanban boards with priorities, due dates, edits, and delete actions.
- AI Assistant: chat sessions, auto titles, rename support, provider fallbacks, and Pro limits.
- Focus Timer: Pomodoro-style focus tracking and daily session stats.
- Code Diff: side-by-side code comparison with mobile-friendly controls.
- Compiler: run Python, JavaScript, Java, C, and C++ through the backend runtime, plus HTML/CSS preview.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL / Supabase |
| Auth | Email/password, Google OAuth |
| Payments | Lemon Squeezy |
| Deployment | Vercel frontend, Render Docker backend |

## Local Development

Prerequisites:

- Python 3.12+
- Node.js 20+
- PostgreSQL-compatible database
- GCC/G++, Java, and Node on the backend machine for local compiler execution

```bash
git clone https://github.com/Sheryar-Ahmad/FlowDesk.git
cd FlowDesk
```

Backend:

```bash
cd backend
python -m venv ../.venv
../.venv/Scripts/python -m pip install -r requirements.txt
../.venv/Scripts/python -m uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Production Notes

- Keep secrets in platform environment variables, never in frontend code.
- Deploy the backend with the Dockerfile so Python, Node, Java, GCC, and G++ are available.
- Set `DATABASE_URL`, OAuth, AI provider, Lemon Squeezy, and allowed-origin variables before launch.
- Public compiler execution is intentionally limited by code size, stdin size, output size, timeout, and daily quota.

## Verification

```bash
cd frontend && npm run lint && npm run build
cd backend && ../.venv/Scripts/python -m pytest -q
```

## License

MIT License. See [LICENSE](LICENSE).
