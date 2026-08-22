FROM node:22-slim

WORKDIR /app

# Quellcode VOR dem Install, damit die Workspace-Verknuepfung auf die echten
# Dateien zeigt und nicht auf einen aus der Lock-Datei erzeugten Platzhalter.
COPY package.json package-lock.json ./
COPY shared/ ./shared/
COPY api/ ./api/
COPY bot/package.json ./bot/

RUN npm ci --omit=dev --workspace @allrounder/api --include-workspace-root

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "api/src/index.js"]
