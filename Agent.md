# Agent operating notes

Before every commit + push, the agent must run a self-test pass that covers:

- Mobile app portrait viewport: core page loads, Explore opens, recommendation list renders, and interactions do not freeze.
- Mobile app landscape viewport: Explore layout renders, recommendation list/map are usable, and interactions do not freeze.
- Desktop web viewport: core Explore flow renders, map/list layout is usable, and interactions do not freeze.
- The usual project checks, at minimum `npm run build` and `npm run lint`.

For mobile Explore lists, do not render large result sets all at once. Use incremental loading, viewport scoping, or virtualization-style limits so the app remains responsive on mobile Safari/Chrome.
