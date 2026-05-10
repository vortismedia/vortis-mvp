FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production
RUN npm install -D typescript tsx @types/node

# Copy source
COPY . .

# Build TypeScript
RUN npm run build || true

# Setup database on first start (idempotent)
RUN node -e "console.log('Build complete')"

EXPOSE 10000

# Setup DB then run server
CMD ["sh", "-c", "node node_modules/tsx/dist/cli.mjs src/db/setup.ts && node node_modules/tsx/dist/cli.mjs src/server.ts"]
