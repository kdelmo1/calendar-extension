# How Cloud Run builds and runs our server (a "container image").
# Build locally to test:  docker build -t calendar-proxy .   (from the proxy/ folder)

# Node 22 on a small Linux image
FROM node:22-slim

WORKDIR /app

# Install only the packages the server needs (not dev tools like typescript)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the server code. The API key is NOT copied: Cloud Run gives it to the server
# as an environment variable from Secret Manager (see README "Deploy").
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
# Cloud Run sets PORT (8080); server.ts listens on it.
CMD ["node", "--import", "tsx", "src/server.ts"]
