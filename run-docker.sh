#!/bin/bash
# Run the Docker container with proper volume mounts

# Ensure directories exist locally
mkdir -p "$(pwd)/data" "$(pwd)/logs" "$(pwd)/session"

# Set permissions so Docker can write to them
chmod -R 777 "$(pwd)/data" "$(pwd)/logs" "$(pwd)/session"

# Stop and remove container if exists
if [ "$(docker ps -q -f name=ea-bot)" ]; then
    echo "🛑 Stopping existing container..."
    docker stop ea-bot
    docker rm ea-bot
fi

# Run the container
echo "🚀 Starting container..."
docker run -d \
  --name ea-bot \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/session:/app/session" \
  -e "NODE_ENV=production" \
  -e "SESSION_PATH=/app/session" \
  -e "ENCRYPTION_KEY=32CharacterSecureEncryptionKey123" \
  --restart unless-stopped \
  ea-bot:latest

echo "✅ Container started!"
echo "🔍 View logs with: docker logs -f ea-bot"
echo "🌐 Access dashboard at: http://localhost:3000/dashboard"