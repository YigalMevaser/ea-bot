# Bot Monitoring and Health Check Guide

This document provides information on how to monitor and maintain the health of your WhatsApp RSVP Bot in production environments.

## Available Monitoring Tools

The bot comes with built-in health checks and monitoring tools:

1. **Health Check Endpoint** - `/health`
   - Available at `http://your-host:3000/health`
   - Returns status 200 if bot is healthy, 503 if unhealthy
   - JSON response includes connection status details

2. **Connection Monitor Script** - `connection-monitor.js`
   - Checks the health of the bot and logs the status
   - Can be run periodically to verify connection status
   - Run with: `npm run monitor`

3. **Health Check Script** - `health-check.js`
   - Checks bot health and can trigger restarts if needed
   - Compatible with both local and Railway.app deployments
   - Run with: `npm run health`

4. **Bot Wrapper Script** - `bot-wrapper.js`
   - Launches the bot and automatically restarts it if it crashes
   - Provides continuous uptime monitoring
   - Run with: `npm run wrapper`

## Railway.app Integration

When deploying on Railway.app, the following best practices are recommended:

### Error Logging

The bot logs all connection issues to the console, which Railway captures in its logs. Look for:

- "Heartbeat failed" messages - Indicates temporary connection issues
- "BOT_NEEDS_RESTART" messages - Indicates the bot needs to be restarted

### Scheduled Health Checks

You can set up a Railway cron job to periodically check the bot's health:

1. Create a new service in your project
2. Set the service to run: `npm run health`
3. Configure it to run every 5 minutes or as needed

### Handling Connection Issues

If you notice consistent connection problems:

1. Check the Railway logs for specific error messages
2. Use the admin commands `!status` or `!debugapi` to verify the bot's internal state
3. Try manually restarting the service if needed

## Protecting WhatsApp Session Data

### Before Taking Any Action

**Always back up your session data before performing any maintenance:**

```bash
# For Railway.app:
railway service volumes download --service your-bot-service --output ~/session-backup

# For local Docker:
docker cp ea-bot:/app/session ~/session-backup
```

### Critical Files to Protect

The most important files in your session directory are:
- `creds.json` - Contains the WhatsApp authentication credentials
- `app-state-sync-*.json` - Contains WhatsApp state information
- `session-*.json` - Contains session information for each chat

Losing these files will require re-scanning the QR code to reconnect.

### Volume Configuration

Make sure your session data is correctly persisted:

1. **In Railway.app:**
   - Mount path should be set to `/app/session`
   - This must match the `SESSION_PATH` environment variable (set to `/app/session`)
   - Create the volume through the Railway dashboard:
     - Go to your project
     - Select your service
     - Click on the "Variables" tab
     - Find the "Volumes" section
     - Create a volume mounted at `/app/session`
   - You can verify the volume is working by checking if files persist after a restart:
     ```bash
     # List files in the session directory
     railway run --service ea-bot "ls -la /app/session"
     
     # Restart the service
     railway service restart --service ea-bot
     
     # Verify files still exist
     railway run --service ea-bot "ls -la /app/session"
     ```

### Session Management with Railway

When deploying to Railway, follow these best practices to ensure session persistence:

1. **Before updating your bot:**
   - Always back up the session using the provided scripts:
     ```bash
     ./backup-railway-sessions.sh ea-bot
     ```

2. **To deploy a new version:**
   - Use the deployment script that includes session backup:
     ```bash
     ./deploy-to-railway.sh ea-bot latest
     ```
   - This will back up your session before deploying the new version

3. **If WhatsApp disconnects after deployment:**
   - Restore your most recent backup:
     ```bash
     # List your backups
     ls -la backup-sessions/
     
     # Restore the most recent backup
     ./restore-railway-sessions.sh backup-sessions/railway_YYYYMMDD_HHMMSS ea-bot
     ```

4. **Regular Preventative Backups:**
   - Schedule regular backups of your session data
   - Keep these backups in a secure location
   - Consider automating the backup process with a cron job

2. **In Docker:**
   - Your volume mounts should match your Docker configuration
   - Ensure write permissions on the mounted directory

### Restoring From Backup

If you need to restore session data:

```bash
# For Railway.app:
railway service volumes upload --service your-bot-service --path ~/session-backup

# For local Docker:
docker cp ~/session-backup/. ea-bot:/app/session/
docker restart ea-bot
```

## Common Issues and Solutions

### "waClient is not defined"

This error occurs when the bot tries to access the WhatsApp client before it's fully initialized. This has been fixed in the latest version by:

1. Using the proper client variable reference 
2. Adding additional error checking

### "Heartbeat failed"

These are typically transient connection issues and don't require action unless they persist. The bot includes automatic recovery mechanisms.

### WhatsApp Disconnections

If the bot frequently disconnects from WhatsApp:

1. Verify your WhatsApp account isn't logged in on too many devices
2. Check for any WhatsApp service disruptions
3. Consider adding a delay between messages if sending in high volume

## Monitoring Command Reference

```bash
# Check bot health and log status
npm run monitor

# Check health and auto-restart if needed
npm run health

# Run the bot with auto-restart on crash
npm run wrapper

# Verify dependencies and start bot
npm run restart
```

### Railway.app Specific Monitoring

For Railway deployments, you can set up scheduled jobs to run the health check script:

```bash
# Create a new service in Railway with this command
node health-check.js
```

Configure this service to run every 5-15 minutes to ensure your bot stays healthy.

For more advanced monitoring needs, consider integrating with external monitoring services like Uptime Robot or Prometheus.
