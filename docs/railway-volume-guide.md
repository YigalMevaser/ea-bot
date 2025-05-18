# Railway Volume Management Guide

This guide explains how to properly configure and manage volumes in Railway for the WhatsApp RSVP Bot, ensuring data persistence across deployments.

## Required Volumes

The bot requires three persistent volumes in Railway:

1. `/app/session` - For WhatsApp session data (keeps you logged in)
2. `/app/data` - For customer information and credentials
3. `/app/logs` - For application logs (optional but recommended)

## Setting Up Volumes in Railway

1. Go to your Railway project dashboard
2. Select your service
3. Go to the "Variables" tab
4. Scroll down to the "Volumes" section
5. Add each of the three volumes:
   - Click "Add Volume"
   - Enter the mount path (e.g., `/app/session`)
   - Click "Add"
   - Repeat for the other paths

## Deployment with Volume Persistence

Use the provided scripts to manage your deployments with proper volume handling:

### Initial Setup

If this is your first time configuring volumes:

```bash
./railway-persistence-setup.sh
```

This script will:
- Guide you through setting up volumes in Railway
- Initialize necessary data structures
- Ensure proper permissions

### Regular Deployment

When deploying a new version:

```bash
./deploy-to-railway.sh ea-bot latest
```

This script will:
- Build a Docker image with your changes
- Backup existing data from Railway
- Deploy the new image
- Verify volume mounts

### Backup and Restore

To backup your data:

```bash
./backup-railway-sessions.sh ea-bot
```

To restore from a backup:

```bash
./restore-railway-sessions.sh ./backup-sessions/railway_20250519_120000 ea-bot
```

## Troubleshooting

If your data isn't persisting:

1. Check that all three volumes are correctly mounted in Railway
2. Verify permissions with:
   ```bash
   railway run --service ea-bot "ls -la /app/data /app/session /app/logs"
   ```
3. Fix permissions if needed:
   ```bash
   railway run --service ea-bot "chmod -R 777 /app/data /app/session /app/logs"
   ```
4. Check if your data exists:
   ```bash
   railway run --service ea-bot "cat /app/data/customers.json"
   ```

## Additional Tips

- Always back up your data before major changes
- Schedule regular backups with cron jobs
- If data becomes corrupted, restore from the most recent backup
- After restoring, restart the service with `railway service restart --service ea-bot`
