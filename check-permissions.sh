#!/bin/bash
# Railway permissions debug script

# This script helps diagnose permission issues in your Railway deployment
# Add this to your Railway project and run it through the Railway shell

echo "🔍 Checking directory permissions for WhatsApp RSVP Bot..."
echo

echo "1️⃣ Directory Existence Check"
echo "============================"
ls -la /app
echo

echo "2️⃣ Session Directory"
echo "============================"
ls -la /app/session
mkdir -p /app/session
chmod -R 777 /app/session
echo "Writing test file..."
if touch /app/session/test.txt && echo "Test" > /app/session/test.txt; then
  echo "✅ Successfully wrote to /app/session/test.txt"
  cat /app/session/test.txt
  rm /app/session/test.txt
else
  echo "❌ Failed to write to /app/session"
fi
echo

echo "3️⃣ Data Directory"
echo "============================"
ls -la /app/data
mkdir -p /app/data
chmod -R 777 /app/data
echo "Writing test file..."
if touch /app/data/test.txt && echo "Test" > /app/data/test.txt; then
  echo "✅ Successfully wrote to /app/data/test.txt"
  cat /app/data/test.txt
  rm /app/data/test.txt
else
  echo "❌ Failed to write to /app/data"
fi
echo

echo "4️⃣ Process Information"
echo "============================"
echo "Current user: $(whoami)"
echo "Process permissions:"
ps aux | grep node
echo

echo "5️⃣ Environment Variables"
echo "============================"
echo "NODE_ENV: $NODE_ENV"
echo "SESSION_PATH: $SESSION_PATH"
echo "PORT: $PORT"
echo

echo "🧪 Test Complete"
echo "If you're still having permission issues, check that your Railway configuration"
echo "has the correct mount paths and volume settings."
echo "Consider updating your session initialization code to handle permission errors gracefully."