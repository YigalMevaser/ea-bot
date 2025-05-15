# WhatsApp Event RSVP Bot

## Overview

A WhatsApp-based bot for managing RSVPs for events. The bot sends invitations to guests via WhatsApp, collects responses, and updates attendance information in a Google Sheet.

![WhatsApp RSVP Bot](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExODA2MjIxNDEzZjM3OThhMzE3MjJjZDYyM2FhNTgxYjZjOGIzZGFjNiZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/3oEduQX8l9Fp8rVbYQ/giphy.gif)

## Features

- **WhatsApp Integration**: Send and receive messages via WhatsApp
- **Interactive RSVP**: Collect responses using interactive buttons
- **Google Sheets Integration**: Track guest responses in a spreadsheet
- **Automatic Scheduling**: Send RSVP messages on a schedule
- **Admin Commands**: Manage the bot via WhatsApp commands
- **Multilingual Support**: Supports Hebrew and English messages
- **Test Mode**: Test functionality without sending actual messages

## Prerequisites

- Node.js (v14 or later)
- WhatsApp account
- Google Account with Google Sheets
- Google Apps Script project for API integration

## Installation

1. Clone the repository:
git clone https://github.com/yourusername/event-rsvp-bot.git cd event-rsvp-bot


2. Install dependencies:
npm install


3. Create a `.env` file in the project root with the following variables:
Environment

NODE_ENV=production PORT=3000
WhatsApp Configuration

ADMIN_NUMBERS=+972526901876,+972XXXXXXXXX
Google Apps Script

APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec SECRET_KEY=your_secret_key
Message Configuration

MESSAGE_SCHEDULE=0 9-20 * * * MESSAGE_BATCH_SIZE=10 MESSAGE_DELAY=8000


## Setup

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

