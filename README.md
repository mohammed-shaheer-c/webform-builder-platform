# Webform Builder & Submission Platform

A scalable, extensible multi-tenant webform builder and high-throughput submission processing platform.

> **Note:** This repository represents the foundational boilerplate and architectural scaffold for the platform. Application tables, authentication, form schemas, and submission processing queues will be added in subsequent milestones.

---

## 🛠 Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite | Fast, responsive single-page application |
| **Backend** | Node.js, Express, TypeScript | Type-safe REST API server with strict typing |
| **Database ORM** | PostgreSQL, Prisma | Relational database modeling and queries (JSONB ready) |
| **Queue / Cache** | Redis (BullMQ ready) | High-performance asynchronous background job queue |
| **Containerization** | Docker, Docker Compose | Service orchestration for local dependencies |

---

## 📂 Repository Structure

```text
webform-platform/
├── apps/
│   ├── api/                     # Backend Express + TypeScript application
│   │   ├── src/
│   │   │   ├── config/          # Environment, Redis, and Prisma configurations
│   │   │   ├── middleware/      # Centralized error handling & 404 middleware
│   │   │   ├── routes/          # API route definitions (e.g. /api/health)
│   │   │   ├── app.ts           # Express application setup (Helmet, CORS, JSON limits)
│   │   │   └── server.ts        # HTTP server entrypoint with graceful shutdown
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                     # Frontend React + TypeScript + Vite application
│       ├── src/
│       │   ├── components/      # Reusable UI components (StatusCard)
│       │   ├── pages/           # Page views (HomePage)
│       │   ├── services/        # HTTP API services (/api/health client)
│       │   ├── types/           # Shared TypeScript interfaces
│       │   ├── App.tsx          # Root application component
│       │   ├── main.tsx         # React DOM mount point
│       │   └── index.css        # Modern design system & styles
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── prisma/
│   └── schema.prisma            # PostgreSQL datasource and Prisma client configuration
├── .env.example                 # Example environment variables template
├── .gitignore                   # Ignored files, dependencies, and build outputs
├── docker-compose.yml           # Redis container orchestration
├── package.json                 # Monorepo workspaces and orchestration scripts
└── README.md                    # Project documentation
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

The configuration variables:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | *(empty placeholder)* | PostgreSQL connection string (`postgresql://<user>:<password>@localhost:5432/<database>?schema=public`) |
| `PORT` | `5000` | Port for the Express API server |
| `CLIENT_URL` | `http://localhost:5173` | Allowed CORS origin for the Vite frontend |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |

> ⚠️ **Security Notice:** Do not commit `.env` with actual production secrets or credentials to Git. The `.gitignore` file is configured to exclude all `.env` files.

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js**: v18.x or v20.x+
- **npm**: v9.x or v10+
- **Docker & Docker Compose** (optional for local Redis container)

### 2. Install Dependencies

Install all dependencies across the monorepo workspaces:

```bash
npm install
```

Generate the Prisma client:

```bash
npm run prisma:generate
```

### 3. Start Redis

To run the local Redis service using Docker Compose:

```bash
docker compose up -d
```

To stop Redis:

```bash
docker compose down
```

### 4. Running the Applications

#### Run Frontend & Backend Simultaneously (Recommended)

```bash
npm run dev
```

This starts:
- **API Server**: [http://localhost:5000](http://localhost:5000)
- **Web Client**: [http://localhost:5173](http://localhost:5173)

#### Run Services Individually

- **API only**:
  ```bash
  npm run dev:api
  ```
- **Web only**:
  ```bash
  npm run dev:web
  ```

---

## 🩺 Health Check & Verification

### Backend Health Check

```bash
curl http://localhost:5000/api/health
```

Expected Response:
```json
{
  "status": "ok"
}
```

### Frontend Connectivity

Open [http://localhost:5173](http://localhost:5173) in your browser:
- The UI initializes with `Backend: Checking...`
- Upon fetching `/api/health`, the status badge updates to `Backend: Connected`

---

## 🧪 Available Scripts

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Runs both `api` and `web` in concurrent development mode |
| `npm run dev:api` | Runs the API server with auto-reloading (`tsx watch`) |
| `npm run dev:web` | Runs the Vite development server with HMR |
| `npm run build` | Compiles both backend and frontend applications |
| `npm run typecheck` | Validates TypeScript types across both `api` and `web` projects |
| `npm run prisma:generate` | Generates the Prisma client from `prisma/schema.prisma` |
