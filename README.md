# WhatsApp Event RSVP Bot

## Overview

A WhatsApp-based bot for managing RSVPs for events. The bot sends invitations to guests via WhatsApp, collects responses, and updates attendance information in a Google Sheet.

![WhatsApp RSVP Bot](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExODA2MjIxNDEzZjM3OThhMzE3MjJjZDYyM2FhNTgxYjZjOGIzZGFjNiZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/3oEduQX8l9Fp8rVbYQ/giphy.gif)

## Deployment Status

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/yigalbot)

## Features

- **WhatsApp Integration**: Send and receive messages via WhatsApp
- **Interactive RSVP**: Collect responses using interactive buttons
- **Google Sheets Integration**: Track guest responses in a spreadsheet
- **Automatic Scheduling**: Send RSVP messages on a schedule
- **Admin Commands**: Manage the bot via WhatsApp commands
- **Real-time Dashboard**: View guest responses in a beautiful web interface
- **Multilingual Support**: Supports Hebrew and English messages
- **Test Mode**: Test functionality without sending actual messages

## Prerequisites

- Node.js (v14 or later)
- WhatsApp account
- Google Account with Google Sheets
- Google Apps Script project for API integration

## Installation

### Local Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/event-rsvp-bot.git
cd event-rsvp-bot
```

### Railway.app Deployment

The bot can be easily deployed to Railway.app with the following steps:

1. Fork this repository to your GitHub account
2. Click the "Deploy on Railway" button above
3. Connect your GitHub account and select your forked repository
4. Configure the following environment variables:
   - `NODE_ENV=production`
   - `PORT=8080`
   - `SESSION_PATH=/app/session` (CRITICAL for persistent sessions)
   - `APPS_SCRIPT_URL=https://script.google.com/macros/s/your-script-id/exec`
   - `SECRET_KEY=your_secret_key_here`
   - `ADMIN_NUMBERS=+972123456789` (comma-separated list of admin phone numbers)
   - `MESSAGE_SCHEDULE=0 9-20 * * *` (cron schedule for sending messages)
   - `DASHBOARD_PASSWORD=admin` (password for dashboard access)
   - `DASHBOARD_TOKEN=your-secure-token` (for API authentication)
5. Configure a persistent volume on Railway:
   - Go to your Railway project
   - Select your service and click on the "Variables" tab
   - Look for the "Volumes" section and create a volume mounted at `/app/session`
   - This is CRITICAL for your WhatsApp session to persist between deployments
6. Deploy the application
7. **Important**: Visit your Railway deployment URL to scan the QR code with WhatsApp
   - Go to `https://your-railway-url.railway.app/qr`
   - Scan with your WhatsApp app (Settings > Linked Devices > Link a Device)
   - You only need to do this once if the volume is properly configured

#### Railway Deployment Scripts

Use these scripts to manage and preserve your WhatsApp sessions on Railway:

1. **Deploy to Railway with session preservation**:
   ```bash
   ./deploy-to-railway.sh ea-bot v1.0.0
   ```
   This will back up your session before deploying and provide instructions to restore if needed.

2. **Backup sessions from Railway**:
   ```bash
   ./backup-railway-sessions.sh ea-bot
   ```
   This creates a local backup of your WhatsApp session files.

3. **Restore sessions to Railway**:
   ```bash
   ./restore-railway-sessions.sh backup-sessions/railway_20230615_120000 ea-bot
   ```
   Use this to restore your sessions after a deployment or if sessions are lost.

### Docker Deployment

You can run the bot using Docker for easier deployment and maintenance:

1. **Prerequisites:**
   - Docker and Docker Compose installed on your server
   - `.env` file configured with your settings (see Configuration section)

2. **Using Docker Compose (recommended):**
   ```bash
   # Build and run using docker-compose
   docker-compose up -d
   
   # View logs
   docker-compose logs -f
   
   # Stop the bot
   docker-compose down
   ```

3. **Manual Docker deployment:**
   ```bash
   # Build the Docker image
   docker build -t ea-bot .
   
   # Run the container
   docker run -d --name ea-bot \
     -p 3000:3000 \
     -v $(pwd)/session:/session \
     -v $(pwd)/logs:/app/logs \
     -v $(pwd)/.env:/app/.env:ro \
     -e NODE_ENV=production \
     ea-bot
   
   # Check logs
   docker logs -f ea-bot
   ```

4. **Access the QR code:**
   - Open `http://your-server-ip:3000/qr` in your browser
   - Scan with WhatsApp to connect your bot

5. **Health monitoring:**
   - The bot includes a health endpoint at `http://your-server-ip:3000/health`
   - Docker will automatically monitor this endpoint and restart the container if needed

### Session Backup & Recovery

The WhatsApp session data is the most critical component to back up before upgrades or redeployments. Without this data, you'll need to re-scan the QR code each time.

#### Backing Up Session Data

