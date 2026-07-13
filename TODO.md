# TODO - SentinelAI Phase 1 (fix demo/admin + integrate user-scoped gateway)

- [x] Step 1: Add Prisma seed script to create demo user (`demo@example.com` / `Password123!`) and an ADMIN user.
- [ ] Step 2: Wire seed into dev/start flow (or document how to run it).
- [ ] Step 2a: Add scripts/README instructions: `prisma db push` then `tsx prisma/seed.ts`.

- [ ] Step 3: Introduce a DB-backed store fallback mechanism.
- [ ] Step 4: Update `src/server/index.ts` request path to use async DB store methods (or implement sync-compatible wrappers).
- [ ] Step 5: Ensure dashboard snapshot filtering uses the same user-scoped data source.
- [ ] Step 6: Smoke test: register/login + chaos endpoints + basic gateway request with user-scoped API key.

