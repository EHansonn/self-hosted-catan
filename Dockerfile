FROM node:26.8-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:26.8-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data STATIC_DIR=/app/dist/client APP_NAME=Crossroads
WORKDIR /app
RUN apk upgrade --no-cache \
    && rm -rf /opt/yarn-v1.22.22 /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir -p /app/data \
    && chown node:node /app/data
COPY --from=build --chown=node:node /app/dist/client ./dist/client
COPY --from=build --chown=node:node /app/dist/node/server.cjs ./dist/node/server.cjs
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--max-old-space-size=160", "dist/node/server.cjs"]
