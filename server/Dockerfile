FROM node:20-alpine

WORKDIR /app

# Install build tools for sqlite3 node module compilation if pre-built binaries are not available for alpine
RUN apk add --no-cache python3 make g++ 

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create directory for persistent data
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/database.sqlite
ENV PORT=8000

# The web panel static files should be mounted or copied to /web/dist
# But since this is a unified repo, let's assume we build the web panel outside 
# and copy it here, or we use a multi-stage build!
# Let's use a multi-stage build to compile the web panel too!
