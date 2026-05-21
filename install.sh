#!/bin/bash

# Control Hub - Linux Setup Script

echo "=========================================="
echo "    Control Hub - Docker Setup Script     "
echo "=========================================="
echo ""

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo "[!] Docker is not installed. Please install Docker and Docker Compose first."
    exit 1
fi

echo "Please configure your server settings:"
echo "------------------------------------------"

read -p "Public Port (default: 8000): " PORT
PORT=${PORT:-8000}

read -p "Agent Secret Token (default: secure-company-token-123): " AGENT_TOKEN
AGENT_TOKEN=${AGENT_TOKEN:-secure-company-token-123}

read -p "Admin Username (default: admin): " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

read -p "Admin Password (default: admin): " ADMIN_PASS
ADMIN_PASS=${ADMIN_PASS:-admin}

echo ""
echo "Generating .env file..."

cat <<EOF > .env
PORT=$PORT
AGENT_TOKEN=$AGENT_TOKEN
ADMIN_USER=$ADMIN_USER
ADMIN_PASS=$ADMIN_PASS
EOF

echo "Done."
echo ""
echo "Starting Docker containers..."
echo "This might take a few minutes as it compiles the Go and Node.js environments."

if docker compose version &> /dev/null; then
    docker compose up -d --build
else
    docker-compose up -d --build
fi

echo ""
echo "=========================================="
echo " Setup Complete!"
echo " Control Hub is running on port: $PORT"
echo "=========================================="
