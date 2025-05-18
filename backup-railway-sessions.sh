#!/bin/bash
# backup-railway-sessions.sh
# Script to backup WhatsApp sessions and customer data from Railway

echo "WhatsApp RSVP Bot - Railway Backup"
echo "=================================="

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <service_name>"
    echo "Example: $0 ea-bot"
    exit 1
fi

SERVICE_NAME=$1

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

# Create backup directory
BACKUP_DIR="./backup-sessions/railway_$(date '+%Y%m%d_%H%M%S')"
mkdir -p "$BACKUP_DIR"

echo "Backing up data from Railway service '${SERVICE_NAME}'..."

# Create tar on Railway
echo "1. Creating backup archive on Railway..."
railway run --service "${SERVICE_NAME}" "tar -czf /tmp/railway-backup.tar.gz -C /app data session logs 2>/dev/null || echo 'No data to backup'"

# Download the tar file
echo "2. Downloading backup from Railway..."
railway run --service "${SERVICE_NAME}" "cat /tmp/railway-backup.tar.gz 2>/dev/null" > "${BACKUP_DIR}/railway-backup.tar.gz"

# Check if backup was successful
if [ -s "${BACKUP_DIR}/railway-backup.tar.gz" ]; then
    echo "3. Extracting backup..."
    tar -xzf "${BACKUP_DIR}/railway-backup.tar.gz" -C "${BACKUP_DIR}"
    
    echo "✅ Backup completed successfully!"
    echo "Backup location: ${BACKUP_DIR}"
    
    # Quick summary of backed up data
    echo ""
    echo "Backup contents summary:"
    
    # Check for session files
    if [ -d "${BACKUP_DIR}/session" ]; then
        SESSION_FILES=$(find "${BACKUP_DIR}/session" -type f | wc -l)
        echo "- Session files: ${SESSION_FILES}"
    else
        echo "- Session directory: Not found"
    fi
    
    # Check for customer data
    if [ -f "${BACKUP_DIR}/data/customers.json" ]; then
        CUSTOMERS_COUNT=$(grep -o '"phoneNumber"' "${BACKUP_DIR}/data/customers.json" | wc -l)
        echo "- Customer records: ${CUSTOMERS_COUNT}"
    else
        echo "- Customers data: Not found"
    fi
    
    # Check for credentials
    if [ -f "${BACKUP_DIR}/data/credentials.json" ]; then
        echo "- Credentials file: Present"
    else
        echo "- Credentials file: Not found"
    fi
    
    # Check for logs
    if [ -d "${BACKUP_DIR}/logs" ]; then
        LOG_FILES=$(find "${BACKUP_DIR}/logs" -type f | wc -l)
        echo "- Log files: ${LOG_FILES}"
    else
        echo "- Logs directory: Not found"
    fi
else
    echo "❌ Backup failed or no data found on Railway"
    echo "Please check if your service is running and volumes are mounted correctly"
    rm -rf "${BACKUP_DIR}"
fi
