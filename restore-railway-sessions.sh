#!/bin/bash
# restore-railway-sessions.sh
# Script to restore WhatsApp sessions and customer data to Railway

echo "WhatsApp RSVP Bot - Railway Restore"
echo "=================================="

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <backup_directory> <service_name>"
    echo "Example: $0 ./backup-sessions/railway_20250519_120000 ea-bot"
    exit 1
fi

BACKUP_DIR=$1
SERVICE_NAME=$2

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

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ Backup directory does not exist: $BACKUP_DIR"
    exit 1
fi

echo "Restoring data to Railway service '${SERVICE_NAME}' from '${BACKUP_DIR}'..."

# Check if we have a pre-packaged backup or need to create one
if [ -f "${BACKUP_DIR}/railway-backup.tar.gz" ]; then
    echo "Found pre-packaged backup file."
    BACKUP_TAR="${BACKUP_DIR}/railway-backup.tar.gz"
else
    echo "1. Creating backup tarball from directory..."
    BACKUP_TAR="/tmp/railway-restore-$(date '+%Y%m%d%H%M%S').tar.gz"
    tar -czf "$BACKUP_TAR" -C "$BACKUP_DIR" .
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create backup tarball"
        exit 1
    fi
fi

echo "2. Uploading backup to Railway..."
cat "$BACKUP_TAR" | railway run --service "${SERVICE_NAME}" "cat > /tmp/restore.tar.gz"

if [ $? -ne 0 ]; then
    echo "❌ Failed to upload backup to Railway"
    exit 1
fi

echo "3. Extracting backup on Railway..."
railway run --service "${SERVICE_NAME}" "mkdir -p /app/data /app/session /app/logs && tar -xzf /tmp/restore.tar.gz -C /app"

if [ $? -ne 0 ]; then
    echo "❌ Failed to extract backup on Railway"
    exit 1
fi

echo "4. Setting permissions..."
railway run --service "${SERVICE_NAME}" "chmod -R 777 /app/data /app/session /app/logs"

echo "5. Verifying restored data..."
railway run --service "${SERVICE_NAME}" "ls -la /app/data /app/session /app/logs"

echo "6. Restarting service to apply changes..."
railway service restart --service "${SERVICE_NAME}"

echo "✅ Restoration completed!"
echo ""
echo "Access your application at: https://${SERVICE_NAME}.railway.app"
echo "If needed, scan the QR code at: https://${SERVICE_NAME}.railway.app/qr"
echo "Access your admin dashboard at: https://${SERVICE_NAME}.railway.app/admin"
