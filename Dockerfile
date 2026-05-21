# Stage 1: Build Web Panel (React)
FROM node:20-alpine AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2: Build Backend Server & Agent
FROM node:20-alpine
WORKDIR /app/server

# Install build tools for sqlite3 node module AND Go compiler for dynamic agent builds
RUN apk add --no-cache python3 make g++ go

# Configure Go for Windows cross-compilation
ENV GOOS=windows
ENV GOARCH=amd64

# Copy server code
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ .

# Copy agent code and cache Go modules
WORKDIR /app/agent
COPY agent/ .
RUN go mod download

# Reset workdir to server
WORKDIR /app/server

# Copy built web files from Stage 1
RUN mkdir -p /app/web/dist
COPY --from=web-builder /web/dist /app/web/dist

# Setup persistent data folder for SQLite
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/database.sqlite
ENV PORT=8000

EXPOSE 8000
CMD ["npm", "start"]
