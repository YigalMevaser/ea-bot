# Railway Single Volume Management Guide

This guide explains how to properly configure and manage a single persistent volume in Railway for the WhatsApp RSVP Bot, ensuring both WhatsApp session and customer data persist across deployments.

## Railway Volume Structure

The bot is configured to use a single persistent volume in Railway:

- `/app/persistent` - The main persistent volume that contains:
  - `/app/persistent/session` - WhatsApp session data (keeps you logged in)
  - `/app/persistent/data` - Customer information and credentials
  - `/app/persistent/logs` - Application logs

## Setting Up the Volume in Railway

1. Go to your Railway project dashboard
2. Select your service
3. Go to the "Variables" tab
4. Scroll down to the "Volumes" section
5. Add a single volume:
   - Click "Add Volume"
   - Enter the mount path `/app/persistent`
   - Click "Add"
6. Set these environment variables:
   - `NODE_ENV=production`
   - `RAILWAY_VOLUME_MOUNT=true`
   - `SESSION_PATH=/app/persistent/session`

## How It Works

The system has been designed to automatically handle the single volume configuration:

1. On container startup, the `fix-railway-volume.sh` script runs automatically
2. It detects if `/app/persistent` exists or if `RAILWAY_VOLUME_MOUNT=true`
3. It creates the proper subdirectories and symbolic links
4. Session data and customer data are stored in the persistent volume

### Deployment

To deploy to Railway:

1. Build your Docker image locally:
   ```bash
   docker build -t ea-bot:latest .
   ```

2. Deploy to Railway using your preferred method:
   - Using Railway CLI:
     ```bash
     railway up --service ea-bot --image ea-bot:latest
     ```
   - Or through Railway dashboard UI

3. After deployment, the container will automatically:
   - Set up the directory structure
   - Create symbolic links to maintain compatibility
   - Configure the SESSION_PATH correctly

### Creating Backups

To backup your data from Railway, you can run:

```bash
# Login to Railway CLI first
railway login

# Create a backup
railway run --service ea-bot "tar -czf /tmp/backup.tar.gz -C /app/persistent ."
railway run --service ea-bot "cat /tmp/backup.tar.gz" > railway-backup.tar.gz
```

## Restoring Backups

To restore your data to Railway:

```bash
# Upload backup to Railway
cat railway-backup.tar.gz | railway run --service ea-bot "cat > /tmp/backup.tar.gz && mkdir -p /app/persistent && tar -xzf /tmp/backup.tar.gz -C /app/persistent"

# Set permissions
railway run --service ea-bot "chmod -R 777 /app/persistent"

# Restart the service
railway service restart --service ea-bot
```

## Troubleshooting

If your data isn't persisting:

1. Verify the volume is correctly mounted at `/app/persistent`
2. Check the logs to see if the fix-railway-volume.sh script ran successfully
3. Verify directory structure and permissions:
   ```bash
   railway run --service ea-bot "ls -la /app/persistent"
   ```
4. Fix permissions if needed:
   ```bash
   railway run --service ea-bot "chmod -R 777 /app/persistent"
   ```
5. Check if your data exists:
   ```bash
   railway run --service ea-bot "cat /app/persistent/data/customers.json"
   ```
6. Verify symbolic links are correct:
   ```bash
   railway run --service ea-bot "ls -la /app/session /app/data /app/logs"
   ```

## Additional Tips

- Always backup your data before major changes
- Schedule regular backups to protect your data
- After any volume configuration change, restart the service
- If you need to debug, inspect the directory structure:
  ```bash
  railway run --service ea-bot "find /app -type d | sort"
  ```
