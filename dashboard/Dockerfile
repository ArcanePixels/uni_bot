FROM node:22-slim AS builder

WORKDIR /app

# Quellcode VOR dem Install kopieren. Wuerde npm ci zuerst laufen, entstuende
# node_modules/@allrounder/shared aus der Lock-Datei allein - ohne die
# tatsaechlichen Dateien und Exports, und der Build faende
# "@allrounder/shared/settings-schema" nicht.
COPY package.json package-lock.json ./
COPY shared/ ./shared/
COPY bot/package.json ./bot/
COPY api/package.json ./api/
COPY dashboard/ ./dashboard/

RUN npm ci --workspace @allrounder/dashboard --include-workspace-root

# Der Build braucht die Variablen nur formal - die echten Werte kommen zur
# Laufzeit aus der .env, nicht ins Image.
ENV NEXT_TELEMETRY_DISABLED=1

# Einen etwaig mitkopierten Build-Zwischenspeicher wegraeumen. Turbopacks
# Zwischenspeicher ist plattformspezifisch; stammt er aus einer Windows-
# Umgebung, bricht der Build hier mit "Restore failures / Invalid block type"
# ab. Die .dockerignore haelt ihn normalerweise draussen - das hier ist die
# zweite Absicherung, falls doch mal einer durchrutscht.
RUN rm -rf dashboard/.next dashboard/.next-* dashboard/.turbo && \
    cd dashboard && \
    AUTH_SECRET=build-placeholder \
    DISCORD_CLIENT_ID=build \
    DISCORD_CLIENT_SECRET=build \
    npm run build

# --- Laufzeit-Image -------------------------------------------------------
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

# "standalone" bringt nur die tatsaechlich benutzten Module mit.
COPY --from=builder /app/dashboard/.next/standalone ./
COPY --from=builder /app/dashboard/.next/static ./dashboard/.next/static
COPY --from=builder /app/dashboard/public ./dashboard/public

# Nicht als root laufen lassen.
USER node

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "dashboard/server.js"]
