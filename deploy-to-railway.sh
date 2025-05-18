#!/bin/bash
# deploy-to-railway.sh
# Script to deploy the WhatsApp RSVP Bot to Railway with volume persistence

echo "WhatsApp RSVP Bot - Railway Deployment"
echo "====================================="

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <service_name> [version_tag]"
    echo "Example: $0 ea-bot latest"
    exit 1
fi

SERVICE_NAME=$1
VERSION_TAG=${2:-latest}

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

# Ensure we're in the right directory
BOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BOT_DIR"

echo "1. Building Docker image..."
docker build -t "${SERVICE_NAME}:${VERSION_TAG}" .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed. Please check the errors above."
    exit 1
fi

echo "✅ Docker image built: ${SERVICE_NAME}:${VERSION_TAG}"

echo "2. Backing up current session and data (if any)..."

# Create backup directories
BACKUP_DIR="./backup-sessions/railway_$(date '+%Y%m%d_%H%M%S')"
mkdir -p "$BACKUP_DIR"

# Try to download current data from Railway
echo "Downloading current session data..."
railway run --service "${SERVICE_NAME}" "tar -czf /tmp/railway-backup.tar.gz -C /app data session logs 2>/dev/null || echo 'No data to backup'" 2>/dev/null
railway run --service "${SERVICE_NAME}" "cat /tmp/railway-backup.tar.gz 2>/dev/null" > "${BACKUP_DIR}/railway-backup.tar.gz" 2>/dev/null

# Check if backup was successful
if [ -s "${BACKUP_DIR}/railway-backup.tar.gz" ]; then
    echo "✅ Backup saved to ${BACKUP_DIR}"
    tar -xzf "${BACKUP_DIR}/railway-backup.tar.gz" -C "${BACKUP_DIR}"
else
    echo "ℹ️ No existing data found on Railway or unable to download"
fi

echo "3. Pushing Docker image to Railway..."
railway service deploy --image "${SERVICE_NAME}:${VERSION_TAG}" --service "${SERVICE_NAME}"

if [ $? -ne 0 ]; then
    echo "❌ Railway deployment failed. Please check the errors above."
    exit 1
fi

echo "✅ Deployment to Railway successful!"

echo "4. Verifying volume mounts..."
railway run --service "${SERVICE_NAME}" "ls -la /app/data /app/session /app/logs" 2>/dev/null

echo ""
echo "✅ Deployment completed!"
echo ""
echo "Important next steps:"
echo "1. Ensure volumes are correctly mounted in Railway dashboard:"
echo "   - /app/session (for WhatsApp session)"
echo "   - /app/data (for customer data and credentials)"
echo "   - /app/logs (for application logs)"
echo ""
echo "2. Visit https://${SERVICE_NAME}.railway.app/qr to scan the WhatsApp QR code"
echo "   (only necessary if you're setting up a new session)"
echo ""
echo "3. Access your admin dashboard at: https://${SERVICE_NAME}.railway.app/admin"
echo ""
echo "If you need to restore a previous session, run:"
echo "./restore-railway-sessions.sh ${BACKUP_DIR} ${SERVICE_NAME}"
