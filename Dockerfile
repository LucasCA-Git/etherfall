# ETHERFALL: builds the client + server and runs the online server (accounts saved in /data).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json vitest.config.ts ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm ci
COPY packages packages
COPY tools tools
RUN npm test && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/client/dist packages/client/dist
ENV PORT=8080 ETHERFALL_DATA=/data/accounts.json
VOLUME /data
EXPOSE 8080
CMD ["node", "packages/server/dist/server.mjs"]
