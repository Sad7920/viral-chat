# Lumen Ledger support chat

A minimal AI customer support chat. This repository currently runs the API shell, the client shell, MongoDB, and CI.

## Stack

Node 26, Express 5, Mongoose, Zod, Vite, React, and TypeScript. MongoDB runs in Docker Compose for offline use.

## Offline setup

Install the Node major in `.nvmrc` (`nvm use`). From the repository root:

```sh
docker compose up --build
```

The client is at http://localhost:5173 and the server is at http://localhost:4000. Compose Mongo is `mongodb://mongo:27017/lumen`.

Compose loads `server/.env.example`, then `server/.env` when that file exists. A gitignored `server/.env` can point `MONGODB_URI` at Atlas. On Colima, the Vite dev server polls for file changes so a Mac bind mount still refreshes the browser.

## Environment

`server/.env.example` lists every server variable, with one comment each. `JWT_SECRET` must be at least 32 characters. The example placeholder is refused when `NODE_ENV=production`.

`client/.env.example` documents `VITE_PROXY_TARGET` (default `http://localhost:4000`). Compose sets it to `http://server:4000` so the dev server proxies `/auth`, `/chat`, `/persona`, and `/models`.

## Seed

Development only. From a running Compose stack:

```sh
docker compose exec server npm run seed
```

This recreates `demo@lumen.test` with password `demo-pass-dev-only`. The script refuses to run when `NODE_ENV=production`.

## Checks

In `server/`: `npm run lint`, `npm run format:check`, and `npm test`.

In `client/`: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`, and `npm run build`.

GitHub Actions runs those jobs, plus a production image build with no push, on pull requests and on pushes to `main`.
