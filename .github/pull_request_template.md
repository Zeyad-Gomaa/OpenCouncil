## What this changes

<!-- What behaviour is different after this PR, and why. -->

## How it was verified

<!-- Commands you ran, or the manual path you exercised. -->

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run build`

## Checklist

- [ ] Inbound payloads are validated with a zod schema
- [ ] No provider API key can reach the API response, logs, or a config export
- [ ] Tests cover the new behaviour
- [ ] Committed build output (`apps/server/dist/`, `packages/shared/dist/`) is
      regenerated if this change affects it
- [ ] `CHANGELOG.md` updated under "Unreleased" if user-facing
