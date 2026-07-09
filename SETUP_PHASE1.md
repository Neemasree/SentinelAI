# Phase 1: Local Development Setup

## Prerequisites

### 1. PostgreSQL Setup (Windows)

**Option A: Direct Installation**
1. Download: https://www.postgresql.org/download/windows/
2. Install with default settings (admin: postgres / password: password)
3. Open pgAdmin or psql to create database:
   ```sql
   CREATE DATABASE sentinel_ai;
   ```

**Option B: Docker (Recommended)**
```powershell
docker run --name postgres_sentinel -e POSTGRES_PASSWORD=password -e POSTGRES_DB=sentinel_ai -p 5432:5432 -d postgres:16
```

### 2. Redis Setup (Windows)

**Option A: WSL**
```powershell
wsl
sudo apt-get update
sudo apt-get install redis-server
redis-server
```

**Option B: Docker (Recommended)**
```powershell
docker run --name redis_sentinel -p 6379:6379 -d redis:latest
```

### 3. Verify Connections

```powershell
# Test PostgreSQL (install psql client first)
psql -U postgres -d sentinel_ai -c "SELECT 1;"

# Test Redis
redis-cli ping
# Should return: PONG
```

---

## Running the App

### 1. Install Dependencies
```powershell
npm install
```

### 2. Set Up Database Schema
```powershell
# This will create tables from prisma/schema.prisma
npx prisma db push
```

### 3. (Optional) View Database with Prisma Studio
```powershell
npx prisma studio
```

### 4. Start Development
```powershell
npm run dev
```

This will:
- Push schema changes to database
- Start backend (port 4000)
- Start frontend (port 5173)

---

## API Endpoints (Phase 1)

### Authentication
- `POST /auth/register` - Create account
- `POST /auth/login` - Get JWT token
- `GET /auth/me` - Get current user (requires token)
- `PATCH /auth/me` - Update profile (requires token)
- `POST /auth/change-password` - Change password (requires token)

### API Keys (User-Scoped)
- `GET /api-keys/` - List user's API keys (requires token)
- `POST /api-keys/` - Create new API key (requires token)
- `GET /api-keys/:id` - Get key details (requires token)
- `PATCH /api-keys/:id` - Update key (requires token)
- `DELETE /api-keys/:id` - Delete key (requires token)

### Authorization Header
All protected endpoints require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Next Phase

- [ ] Update React app with login/register components
- [ ] Add client-side JWT token storage
- [ ] Update dashboard to show only user's APIs
- [ ] Integrate PostgreSQL with gateway rate limiting
- [ ] Use Redis for token buckets

---

## Troubleshooting

### "Cannot find module @prisma/client"
```powershell
npm install
npm install -g @prisma/cli
```

### "Failed to connect to PostgreSQL"
- Check DATABASE_URL in .env
- Ensure PostgreSQL service is running
- Test with: `psql -c "SELECT 1;"`

### "Cannot connect to Redis"
- Check REDIS_URL in .env
- Ensure Redis service is running
- Test with: `redis-cli ping`

### Prisma migration issues
```powershell
# Reset database (warning: deletes all data)
npx prisma migrate reset

# Or push schema changes
npx prisma db push
```
