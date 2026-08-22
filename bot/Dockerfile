# node:22-slim statt Alpine: better-sqlite3 braucht sonst eine komplette
# Build-Toolchain im Image (musl-Builds gibt es nicht als Prebuild).
FROM node:22-slim

WORKDIR /app

# Der Install laeuft ueber die Workspace-Wurzel, sonst bekommt "shared" seine
# eigenen Abhaengigkeiten nicht und der Start scheitert erst zur Laufzeit.
# Der Quellcode wird VOR dem Install kopiert, damit die Workspace-Verknuepfung
# auf die echten Dateien zeigt und nicht auf einen aus der Lock-Datei
# erzeugten Platzhalter.
COPY package.json package-lock.json ./
COPY shared/ ./shared/
COPY bot/ ./bot/
COPY api/package.json ./api/

RUN npm ci --omit=dev --workspace @allrounder/bot --include-workspace-root

ENV NODE_ENV=production
CMD ["node", "bot/src/index.js"]