1. **For Railway.app deployments:**
   ```bash
   # Using Railway CLI
   railway service volumes download --service your-service-name --output ~/whatsapp-backups

   # Or use the Railway dashboard:
   # 1. Go to your project and select the service
   # 2. Click on "Volumes"
   # 3. Click "Download" to get your session data
   ```

2. **For Docker deployments:**
   ```bash
   # Copy the entire session directory to a backup location
   cp -r /path/to/session ~/whatsapp-backups/session-$(date +%Y%m%d)
   
   # Or create a compressed archive
   tar -czf ~/whatsapp-backups/session-$(date +%Y%m%d).tar.gz /path/to/session
   ```

#### Restoring Session Data

1. **For Railway.app deployments:**
   ```bash
   # Using Railway CLI
   railway service volumes upload --service your-service-name --path ~/whatsapp-backups
   
   # Or use the Railway dashboard:
   # 1. Go to your project and select the service
   # 2. Click on "Volumes"
   # 3. Click "Upload" to restore your session data
   ```

2. **For Docker deployments:**
   ```bash
   # Stop the container first
   docker stop ea-bot
   
   # Restore the session files
   cp -r ~/whatsapp-backups/session-backup/* /path/to/session/
   
   # Restart the container
   docker start ea-bot
   ```

#### Volumes Configuration

Make sure your volume is mounted to the path specified in the Dockerfile:

- **Railway.app**: The mount path should be `/app/session` to match the `SESSION_PATH` environment variable
- **Docker**: Your volume mount should match the path in `docker-compose.yml` or your `docker run` command

#### Verifying Mount Path

If you're experiencing issues with persistent connections, verify that:

1. The volume is mounted correctly
2. The volume path matches the `SESSION_PATH` environment variable
3. The session files include `creds.json` and various key files

## Configuration

### 1. Google Sheets and Apps Script

1. Create a Google Sheet with the following columns:
- Name
- Phone
- Email (optional)
- Status
- GuestCount
- Notes
- LastContacted

2. Create a Google Apps Script project with the following endpoints:
- `get_guests`: Fetch the guest list
- `update_status`: Update a guest's status
- `get_event_details`: Get event information

3. Deploy the Apps Script as a web app and copy the URL to your `.env` file

### 2. Running the Bot

1. Start the bot:
npm start


2. Scan the QR code with your WhatsApp to authenticate

3. The bot is now ready to receive commands and send messages

## Usage

### Admin Commands

Send these commands via WhatsApp message to the bot's number:

- `!sendrsvp` - Send RSVP messages to pending guests
- `!status` - Show current bot status and event details
- `!reload` - Reload guest list from Google Sheets
- `!debugapi` - Test API connection to Google Apps Script
- `!test` - Send a test RSVP message (development only)
- `!clearcache` - Clear the contacted guests cache
- `!sendrsvpforce` - Send RSVP to all guests, ignoring cache
- `!eventdate` - Show event date and messaging schedule

### Guest Dashboard

The bot includes a beautiful web dashboard for tracking guest RSVPs and event information:

#### Access the Dashboard

- **Local**: Visit `http://localhost:3000/dashboard`
- **Railway.app**: Visit `https://your-service-domain.railway.app/dashboard`
- **Docker**: Visit `http://your-server-ip:3000/dashboard`

#### Dashboard Features

- **Real-time Guest Tracking**: View confirmed, declined, and pending guests
- **Event Statistics**: See total expected attendees and response rate
- **Guest Search**: Quickly find specific guests by name or phone number
- **Status Filtering**: Filter guests by their RSVP status
- **Event Information**: View event details, location, and time
- **Automatic Updates**: Dashboard refreshes automatically every minute
- **Mobile Responsive**: Works on desktop and mobile devices

