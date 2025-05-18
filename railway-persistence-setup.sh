#!/bin/bash
# railway-persistence-setup.sh
# Script to properly configure persistence for Railway deployment

echo "WhatsApp RSVP Bot - Railway Persistence Setup"
echo "============================================"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not installed. Please install it first:"
    echo "npm install -g @railway/cli"
    exit 1
fi

# Check if logged in to Railway
railway whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Not logged in to Railway. Please login first:"
    echo "railway login"
    exit 1
fi

# Get the project name
echo "Enter your Railway project name (e.g., ea-bot):"
read PROJECT_NAME

# Get the service name
echo "Enter your Railway service name (e.g., ea-bot):"
read SERVICE_NAME

echo "Setting up persistence for service '${SERVICE_NAME}' in project '${PROJECT_NAME}'..."

# Prepare local directories for backup and restore
mkdir -p ./data ./session ./logs

echo "1. Downloading existing data from Railway (if any)..."
railway run --service "${SERVICE_NAME}" "tar -czf /tmp/data-backup.tar.gz -C /app data session logs 2>/dev/null || echo 'No data to backup'"
railway run --service "${SERVICE_NAME}" "cat /tmp/data-backup.tar.gz 2>/dev/null" > ./railway-data-backup.tar.gz

# Check if we got any data
if [ -s ./railway-data-backup.tar.gz ]; then
    echo "✅ Downloaded existing data from Railway"
    echo "Extracting backup..."
    tar -xzf ./railway-data-backup.tar.gz
    echo "✅ Extracted existing data"
else
    echo "ℹ️ No existing data found on Railway or unable to download"
    # Initialize empty files for customers and credentials if they don't exist
    if [ ! -f "./data/customers.json" ]; then
        echo "[]" > ./data/customers.json
    fi
    if [ ! -f "./data/credentials.json" ]; then
        echo "{}" > ./data/credentials.json
    fi
fi

echo "2. Ensuring Railway volumes are correctly mounted..."
echo "⚠️ You will need to manually configure volumes in Railway dashboard:"
echo ""
echo "Go to https://railway.app/project/${PROJECT_NAME}/service/${SERVICE_NAME}"
echo "Navigate to Variables tab → Scroll to Volumes section"
echo ""
echo "Add these three volume mounts:"
echo "1. /app/session → For WhatsApp session data"
echo "2. /app/data → For customer and credentials data"
echo "3. /app/logs → For application logs"
echo ""

read -p "Have you configured these volumes in Railway dashboard? (y/n) " VOLUMES_CONFIRMED
if [ "$VOLUMES_CONFIRMED" != "y" ]; then
    echo "Please configure the volumes first, then run this script again."
    exit 1
fi

echo "3. Uploading data to Railway volumes..."
# Create tar of data to upload
tar -czf ./railway-data-upload.tar.gz ./data ./session ./logs

# Upload and extract on Railway
cat ./railway-data-upload.tar.gz | railway run --service "${SERVICE_NAME}" "cat > /tmp/data-upload.tar.gz && mkdir -p /app/data /app/session /app/logs && tar -xzf /tmp/data-upload.tar.gz -C /app --strip-components=1"

echo "4. Verifying data on Railway..."
railway run --service "${SERVICE_NAME}" "ls -la /app/data /app/session /app/logs"

echo "5. Setting correct permissions..."
railway run --service "${SERVICE_NAME}" "chmod -R 777 /app/data /app/session /app/logs"

echo "✅ Railway persistence setup complete!"
echo ""
echo "IMPORTANT: After deploying your application, you may need to restart it:"
echo "railway service restart --service ${SERVICE_NAME}"
echo ""
echo "If you need to scan the QR code again, visit:"
echo "https://${SERVICE_NAME}.railway.app/qr"
echo ""
echo "To access your admin dashboard:"
echo "https://${SERVICE_NAME}.railway.app/admin"
