# AI Career Copilot Monorepo

This monorepo contains the frontend and backend for **AI Career Copilot**, a platform for personalized, AI-powered career roadmaps.

## Structure

- `frontend/` – React (Vite) + Tailwind CSS client
- `backend/` – Node.js (Express) API with OpenAI, PostgreSQL (Prisma), and JWT auth

## Quick Start

From the repo root (`ResumeScanner`):

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (in a separate terminal)
cd ../frontend
npm install
npm run dev
```

Ensure you create a `.env` file in `backend/` with at least:

```bash
OPENAI_API_KEY=your_openai_api_key_here
JWT_SECRET=your_strong_jwt_secret_here
DATABASE_URL=postgresql://user:password@localhost:5432/ai_career_copilot
CLIENT_ORIGIN=http://localhost:5173
PORT=4000
```