![Dashboard](https://i.ibb.co/K9b16bK/event-dashboard-mockup.png)
*Event RSVP Dashboard*

### Utility Scripts

The bot includes several utility scripts for monitoring and maintenance:

- **health-check.js**: Checks if the bot is running properly and can restart it if needed
  - Run with: `npm run health`
  - Can be scheduled on Railway.app to run periodically
  
- **connection-monitor.js**: More detailed connection monitoring for diagnostics
  - Run with: `npm run monitor`
  - Logs comprehensive connection details
  
- **bot-wrapper.js**: Launches the bot with automatic restart on crash
  - Run with: `npm run wrapper`
  - Best for local deployments where you want continuous uptime
  
- **check-deps.sh**: Verifies required dependencies are installed
  - Run with: `npm run check`
  - Automatically installed before the bot starts

### Guest Interaction

Guests will receive a message with buttons to respond:
1. "Yes, I'll attend" / "כן, אני מגיע/ה"
2. "No, I can't attend" / "לא אוכל להגיע"

If they respond "Yes", they'll be asked how many people will attend.

## Automatic Scheduling

- The bot sends messages hourly between 9 AM and 8 PM (configurable)
- Only guests with "Pending" status who haven't been contacted will receive messages
- The contact cache is reset daily at 1 AM

## Customization

### Language

The bot supports both Hebrew and English. To change the language of messages, modify the text in these sections:
- `buttonMessage` objects
- Response handling sections

### Message Schedule

Change the `MESSAGE_SCHEDULE` environment variable using cron syntax to modify when messages are sent.

## Troubleshooting

### Common Issues

1. **Connection Problems**: If the bot disconnects, restart it and scan the QR code again
2. **Message Not Sending**: Use `!clearcache` to reset the contacted guests list
3. **API Errors**: Check your Google Apps Script deployment settings and permissions

### Debug Commands

- `!debugapi`: Test the connection to Google Sheets API
- `!debug`: Show your current user information and check if you're in the guest list

Basic Command: npm run start

This command simply starts your WhatsApp RSVP bot normally:

    Initializes the WhatsApp connection
    Sets up the scheduled messaging system
    Starts the web server
    Waits for admin commands via WhatsApp

When you run this command, the bot will start and wait for you to scan the QR code to connect your WhatsApp account. It will not automatically send any messages until:

    The scheduled time occurs (based on your cron settings)
    You manually send an admin command like !sendrsvp

With Test Flag: npm run start -- --test-message

This command starts your bot with an additional flag --test-message which triggers special behavior:
JavaScript

const shouldSendTestMessage = args.includes('--test-message');

When this flag is detected, your bot will:

    Start normally with all the regular functionality
    ADDITIONALLY, after a 5-second delay, automatically send a test RSVP message to the admin number specified in your environment variables

The test message is sent here (starting at line ~1345):
JavaScript

// Send test message if requested via command line
if (shouldSendTestMessage && waClient.user) {
  log.info('Command line flag detected: Sending test RSVP message...');
  setTimeout(async () => {
    try {
      // Get admin number
      const adminPhone = process.env.ADMIN_NUMBERS?.split(',')[0];
      if (!adminPhone) {
        log.warn('No admin phone number found in .env file to send test message');
        return;
      }
      
      // Get event details
      const eventDetails = await appScriptManager.getEventDetails();
      
      // Send a test RSVP message to admin
      // ...send message code...
      
      log.info(`Sent test RSVP message to admin (${adminPhone})`);
    } catch (error) {
      log.error('Error sending test message:', error);
    }
  }, 5000); // Wait 5 seconds for connection to establish
}

When to Use Each Command

    Use npm run start for normal, day-to-day operation of your bot
    Use npm run start -- --test-message when:
        Setting up the bot for the first time to verify connections work
        After making changes, to test if the message formatting is correct
        When troubleshooting to confirm the bot can properly send messages

The --test-message flag is especially useful for quickly testing your setup without having to manually send the !test command via WhatsApp after the bot starts.


Event Message Reminder Strategy
Your WhatsApp RSVP bot uses a time-based event proximity strategy to determine when to send messages to guests. The bot sends different types of reminders at specific time intervals before the event. Here's how the strategy works:

Message Schedule Timeline
The bot sends messages at these key intervals:

Initial Invitation (28-30 days before)

First announcement about the event
Sent to all guests with pending status
Contains full event details and RSVP request
First Reminder (14 days before)

Sent exactly 2 weeks before the event
Only sent to non-respondents (guests who haven't confirmed or declined)
Gentle reminder about the upcoming event
Second Reminder (7 days before)

Sent exactly 1 week before the event
More urgent tone for non-respondents
Emphasizes the event is approaching soon
Final Reminder (2-3 days before)

Last reminder sent 2-3 days before the event
Sent to both confirmed guests (as a courtesy) and non-respondents
Most urgent tone, final chance to respond
Implementation Details
The scheduling logic is implemented in eventScheduler.js with these key functions:

calculateDaysRemaining() - Calculates days until the event
shouldSendMessagesToday() - Determines if messages should be sent based on event proximity
filterGuestsByEventProximity() - Filters guest list based on event date
getMessageByProximity() - Provides customized messages based on days remaining
The behavior is controlled by the EVENT_DATE parameter in your .env file:
EVENT_DATE=2025-06-15

How to Check Current Status
You can use the !eventdate admin command in WhatsApp to check:

The current event date
Days remaining until the event
Which messaging phase you're currently in
The full scheduling strategy
Custom Message Content
Each phase has customized message content in Hebrew:

Initial Invitation: "אתם מוזמנים ל[event name]!"
First Reminder: "אנו מזכירים לכם את ההזמנה ל[event name]"
Second Reminder: "בעוד שבוע יתקיים [event name]"
Final Reminder: "בעוד [X] ימים יתקיים [event name]. זוהי תזכורת אחרונה"
Since today's date is May 17, 2025, and your event is on June 15, 2025 (29 days away), you're currently in the "Initial invitation" phase.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Uses [Baileys](https://github.com/adiwajshing/Baileys) for WhatsApp integration
- Built with Node.js and Express

This README provides comprehensive documentation for your WhatsApp Event RSVP Bot. It includes:

    Overview and features
    Installation instructions
    Setup steps for Google Sheets integration
    Usage instructions with admin commands
    Guest interaction workflow
    Automatic scheduling explanation
    Customization options, especially for languages
    Troubleshooting tips

