FROM node:26.9.0-alpine3.24@sha256:dbaa92e5758cbbcf85d65d5403fdb530fe3442cbe8c6dbfb7ef23365450d5070 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build \
    && mkdir -p /app/runtime-data

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data STATIC_DIR=/app/dist/client APP_NAME=Crossroads
WORKDIR /app
COPY --from=build --chown=65532:65532 /app/runtime-data ./data
COPY --from=build --chown=65532:65532 /app/dist/client ./dist/client
COPY --from=build --chown=65532:65532 /app/dist/node/server.cjs ./dist/node/server.cjs
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["--max-old-space-size=160", "dist/node/server.cjs"]
