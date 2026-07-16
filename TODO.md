# TODO

- [x] Locate and confirm CORS configuration and whether it can cause observed issues.
- [x] Identify the actual cause of `/api-keys` 403: CSRF middleware.
- [ ] Implement CSRF token flow so frontend includes required CSRF fields/headers for POST/PATCH/DELETE.
  - Add a CSRF token endpoint on the backend (or reuse existing one if present).
  - Update frontend to fetch CSRF token and include it in `postJson()` requests to protected routes.
- [ ] Re-run frontend/backend and verify API key creation works.

