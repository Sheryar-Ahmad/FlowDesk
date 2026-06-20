# FlowDesk Deployment

The recommended low-cost production layout is:

- Cloudflare Pages for the Vite frontend
- Render for the FastAPI container
- Supabase Postgres
- Groq, Mistral, or Gemini for AI
- Resend for transactional email
- Lemon Squeezy for subscriptions

## 1. Database

Use your Supabase Postgres connection string as `DATABASE_URL`. For Render's
free runtime, the safest Supabase option is usually the shared pooler session
mode URL on port `5432`, because it works on IPv4 and is meant for persistent
backend services. Transaction pooler URLs on port `6543` can work too; FlowDesk
automatically disables asyncpg prepared-statement caching for that mode.

Both `postgresql://` and `postgres://` prefixes are accepted. Supabase URLs are
opened with SSL automatically by the backend connector.

## 2. Backend

Create a Render Blueprint from `render.yaml`, then configure:

```text
DATABASE_URL
FRONTEND_URL
ALLOWED_ORIGINS
ALLOWED_HOSTS
GROQ_API_KEY
DEEPSEEK_API_KEY
MISTRAL_API_KEY
GEMINI_API_KEY
RESEND_API_KEY
FROM_EMAIL
LEMON_SQUEEZY_API_KEY
LEMON_SQUEEZY_WEBHOOK_SECRET
LEMON_SQUEEZY_STORE_ID
LEMON_SQUEEZY_VARIANT_ID
```

`ALLOWED_ORIGINS` must be JSON, for example:

```json
["https://flowdesk.pages.dev", "https://app.example.com"]
```

`ALLOWED_HOSTS` is also JSON and must include the API hostname:

```json
["flowdesk-api.onrender.com", "api.example.com"]
```

Keep `DEBUG=false`. Render supplies `PORT`; the container reads it
automatically.

## 3. Frontend

Create a Cloudflare Pages project with:

```text
Root directory: frontend
Build command: npm run build
Build output: dist
Node version: 22
```

Set `VITE_API_URL` to the public backend URL including `/api/v1`, such as:

```text
https://flowdesk-api.onrender.com/api/v1
```

The `_redirects` file keeps React Router routes working after refresh.

## 4. GitHub Deployment

Optional GitHub Actions deployment requires:

- Secret `RENDER_DEPLOY_HOOK_URL`
- Secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
- Repository variable `VITE_API_URL`

Without these values, the workflows still run verification and safely skip the
deployment step.

## 5. Payment Webhook

Configure Lemon Squeezy to send subscription events to:

```text
https://flowdesk-api.onrender.com/api/v1/payments/webhook
```

Start with `LEMON_SQUEEZY_TEST_MODE=true`. Switch it to `false` only after
checkout, renewal, cancellation, failed-payment, and expiry flows have been
verified.

## 6. Local Containers

From the repository root:

```bash
docker compose up --build
```

The frontend runs at `http://localhost:5173`, the API at
`http://localhost:8000`, and PostgreSQL at `localhost:5432`.
