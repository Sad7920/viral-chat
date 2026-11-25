FROM node:26-bookworm-slim AS dev-client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM node:26-bookworm-slim AS dev-server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
EXPOSE 4000
CMD ["npm", "run", "dev"]

FROM node:26-bookworm-slim AS build-client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Production image. Stays last and runs as non-root. CI publishes this target.
FROM node:26-bookworm-slim AS prod
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=build-client /app/client/dist /app/client/dist
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/index.js"]
