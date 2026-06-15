# Security Policy

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
security advisory feature for this repository and include:

- The affected route, component, or dependency
- Reproduction steps
- Expected and actual impact
- Any suggested mitigation

Secrets, access tokens, customer data, and production logs must not be included
in public issues, pull requests, screenshots, or commits.

## Supported Version

Security fixes are applied to the latest commit on `main` while FlowDesk is in
active development.

## Deployment Requirements

- Run production with `DEBUG=false`.
- Use a random `SECRET_KEY` of at least 32 characters.
- Restrict `ALLOWED_ORIGINS` and `ALLOWED_HOSTS`.
- Store provider keys only in deployment secret managers.
- Apply Alembic migrations before serving traffic.
- Verify Lemon Squeezy webhook signatures.
