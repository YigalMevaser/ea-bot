#!/bin/bash
# fix-railway-volume.sh - Script to create proper directory structure for single Railway volume

echo "Setting up single Railway volume directory structure..."
echo "===================================================="

# Create the main persistent directory
mkdir -p /app/persistent
mkdir -p /app/persistent/session
mkdir -p /app/persistent/data
mkdir -p /app/persistent/logs

# Ensure we're using the correct SESSION_PATH
echo "Setting SESSION_PATH to /app/persistent/session"
export SESSION_PATH=/app/persistent/session

# Copy existing data into the new structure (if it exists)
if [ -d "/app/session" ]; then
  echo "Copying session data..."
  cp -r /app/session/* /app/persistent/session/ 2>/dev/null || true
fi

if [ -d "/app/data" ]; then
  echo "Copying customer data..."
  cp -r /app/data/* /app/persistent/data/ 2>/dev/null || true
fi

if [ -d "/app/logs" ]; then
  echo "Copying logs..."
  cp -r /app/logs/* /app/persistent/logs/ 2>/dev/null || true
fi

# Create symbolic links to maintain compatibility with existing code
ln -sf /app/persistent/session /app/session
ln -sf /app/persistent/data /app/data
ln -sf /app/persistent/logs /app/logs

# Set proper permissions
chmod -R 777 /app/persistent

# Print debug info
echo "Directory structure:"
ls -la /app/persistent
ls -la /app/persistent/session
ls -la /app/persistent/data
ls -la /app/persistent/logs

echo "Symlinks:"
ls -la /app/session
ls -la /app/data
ls -la /app/logs

echo "Environment:"
echo "SESSION_PATH=$SESSION_PATH"
echo "NODE_ENV=$NODE_ENV"

echo "✅ Single volume directory structure set up successfully!"
echo "All data will now be stored under /app/persistent"
echo "You can access the admin dashboard at: https://your-app.railway.app/admin"
