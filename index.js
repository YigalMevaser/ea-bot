/*─────────────────────────────────────────
  Event RSVP Bot - Family Event Attendance Tracker  
──────────────────────────────────────────*/
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import readline from 'readline';
import crypto from 'crypto';
import axios from 'axios';
import cron from 'node-cron';
import express from 'express';
import qrcode from 'qrcode';
import { calculateDaysRemaining, filterGuestsByEventProximity, getMessageByProximity } from './utils/eventScheduler.js';

// Import all Baileys functions via dynamic import to handle ES Module vs CommonJS compatibility
import * as baileysImport from '@nstar/baileys';
const { 
    prepareWAMessageMedia, 
    removeAuthState,
    fetchLatestBaileysVersion, 
    generateWAMessageFromContent, 
    generateWAMessageContent, 
    generateWAMessage,
    relayWAMessage, 
    generateMessageTag,
    getAggregateVotesInPollMessage, 
    downloadContentFromMessage, 
    fetchLatestWaWebVersion, 
    InteractiveMessage, 
    generateForwardMessageContent, 
    MessageRetryMap 
} = baileysImport; // Using GataNina-Li's fork

// Import FileType via dynamic import
import * as fileTypeImport from 'file-type';
const FileType = fileTypeImport.default || fileTypeImport;

const args = process.argv.slice(2);
const shouldSendTestMessage = args.includes('--test-message');
// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to import config, create if doesn't exist
let configImported = false;
try {
  await import('./settings/config.js');
  configImported = true;
} catch (error) {
  console.log('Config file not found, using default settings.');
  
  // Create config directory if it doesn't exist
  const configDir = path.join(__dirname, 'settings');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  // Create a basic config file
  const configContent = `
/*─────────────────────────────────────────
  Event RSVP Bot Configuration
──────────────────────────────────────────*/
import fs from 'fs';
import { fileURLToPath } from 'url';

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);

// Event RSVP Bot configuration
global.eventConfig = {
    name: "Family Event RSVP Bot",
    version: "1.0.0",
    description: "WhatsApp bot for managing event RSVPs"
}

// Watch for file changes
const file = fileURLToPath(import.meta.url);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log('\\x1b[0;32m' + file + ' \\x1b[1;32mupdated!\\x1b[0m');
  process.exit(0); // Restart the app when config changes
});
`;
  
  fs.writeFileSync(path.join(configDir, 'config.js'), configContent);
  await import('./settings/config.js');
}

// Import Baileys library
import makeWASocketDefault, { 
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore,
  jidDecode, 
  proto,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers
} from '@nstar/baileys';

// Handle makeWASocket not being a function
const makeWASocket = makeWASocketDefault.default || makeWASocketDefault;

// Import helper modules
import { color } from './lib/color.js';
import { smsg, sleep, getBuffer } from './lib/myfunction.js';

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error('Uncaught Exception:', err);
});

console.clear();
console.log('Starting Event RSVP Bot...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

// Initialize the application

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Setup logging
const logFile = path.join(logDir, `bot-${new Date().toISOString().slice(0,10)}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Custom console logger that writes to file as well with timestamps (Israel timezone UTC+3)
const log = {
  info: (message) => {
    // Format date in local timezone (Israel - UTC+3)
    const date = new Date();
    const timestamp = new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
    const logMessage = `[${timestamp}] [INFO] ${message}\n`;
    // Include timestamp in console output as well
    console.log(`[${timestamp}] [INFO] ${message}`);
    logStream.write(logMessage);
  },
  error: (message, error) => {
    const date = new Date();
    const timestamp = new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
    const errorStack = error?.stack || error || 'No stack trace';
    const logMessage = `[${timestamp}] [ERROR] ${message}\n${errorStack}\n`;
    // Include timestamp in console output as well
    console.error(`[${timestamp}] [ERROR] ${message}`, error);
    logStream.write(logMessage);
  },
  warn: (message) => {
    const date = new Date();
    const timestamp = new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
    const logMessage = `[${timestamp}] [WARN] ${message}\n`;
    // Include timestamp in console output as well
    console.warn(`[${timestamp}] [WARN] ${message}`);
    logStream.write(logMessage);
  }
};

// Google Apps Script Integration Helper
class AppsScriptManager {
  constructor(scriptUrl, secretKey, logFn = console.log) {
    this.scriptUrl = scriptUrl;
    this.secretKey = secretKey;
    this.log = logFn;
    this.cachedGuests = null;
    this.cachedEventDetails = null;
    this.lastFetchTime = 0;
    this.CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes cache timeout
  }

  async fetchGuestList() {
    try {
      // Check if we have a recent cache
      const now = Date.now();
      if (this.cachedGuests && (now - this.lastFetchTime) < this.CACHE_TIMEOUT) {
        this.log.info('Using cached guest list data');
        return this.cachedGuests;
      }

            // NEW LOGGING - Log the API details
      this.log.info(`Attempting API call to fetch guests from: ${this.scriptUrl}`);
      this.log.info(`Using secret key starting with: ${this.secretKey.substring(0, 3)}...`);
      
      // Make API request to Apps Script
      this.log.info(`Fetching guest list from Google Sheets: ${this.scriptUrl}`);
      const response = await axios.post(this.scriptUrl, {
        key: this.secretKey,
        operation: "get_guests"
      });
      
      // NEW LOGGING - Log API response
      this.log.info(`API response status: ${response.status}`);
      this.log.info(`API response data: ${JSON.stringify(response.data)}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || "Failed to fetch guest list");
      }
      
      // Format the data
      const guests = response.data.guests.map(guest => ({
        name: guest.Name || '',
        phone: this.formatPhoneNumber(guest.Phone || ''),
        email: guest.Email || '',
        status: guest.Status || 'Pending',
        count: guest.GuestCount || '0',
        notes: guest.Notes || '',
        lastContacted: guest.LastContacted || ''
      })).filter(guest => guest.phone); // Only include guests with phone numbers
      
      // Update cache
      this.cachedGuests = guests;
      this.lastFetchTime = now;
      
      this.log.info(`Fetched ${guests.length} guests from Apps Script`);
      return guests;
    } catch (error) {
      // NEW LOGGING - Enhanced error logging
      this.log.error(`Failed to fetch guest list: ${error.message}`, error);
      if (error.response) {
        this.log.error(`API error response: ${JSON.stringify(error.response.data)}`);
      }
      
      // Return empty array on error
      this.log.warn('Returning empty list due to API error');
      return [];
      return [];
    }
  }
  
  async updateGuestStatus(guestPhone, status, guestCount, notes = '') {
    try {
      // Format the phone number consistently
      const formattedPhone = this.formatPhoneNumber(guestPhone);
      
      // NEW LOGGING - Log update details
      this.log.info(`Updating guest status in Apps Script: ${formattedPhone} to ${status}`);
      this.log.info(`Using script URL: ${this.scriptUrl}`);
      
      // Make API request to Apps Script
      this.log.info(`Updating guest status in Apps Script: ${formattedPhone}`);
      const response = await axios.post(this.scriptUrl, {
        key: this.secretKey,
        operation: "update_status",
        phone: formattedPhone,
        status: status,
        count: guestCount.toString(),
        notes: notes
      });
      
      // NEW LOGGING - Log response
      this.log.info(`Update response: ${JSON.stringify(response.data)}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || "Failed to update guest status");
      }
      
      // Invalidate cache
      this.cachedGuests = null;
      
      this.log.info(`Updated status for ${formattedPhone} to ${status} with ${guestCount} guests`);
      return true;
    } catch (error) {
      // NEW LOGGING - Enhanced error logging
      this.log.error(`Failed to update guest status: ${error.message}`, error);
      if (error.response) {
        this.log.error(`API error response: ${JSON.stringify(error.response.data)}`);
      }
      return false;
    }
  }
  
  // Helper to format phone numbers consistently
  formatPhoneNumber(phone) {
    // Remove any non-numeric characters
    let cleaned = String(phone).replace(/\D/g, '');
    
    // Ensure it starts with a country code (default to +1 if none)
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned; // Add US country code
    }
    
    // Add the + if missing
    if (cleaned.charAt(0) !== '+') {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  }
  
  // Get event details from Apps Script
  async getEventDetails() {
    try {
      // Check if we have a recent cache
      const now = Date.now();
      if (this.cachedEventDetails && (now - this.lastFetchTime) < this.CACHE_TIMEOUT) {
        this.log.info('Using cached event details');
        return this.cachedEventDetails;
      }
      
      // NEW LOGGING - Log request details
      this.log.info(`Attempting to fetch event details from: ${this.scriptUrl}`);
      
      // Make API request to Apps Script
      this.log.info(`Fetching event details from Google Sheets: ${this.scriptUrl}`);
      const response = await axios.post(this.scriptUrl, {
        key: this.secretKey,
        operation: "get_event_details"
      });
      
      // NEW LOGGING - Log response
      this.log.info(`Event details response: ${JSON.stringify(response.data)}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || "Failed to fetch event details");
      }
      
      const details = response.data.details;
      
      const eventDetails = {
        name: details.Name || "Event",
        date: details.Date || new Date().toLocaleDateString(),
        // Fix the time format from Google Sheets
        time: typeof details.Time === 'string' && details.Time.includes('T') ? 
          new Date(details.Time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
          details.Time || "12:00 PM",
        location: details.Location || "TBD",
        description: details.Description || "Please RSVP for our event"
      };
      
      // Update cache
      this.cachedEventDetails = eventDetails;
      this.lastFetchTime = now;
      
      return eventDetails;
    } catch (error) {
      // NEW LOGGING - Enhanced error logging
      this.log.error(`Failed to get event details: ${error.message}`, error);
      if (error.response) {
        this.log.error(`API error response: ${JSON.stringify(error.response.data)}`);
      }
      
      // Return default data on error
      return {
        name: "Event",
        date: new Date().toLocaleDateString(),
        time: "12:00 PM",
        location: "TBD",
        description: "Please RSVP for our event"
      };
    }
  }
}

// Helper function to check if object is empty
function isEmptyObject(obj) {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
}

// Load the invitation image
let invitationImage;
try {
  const imagePath = path.join(__dirname, 'invitation.jpeg');
  log.info(`Loading invitation image from: ${imagePath}`);
  invitationImage = fs.readFileSync(imagePath);
  log.info('Invitation image loaded successfully');
} catch (error) {
  log.error('Failed to load invitation image:', error);
  // Continue without image if there's an error
}

// Declare client at the top level so it's accessible in event handlers
let client = null;

// Setup Express server
const app = express();
const serverPort = process.env.PORT || 8080; // Use Railway.app default port 

// Store the latest QR code
let lastQR = null;

// Initialize Apps Script manager before clientstart
const appScriptManager = new AppsScriptManager(
  process.env.APPS_SCRIPT_URL || '',
  process.env.SECRET_KEY || 'your_secret_key_here',
  log
);

// Track guests who have been contacted
const contactedGuests = new Set();

// Configure message sending
const MESSAGE_SCHEDULE = process.env.MESSAGE_SCHEDULE || '0 9-20 * * *'; // Every hour from 9am to 8pm
const MESSAGE_BATCH_SIZE = parseInt(process.env.MESSAGE_BATCH_SIZE || '10', 10);
const MESSAGE_DELAY = parseInt(process.env.MESSAGE_DELAY || '8000', 10);

// Main function to start the client
async function clientstart() {
  log.info('Initializing WhatsApp connection...');
  
  // Session path - detect if we're running in Docker/Railway or locally
  // Use environment variable to override session path for Railway.com compatibility
const SESSION_PATH = process.env.SESSION_PATH || 
    (process.env.NODE_ENV === 'production' 
      ? path.join(__dirname, 'session')  // Production path
      : path.join(__dirname, 'local_session'));  // Local path for development

  // Important: Railway.app needs the absolute path
  console.log('Using session path:', SESSION_PATH);

  // Ensure the directory exists
  try {
    if (!fs.existsSync(SESSION_PATH)) {
      fs.mkdirSync(SESSION_PATH, { recursive: true });
      console.log(`Created session directory at: ${SESSION_PATH}`);
    }
    
    // Check if session reset is requested
    if (process.env.RESET_SESSION === 'true') {
      console.log('RESET_SESSION is set to true, clearing existing session files...');
      // Remove all files in the session directory except .gitkeep
      const files = fs.readdirSync(SESSION_PATH);
      for (const file of files) {
        if (file !== '.gitkeep') {
          fs.unlinkSync(path.join(SESSION_PATH, file));
        }
      }
      console.log('Session files cleared successfully');
    }
  } catch (err) {
    console.error(`Failed to create session directory or clear session: ${err.message}`);
  }

  // Auth state
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
  
  try {
    // Create WhatsApp client
    const waClient = makeWASocket({
      printQRInTerminal: true,
      syncFullHistory: true,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
      generateHighQualityLinkPreview: true,
      patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(
          message.buttonsMessage ||
          message.templateMessage ||
          message.listMessage
        );
        if (requiresPatch) {
          message = {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadataVersion: 2,
                  deviceListMetadata: {},
                },
                ...message,
              },
            },
          };
        }
        return message;
      },
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      logger: pino({ level: 'fatal' }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino().child({
          level: 'silent',
          stream: 'store'
        })),
      },
      retryRequestDelayMs: 10000
    });

    // Create in-memory store
    const store = makeInMemoryStore({
      logger: pino().child({ level: 'silent', stream: 'store' })
    });
    
    store.bind(waClient.ev);

    // Helper function to send RSVP messages
    const sendRSVPMessages = async (forced = false) => {
      try {
        // NEW LOGGING - Start message with more details
        log.info(`Starting RSVP message batch with URL: ${process.env.APPS_SCRIPT_URL}`);
        
        // Ensure we have a valid connection
        if (!waClient.user) {
          log.warn('No active connection, skipping RSVP message batch');
          return;
        }
        
        // Get event details
        const eventDetails = await appScriptManager.getEventDetails();
        log.info(`Preparing messages for event: ${eventDetails.name}`);
        
        // Get event date (either from env var or from event details)
        const eventDate = process.env.EVENT_DATE || eventDetails.date;
        const daysRemaining = calculateDaysRemaining(eventDate);
        log.info(`Days remaining until event: ${daysRemaining}`);
        
        // NEW LOGGING - Log before fetching guests
        log.info(`About to fetch guests with key: ${process.env.SECRET_KEY.substring(0, 3)}...`);
        
        // Fetch the guest list
        const guests = await appScriptManager.fetchGuestList();
        
        // NEW LOGGING - Log guest count and first guest
        log.info(`Guest list response received with ${guests.length} guests`);
        if (guests.length > 0) {
          log.info(`First guest data: ${JSON.stringify(guests[0])}`);
        }
        
        log.info(`Found ${guests.length} potential guests to contact`);
        
        // Use event-aware scheduling if not forced
        let pendingGuests;
        if (forced) {
          // If forced (manual trigger), use original filtering logic
          pendingGuests = guests.filter(guest => 
            !contactedGuests.has(guest.phone) && 
            (guest.status === 'Pending' || guest.status === '')
          );
          log.info(`Manual trigger: using standard filtering (${pendingGuests.length} guests)`);
        } else {
          // Use event proximity-based filtering for automatic scheduling
          pendingGuests = filterGuestsByEventProximity(guests, eventDate, contactedGuests);
          log.info(`Automatic scheduling: ${daysRemaining} days until event, selected ${pendingGuests.length} guests`);
          
          // If no guests to message today based on schedule, exit early
          if (pendingGuests.length === 0 && daysRemaining > 0) {
            log.info(`No guests to message today according to event scheduling strategy (${daysRemaining} days until event)`);
            return;
          }
        }
        
        if (pendingGuests.length === 0) {
          log.info('No new guests to contact in this batch');
          return;
        }
        
        // Take only a batch
        const batchGuests = pendingGuests.slice(0, MESSAGE_BATCH_SIZE);
        log.info(`Sending messages to ${batchGuests.length} guests in this batch`);
        
        // Send messages with a delay between each
        for (const guest of batchGuests) {
          try {
            // Create buttons for interactive responses
            const buttons = [
              {buttonId: 'yes', buttonText: {displayText: 'כן, אני מגיע/ה'}, type: 1},
              {buttonId: 'no', buttonText: {displayText: 'לא אוכל להגיע'}, type: 1},
              {buttonId: 'maybe', buttonText: {displayText: 'לא בטוח/ה, תשאל אותי מחר'}, type: 1}
            ];              // Get event date and calculate days remaining
            const eventDate = process.env.EVENT_DATE || eventDetails.date;
            const daysRemaining = calculateDaysRemaining(eventDate);
              
            // Get the appropriate message based on event proximity
            const messageText = getMessageByProximity(daysRemaining, eventDetails, guest.name);
            
            // Create message with image if available, otherwise text only
            let buttonMessage;
            if (invitationImage) {
              buttonMessage = {
                image: invitationImage,
                caption: messageText,
                footer: 'אנא השיבו באמצעות הכפתורים למטה',
                buttons: buttons,
                headerType: 4, // Type 4 for image with caption
                viewOnce: true
              };
            } else {
              buttonMessage = {
                text: messageText,
                footer: 'אנא השיבו באמצעות הכפתורים למטה',
                buttons: buttons,
                headerType: 1,
                viewOnce: true
              };
            }
            
            // Send the message
            // NEW LOGGING - Log message details
            log.info(`Sending RSVP message to: ${guest.phone}@s.whatsapp.net`);
            
            // Remove the plus sign from the phone number if present
            const formattedPhone = guest.phone.startsWith('+') ? 
            guest.phone.substring(1) + '@s.whatsapp.net' : 
            guest.phone + '@s.whatsapp.net';
            log.info(`Formatted phone for WhatsApp: ${formattedPhone}`);
            await waClient.sendMessage(formattedPhone, buttonMessage);
            
            // Mark as contacted
            contactedGuests.add(guest.phone);
            
            log.info(`Sent RSVP message to ${guest.name} (${guest.phone})`);
            
            // Add a delay between messages
            await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY));
          } catch (error) {
            log.error(`Failed to send message to ${guest.name} (${guest.phone}):`, error);
          }
        }
        
        log.info(`Completed RSVP message batch, sent ${batchGuests.length} messages`);
      } catch (error) {
        log.error('Error in RSVP message sender:', error);
      }
    };

    // Schedule the RSVP messages only in production
    if (process.env.NODE_ENV === 'production') {
      log.info(`Setting up RSVP message schedule: ${MESSAGE_SCHEDULE}`);
      cron.schedule(MESSAGE_SCHEDULE, async () => {
        await sendRSVPMessages();
      });
      
      // Add scheduler to check for follow-ups every hour
      log.info('Setting up follow-up checker to run every hour');
      cron.schedule('0 * * * *', async () => {
        try {
          if (!global.scheduledFollowUps || !Array.isArray(global.scheduledFollowUps)) {
            global.scheduledFollowUps = [];
            return;
          }
          
          const currentTime = Date.now();
          const followUpsToSend = global.scheduledFollowUps.filter(f => f.scheduledTime <= currentTime);
          
          if (followUpsToSend.length === 0) return;
          
          log.info(`Found ${followUpsToSend.length} follow-ups to send`);
          
          // Get event details for the follow-ups
          const eventDetails = await appScriptManager.getEventDetails();
          
          // Process each follow-up
          for (const followUp of followUpsToSend) {
            try {
              // Create buttons for interactive responses
              const buttons = [
                {buttonId: 'yes', buttonText: {displayText: 'כן, אני מגיע/ה'}, type: 1},
                {buttonId: 'no', buttonText: {displayText: 'לא אוכל להגיע'}, type: 1}
              ];
              
              const formattedPhone = followUp.phone.startsWith('+') ? 
                followUp.phone.substring(1) + '@s.whatsapp.net' : 
                followUp.phone + '@s.whatsapp.net';
              
              // Send follow-up message
              const followUpMessage = {
                text: `שלום ${followUp.name},\n\nאתמול ציינת שאינך בטוח/ה לגבי הגעתך ל${eventDetails.name}.\n\nהאם כעת יש לך תשובה סופית לגבי ההגעה לאירוע?\n\n📅 תאריך: ${eventDetails.date}\n⏰ שעה: ${eventDetails.time}\n📍 מיקום: ${eventDetails.location}`,
                footer: 'אנא השיבו באמצעות הכפתורים למטה',
                buttons: buttons,
                headerType: 1,
                viewOnce: true
              };
              
              await waClient.sendMessage(formattedPhone, followUpMessage);
              log.info(`Sent follow-up to ${followUp.name} (${followUp.phone})`);
              
              // Remove this follow-up from the list
              global.scheduledFollowUps = global.scheduledFollowUps.filter(
                f => f.phone !== followUp.phone
              );
              
              // Add a delay between messages
              await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (error) {
              log.error(`Error sending follow-up to ${followUp.phone}:`, error);
            }
          }
        } catch (error) {
          log.error('Error in follow-up scheduler:', error);
        }
      });
    } else {
      log.info('Automatic message scheduling disabled in development mode');
    }
    // --- Messages upsert handler for RSVP responses ---
    waClient.ev.on("messages.upsert", async (chatUpdate) => {
      try {
        const mek = chatUpdate.messages[0];
        if (!mek.message) return;
        mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
        if (mek.key && mek.key.remoteJid === 'status@broadcast') return;
        if (!waClient.public && !mek.key.fromMe && chatUpdate.type === 'notify') return;
        if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return;
        
        const m = smsg(waClient, mek, store);
        
        // Skip group messages, we only want direct messages for RSVP
        if (m.chat.endsWith('@g.us')) {
          return;
        }
        
        // Get the sender's phone number
        const senderPhone = m.sender.split('@')[0];
        
        // Check if the message is from the bot's own number (auto-reply from WhatsApp)
        if (waClient.user && senderPhone === waClient.user.id.split(':')[0]) {
          log.info(`Ignoring message from bot's own number: ${senderPhone}`);
          return;
        }
        
        // Log incoming messages
        log.info(`Message from ${senderPhone}: ${m.text}`);
        
        // Define text variable first
        const text = m.text ? m.text.toLowerCase().trim() : '';
        
        // Check if this is a message sent as a response to our auto-responses
        const possibleAutoReply = 
          (text && (text.includes("thank you for confirming") ||
                  text.includes("thank you for letting us know") || 
                  text.includes("we're sorry you can't make it") || 
                  text.includes("i'm not sure i understand your response")));
        
        if (possibleAutoReply) {
          log.info(`Detected possible auto-reply message, ignoring: ${text.substring(0, 30)}...`);
          return;
        }
        
        // Check for admin commands
        const ADMIN_NUMBERS = (process.env.ADMIN_NUMBERS || '').split(',');
        const adminPhones = ADMIN_NUMBERS.map(num => {
          // Ensure consistency by removing the "+" and any other non-numeric characters
          return num.replace(/\D/g, '');
        });
        const senderDigitsOnly = senderPhone.replace(/\D/g, '');
        const isAdmin = adminPhones.some(num => senderDigitsOnly.includes(num));
        
        log.info(`Checking if ${senderPhone} (${senderDigitsOnly}) is admin: ${isAdmin}`);
        
        
        if (isAdmin) {
          // ...existing code...
          if (m.text === '!followups') {
            try {
              if (!global.scheduledFollowUps || global.scheduledFollowUps.length === 0) {
                await waClient.sendMessage(m.chat, { 
                  text: "אין תזכורות מתוזמנות כרגע." 
                });
                return;
              }
              
              // Format the list of follow-ups
              const followUps = global.scheduledFollowUps.map(f => {
                const date = new Date(f.scheduledTime);
                return `- ${f.name} (${f.phone}): ${date.toLocaleString()}`;
              }).join('\n');
              
              await waClient.sendMessage(m.chat, { 
                text: `*תזכורות מתוזמנות:*\n\n${followUps}` 
              });
            } catch (error) {
              log.error('Error checking follow-ups:', error);
              await waClient.sendMessage(m.chat, { 
                text: "שגיאה בבדיקת תזכורות מתוזמנות." 
              });
            }
            return;
          }
          if (m.text === '!sendrsvp') {
            await waClient.sendMessage(m.chat, { text: "Starting RSVP message batch..." });
            
            // NEW DEBUG CODE - ADD THIS SECTION
            try {
              const guests = await appScriptManager.fetchGuestList();
              log.info(`Total guests: ${guests.length}`);
              
              // Check each guest's status
              guests.forEach(guest => {
                log.info(`Guest: ${guest.name}, Phone: ${guest.phone}, Status: "${guest.status}", In contactedSet: ${contactedGuests.has(guest.phone)}`);
              });
              
              // Log the contactedGuests set
              log.info(`contactedGuests set contains: ${Array.from(contactedGuests).join(', ')}`);
            } catch (error) {
              log.error('Error in debug code:', error);
            }
            // END NEW DEBUG CODE
            
            await sendRSVPMessages(true);
            await waClient.sendMessage(m.chat, { text: "RSVP message batch completed!" });
            return;
          }
          
          if (m.text === '!clearcache') {
            try {
              // Clear the contactedGuests set
              contactedGuests.clear();
              
              // Also clear the cached data to force fresh data
              appScriptManager.cachedGuests = null;
              appScriptManager.cachedEventDetails = null;
              appScriptManager.lastFetchTime = 0;
              
              await waClient.sendMessage(m.chat, { 
                text: "✅ Cache cleared successfully! Automatic hourly messages will now be sent to all pending guests again." 
              });
              
              // Log the operation
              log.info('Cache cleared manually by admin');
            } catch (error) {
              log.error('Error clearing cache:', error);
              await waClient.sendMessage(m.chat, { 
                text: "Error clearing cache. Check logs for details." 
              });
            }
            return;
          }
          // Check if the message is a response to our RSVP buttons

          // ADD THE NEW FORCE COMMAND RIGHT AFTER THE SENDRSVP COMMAND
          if (m.text === '!sendrsvpforce') {
            try {
              await waClient.sendMessage(m.chat, { text: "Forcing RSVP messages to ALL guests..." });
              
              // Get event details directly
              const eventDetails = await appScriptManager.getEventDetails();
              
              // Get guests directly
              const guests = await appScriptManager.fetchGuestList();
              
              // Log what we found
              log.info(`Found ${guests.length} guests to message`);
              
              // Send messages without filtering
              for (const guest of guests) {
                try {
                  // Create buttons for interactive responses
                  const buttons = [
                    {buttonId: 'yes', buttonText: {displayText: 'כן, אני מגיע/ה'}, type: 1},
                    {buttonId: 'no', buttonText: {displayText: 'לא אוכל להגיע'}, type: 1}
                  ];
                  
                  // Fix time format from Google Sheets
                  let displayTime = eventDetails.time;
                  if (typeof eventDetails.time === 'string' && eventDetails.time.includes('T')) {
                    try {
                      displayTime = new Date(eventDetails.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    } catch (e) {
                      log.warn(`Failed to format time: ${e.message}`);
                    }
                  }
                  
                  // Create message with image if available, otherwise text only
                  let buttonMessage;
                  if (invitationImage) {
                    buttonMessage = {
                      image: invitationImage,
                      caption: `*${eventDetails.name} - הזמנה לאירוע*\n\nשלום ${guest.name},\n\nאתם מוזמנים ל${eventDetails.name}!\n\n📅 תאריך: ${eventDetails.date}\n⏰ שעה: ${displayTime}\n📍 מיקום: ${eventDetails.location}\n\n${eventDetails.description}\n\nהאם תוכלו להגיע?`,
                      footer: 'אנא השיבו באמצעות הכפתורים למטה',
                      buttons: buttons,
                      headerType: 4, // Type 4 for image with caption
                      viewOnce: true
                    };
                  } else {
                    buttonMessage = {
                      text: `*${eventDetails.name} - הזמנה לאירוע*\n\nשלום ${guest.name},\n\nאתם מוזמנים ל${eventDetails.name}!\n\n📅 תאריך: ${eventDetails.date}\n⏰ שעה: ${displayTime}\n📍 מיקום: ${eventDetails.location}\n\n${eventDetails.description}\n\nהאם תוכלו להגיע?`,
                      footer: 'אנא השיבו באמצעות הכפתורים למטה',
                      buttons: buttons,
                      headerType: 1,
                      viewOnce: true
                    };
                  }
                  
                  // Send the message
                  log.info(`Sending force RSVP message to: ${guest.phone}@s.whatsapp.net`);
                  
                  // Remove the plus sign from the phone number if present
                  const formattedPhone = guest.phone.startsWith('+') ? 
                  guest.phone.substring(1) + '@s.whatsapp.net' : 
                  guest.phone + '@s.whatsapp.net';
                  log.info(`Formatted phone for WhatsApp: ${formattedPhone}`);
                  await waClient.sendMessage(formattedPhone, buttonMessage);
                  log.info(`✓ Sent RSVP message to ${guest.name} (${guest.phone})`);
                  
                  // Wait 2 seconds between messages
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                  log.error(`Failed to send message to ${guest.name} (${guest.phone}):`, error);
                }
              }
              
              await waClient.sendMessage(m.chat, { text: `Completed sending force messages to ${guests.length} guests` });
            } catch (error) {
              log.error('Error in force send command:', error);
              await waClient.sendMessage(m.chat, { 
                text: `Error: ${error.message}` 
              });
            }
            return;
          }
          
          if (m.text === '!status') {
            try {
              // Get event details
              const eventDetails = await appScriptManager.getEventDetails();
              
              // Get guest stats
              const guests = await appScriptManager.fetchGuestList();
              const total = guests.length;
              const confirmed = guests.filter(g => g.status === 'Confirmed').length;
              const declined = guests.filter(g => g.status === 'Declined').length;
              const pending = guests.filter(g => g.status === 'Pending' || g.status === '').length;
              
              // Count total guests attending
              const totalAttending = guests
                .filter(g => g.status === 'Confirmed')
                .reduce((sum, guest) => sum + parseInt(guest.count || '0', 10), 0);
              
              // Create status message
              const statusMessage = `*Event RSVP Bot Status*\n\n` +
                `*Event:* ${eventDetails.name}\n` +
                `*Date:* ${eventDetails.date}\n` +
                `*Time:* ${eventDetails.time}\n` +
                `*Location:* ${eventDetails.location}\n\n` +
                `*RSVP Statistics:*\n` +
                `- Total Invitees: ${total}\n` +
                `- Confirmed: ${confirmed}\n` +
                `- Declined: ${declined}\n` +
                `- Pending: ${pending}\n` +
                `- Total Attending: ${totalAttending} people\n\n` +
                `*Bot Status:*\n` +
                `- Connected: ${!!waClient.user}\n` +
                `- Phone: ${waClient.user?.id || 'Not connected'}\n` +
                `- Mode: ${process.env.NODE_ENV || 'development'}`;
              
              await waClient.sendMessage(m.chat, { text: statusMessage });
            } catch (error) {
              log.error('Error getting status:', error);
              await waClient.sendMessage(m.chat, { 
                text: "Error getting status. Check logs for details." 
              });
            }
            return;
          }
          
          if (m.text === '!reload') {
            try {
              // Clear cache
              appScriptManager.cachedGuests = null;
              appScriptManager.cachedEventDetails = null;
              appScriptManager.lastFetchTime = 0;
              
              // Fetch guest list
              const guests = await appScriptManager.fetchGuestList();
              
              await waClient.sendMessage(m.chat, { 
                text: `Successfully reloaded ${guests.length} guests from Google Sheets.` 
              });
            } catch (error) {
              log.error('Error reloading guest list:', error);
              await waClient.sendMessage(m.chat, { 
                text: "Error reloading guest list. Check logs for details." 
              });
            }
            return;
          }
          
          // Special test command only in development
          if (m.text === '!test') {
            try {
              // Send a test message with buttons
              const buttons = [
                {buttonId: 'test_yes', buttonText: {displayText: 'כן (בדיקה)'}, type: 1},
                {buttonId: 'test_no', buttonText: {displayText: 'לא (בדיקה)'}, type: 1}
              ];
              
              // Create message with image if available
              let buttonMessage;
              if (invitationImage) {
                buttonMessage = {
                  image: invitationImage,
                  caption: `*בדיקת הודעה*\n\nזוהי הזמנה לבדיקה.\n\nהאם תוכל להגיע לאירוע הבדיקה?`,
                  footer: 'אנא השיב באמצעות הכפתורים למטה',
                  buttons: buttons,
                  headerType: 4, // Type 4 for image with caption
                  viewOnce: true
                };
              } else {
                buttonMessage = {
                  text: `*בדיקת הודעה*\n\nזוהי הזמנה לבדיקה.\n\nהאם תוכל להגיע לאירוע הבדיקה?`,
                  footer: 'אנא השיב באמצעות הכפתורים למטה',
                  buttons: buttons,
                  headerType: 1,
                  viewOnce: true
                };
              }
              
              await waClient.sendMessage(m.chat, buttonMessage);
              log.info('Sent test message with buttons');
              
              // NEW CODE - Special test for production
              if (process.env.NODE_ENV === 'production') {
                try {
                  // Try sending one RSVP message to admin
                  const adminPhone = process.env.ADMIN_NUMBERS?.split(',')[0];
                  const guests = await appScriptManager.fetchGuestList();
                  const eventDetails = await appScriptManager.getEventDetails();
                  
                  // Create message for admin
                  const prodButtons = [
                    {buttonId: 'yes', buttonText: {displayText: 'כן, אני מגיע/ה'}, type: 1},
                    {buttonId: 'no', buttonText: {displayText: 'לא אוכל להגיע'}, type: 1}
                  ];
                  
                  // Create message with image if available
                  let prodButtonMessage;
                  if (invitationImage) {
                    prodButtonMessage = {
                      image: invitationImage,
                      caption: `*${eventDetails.name} - הזמנה לאירוע (בדיקה פרוד)*\n\nשלום מנהל,\n\nזוהי הודעת בדיקה:\n\n📅 תאריך: ${eventDetails.date}\n⏰ שעה: ${eventDetails.time}\n📍 מיקום: ${eventDetails.location}\n\n${eventDetails.description}\n\nהאם תוכל להגיע?`,
                      footer: 'אנא השיב באמצעות הכפתורים למטה',
                      buttons: prodButtons,
                      headerType: 4,
                      viewOnce: true
                    };
                  } else {
                    prodButtonMessage = {
                      text: `*${eventDetails.name} - הזמנה לאירוע (בדיקה פרוד)*\n\nשלום מנהל,\n\nזוהי הודעת בדיקה:\n\n📅 תאריך: ${eventDetails.date}\n⏰ שעה: ${eventDetails.time}\n📍 מיקום: ${eventDetails.location}\n\n${eventDetails.description}\n\nהאם תוכל להגיע?`,
                      footer: 'אנא השיב באמצעות הכפתורים למטה',
                      buttons: prodButtons,
                      headerType: 1,
                      viewOnce: true
                    };
                  }
                  
                  await waClient.sendMessage(adminPhone + '@s.whatsapp.net', prodButtonMessage);
                  await waClient.sendMessage(m.chat, { 
                    text: `Production test message sent! Guests found: ${guests.length}` 
                  });
                } catch (error) {
                  log.error('Error in production test:', error);
                  await waClient.sendMessage(m.chat, { 
                    text: `Error sending production test: ${error.message}` 
                  });
                }
              }
            } catch (error) {
              log.error('Error sending test message:', error);
              await waClient.sendMessage(m.chat, { 
                text: "Error sending test message. Check logs for details." 
              });
            }
            return;
          }
          
          // NEW CODE - Debug API Command
          if (m.text === '!debugapi') {
            try {
              log.info('Testing API connection...');
              await waClient.sendMessage(m.chat, { text: "Testing connection to Google Apps Script..." });
              
              // Log environment
              log.info(`ENV: APPS_SCRIPT_URL=${process.env.APPS_SCRIPT_URL}`);
              log.info(`ENV: SECRET_KEY=${process.env.SECRET_KEY.substring(0, 3)}...`);
              
              // Test getting guests
              try {
                const guests = await appScriptManager.fetchGuestList();
                await waClient.sendMessage(m.chat, { 
                  text: `Successfully fetched ${guests.length} guests from API.` 
                });
                
                // Show first guest
                if (guests.length > 0) {
                  await waClient.sendMessage(m.chat, { 
                    text: `First guest: ${JSON.stringify(guests[0])}` 
                  });
                }
              } catch (error) {
                await waClient.sendMessage(m.chat, { 
                  text: `Error fetching guests: ${error.message}` 
                });
              }
              
              // Test getting event details
              try {
                const eventDetails = await appScriptManager.getEventDetails();
                await waClient.sendMessage(m.chat, { 
                  text: `Successfully fetched event details: ${JSON.stringify(eventDetails)}` 
                });
              } catch (error) {
                await waClient.sendMessage(m.chat, { 
                  text: `Error fetching event details: ${error.message}` 
                });
              }
              
              return;
            } catch (error) {
              log.error('Error in debugapi command:', error);
              await waClient.sendMessage(m.chat, { 
                text: `Debug error: ${error.message}` 
              });
            }
          }
          
          if (m.text === '!eventdate') {
            try {
              // Get event date (either from env var or from event details)
              const eventDetails = await appScriptManager.getEventDetails();
              const eventDate = process.env.EVENT_DATE || eventDetails.date;
              const daysRemaining = calculateDaysRemaining(eventDate);
              
              let message = `*Event Date Information*\n\n`;
              message += `Event: ${eventDetails.name}\n`;
              message += `Date: ${eventDate}\n`;
              message += `Days remaining: ${daysRemaining}\n\n`;
              
              // Add scheduling information
              message += `*Messaging Schedule:*\n`;
              message += `- Initial invitation: 28-30 days before\n`;
              message += `- First reminder: 14 days before\n`;
              message += `- Second reminder: 7 days before\n`;
              message += `- Final reminder: 2-3 days before\n`;
              
              // Show which phase we're in
              if (daysRemaining >= 28 && daysRemaining <= 30) {
                message += `\n*Current phase: Initial invitation*`;
              } else if (daysRemaining === 14) {
                message += `\n*Current phase: First reminder*`;
              } else if (daysRemaining === 7) {
                message += `\n*Current phase: Second reminder*`;
              } else if (daysRemaining >= 2 && daysRemaining <= 3) {
                message += `\n*Current phase: Final reminder*`;
              } else {
                message += `\n*Current phase: No scheduled messages today*`;
              }
              
              await waClient.sendMessage(m.chat, { text: message });
            } catch (error) {
              log.error('Error in eventdate command:', error);
              await waClient.sendMessage(m.chat, { 
                text: "Error getting event date information." 
              });
            }
            return;
          }
          
          if (m.text === '!debug') {
            try {
              // Get the sender's info
              const senderInfo = {
                number: senderPhone,
                formattedNumber: appScriptManager.formatPhoneNumber(senderPhone),
                isAdmin: isAdmin,
                adminNumbers: ADMIN_NUMBERS,
                message: m.text
              };
              
              await waClient.sendMessage(m.chat, { 
                text: `Debug Info: \n${JSON.stringify(senderInfo, null, 2)}` 
              });
              
              // Also check if they're in the guest list
              const guests = await appScriptManager.fetchGuestList();
              const matchingGuest = guests.find(g => {
                const guestDigits = g.phone.replace(/\D/g, '');
                const senderDigits = senderPhone.replace(/\D/g, '');
                return guestDigits.includes(senderDigits) || senderDigits.includes(guestDigits);
              });
              
              if (matchingGuest) {
                await waClient.sendMessage(m.chat, { 
                  text: `You are in the guest list as: \n${JSON.stringify(matchingGuest, null, 2)}` 
                });
              } else {
                await waClient.sendMessage(m.chat, { 
                  text: `You are NOT found in the guest list.` 
                });
              }
              
              return;
            } catch (error) {
              log.error('Error in debug command:', error);
            }
          }
        }
        
        // Handle RSVP button responses
        if (mek.message && mek.message.buttonsResponseMessage) {
          const response = mek.message.buttonsResponseMessage;
          log.info(`Button response received: ${JSON.stringify(response.selectedButtonId)}`);
          
          if (response.selectedButtonId === 'yes' || response.selectedButtonId === 'test_yes') {
            // Ask for the number of guests
            const buttons = [
              {buttonId: 'guest_1', buttonText: {displayText: '1 (רק אני)'}, type: 1},
              {buttonId: 'guest_2', buttonText: {displayText: '2 אנשים'}, type: 1},
              {buttonId: 'guest_more', buttonText: {displayText: '3 או יותר'}, type: 1}
            ];
            
            await waClient.sendMessage(m.chat, {
              text: "מעולה! כמה אנשים יגיעו בסך הכל (כולל אותך)",
              footer: 'אנא בחרו באחת האפשרויות',
              buttons: buttons,
              headerType: 1,
              viewOnce: true
            });
            
            return;
          }
          else if (response.selectedButtonId === 'no' || response.selectedButtonId === 'test_no') {
            // This is a decline
            try {
              // Update their status in the sheet
              await appScriptManager.updateGuestStatus(senderPhone, 'Declined', '0');
              
              // Send acknowledgment
              await waClient.sendMessage(m.chat, { 
                text: "תודה שהודעת לנו. חבל שלא תוכל להגיע!" 
              });
            } catch (error) {
              log.error(`Error updating decline status for ${senderPhone}:`, error);
              
              // Send generic acknowledgment if update fails
              await waClient.sendMessage(m.chat, { 
                text: "תודה על תשובתך!" 
              });
            }
            return;
          }
          else if (response.selectedButtonId === 'maybe') {
            try {
              // Update their status in the sheet as "Maybe"
              await appScriptManager.updateGuestStatus(senderPhone, 'Maybe', '0', 'Will follow up tomorrow');
              
              // Schedule a follow-up for tomorrow
              const tomorrowDate = new Date();
              tomorrowDate.setDate(tomorrowDate.getDate() + 1);
              tomorrowDate.setHours(12, 0, 0, 0); // Set to noon tomorrow
              
              const followUpTime = tomorrowDate.getTime();
              const currentTime = Date.now();
              const delayMs = followUpTime - currentTime;
              
              // Store this in a scheduled follow-ups list
              if (!global.scheduledFollowUps) {
                global.scheduledFollowUps = [];
              }
              
              global.scheduledFollowUps.push({
                phone: senderPhone,
                name: (await appScriptManager.fetchGuestList()).find(g => g.phone === appScriptManager.formatPhoneNumber(senderPhone))?.name || '',
                scheduledTime: followUpTime
              });
              
              // Send acknowledgment
              await waClient.sendMessage(m.chat, { 
                text: "אין בעיה, נשלח לך תזכורת מחר לגבי האירוע." 
              });
              
              log.info(`Scheduled follow-up for ${senderPhone} at ${tomorrowDate.toISOString()}`);
            } catch (error) {
              log.error(`Error handling 'maybe' response for ${senderPhone}:`, error);
              
              // Send generic acknowledgment if update fails
              await waClient.sendMessage(m.chat, { 
                text: "קיבלנו את תשובתך, ננסה ליצור איתך קשר מחר." 
              });
            }
            return;
          }
          // Handle guest count responses
          else if (response.selectedButtonId.startsWith('guest_')) {
            let guestCount = 1;
            
            if (response.selectedButtonId === 'guest_1') {
              guestCount = 1;
            } else if (response.selectedButtonId === 'guest_2') {
              guestCount = 2;
            } else if (response.selectedButtonId === 'guest_more') {
              // Ask for specific number
              await waClient.sendMessage(m.chat, { 
                text: "אנא ציינו את מספר האנשים שיגיעו (כולל אותך):" 
              });
              return;
            }
            
            try {
              // Update their status in the sheet
              await appScriptManager.updateGuestStatus(senderPhone, 'Confirmed', guestCount.toString());
              
              // Send confirmation
              await waClient.sendMessage(m.chat, { 
                text: `תודה על האישור! רשמנו שיגיעו ${guestCount} ${guestCount === 1 ? 'איש' : 'אנשים'}` 
              });
            } catch (error) {
              log.error(`Error updating confirm status for ${senderPhone}:`, error);
              
              // Send generic acknowledgment if update fails
              await waClient.sendMessage(m.chat, { 
                text: "תודה על תשובתך! רשמנו את נוכחותך." 
              });
            }
            return;
          }
        }
        
        // Handle text responses
        if (!m.text) return;
        
        // Manual Yes/No responses
        // Add Hebrew responses:
        if (text === 'yes' || text.includes('yes i') || text.includes('i will') || 
        text.includes('i am coming') || text.includes('i\'ll attend') ||
        text === 'כן' || text.includes('אני מגיע') || text.includes('אגיע') || 
        text.includes('נגיע')) {  
          // This is an acceptance but we need to ask for the number of guests
          const buttons = [
            {buttonId: 'guest_1', buttonText: {displayText: '1 (רק אני)'}, type: 1},
            {buttonId: 'guest_2', buttonText: {displayText: '2 אנשים'}, type: 1},
            {buttonId: 'guest_more', buttonText: {displayText: '3 או יותר'}, type: 1}
          ];

          await waClient.sendMessage(m.chat, {
            text: "מעולה! כמה אנשים יגיעו בסך הכל (כולל אותך)?",
            footer: 'אנא בחרו באחת האפשרויות',
            buttons: buttons,
            headerType: 1,
            viewOnce: true
          });

          return;
        }
        
        // Add Hebrew responses:
        if (text === 'no' || text.includes('cannot') || text.includes("can't") || 
        text.includes('not attend') || text.includes('won\'t be') ||
        text === 'לא' || text.includes('לא אוכל') || text.includes('לא אגיע') || 
        text.includes('לא נגיע')) {
          
          // This is a decline
          try {
            // Update their status in the sheet
            await appScriptManager.updateGuestStatus(senderPhone, 'Declined', '0');
            
            // Send acknowledgment in Hebrew
            await waClient.sendMessage(m.chat, { 
              text: "תודה שהודעת לנו. חבל שלא תוכל להגיע!" 
            });
          } catch (error) {
            log.error(`Error updating decline status for ${senderPhone}:`, error);
            
            // Send generic acknowledgment if update fails
            await waClient.sendMessage(m.chat, { 
              text: "תודה על תשובתך!" 
            });
          }
          
          return;
        }
        
        // Check for numeric responses (guest count)
        const numberMatch = text.match(/\b[0-9]+\b/);
        if (numberMatch) {
          const guestCount = parseInt(numberMatch[0], 10);
          
          try {
            // Update their status in the sheet
            await appScriptManager.updateGuestStatus(senderPhone, 'Confirmed', guestCount.toString());
            
            // Send confirmation
            await waClient.sendMessage(m.chat, { 
              text: `תודה על האישור! רשמנו שיגיעו ${guestCount} ${guestCount === 1 ? 'איש' : 'אנשים'}` 
            });
          } catch (error) {
            log.error(`Error updating confirm status for ${senderPhone}:`, error);
            
            // Send generic acknowledgment if update fails
            await waClient.sendMessage(m.chat, { 
              text: "תודה על תשובתך! רשמנו את נוכחותך." 
            });
          }
          
          return;
        }
        
        // If we couldn't determine a clear response
        if (text.includes('rsvp') || text.includes('attend') || text.includes('coming')) {
          // This is probably related to the RSVP
          await waClient.sendMessage(m.chat, { 
            text: "לא הבנתי את התשובה. אנא השיבו 'כן' אם אתם מגיעים, או 'לא' אם אינכם יכולים להגיע. אם אתם מגיעים, אנא ציינו גם כמה אנשים יגיעו."
          });
        }
      } catch (err) {
        log.error('Error processing message:', err);
      }
    });

    waClient.decodeJid = (jid) => {
      if (!jid) return jid;
      if (/:\d+@/gi.test(jid)) {
        let decode = jidDecode(jid) || {};
        return decode.user && decode.server && decode.user + '@' + decode.server || jid;
      } else return jid;
    };

    waClient.public = true;
    
    // Connection update handler
    waClient.ev.on('connection.update', async (update) => {
      log.info(`Connection update: ${JSON.stringify(update)}`);
      
      if (update.connection === 'open') {
        log.info(`Bot successfully connected! Bot JID: ${waClient.user?.id}`);
        
        // Admin commands
        log.info('Available admin commands:');
        log.info('!sendrsvp - Send RSVP messages to pending guests');
        log.info('!sendrsvpforce - Send RSVP messages to ALL guests');
        log.info('!clearcache - Clear the contacted guests cache');
        log.info('!status - Show current bot status and event details');
        log.info('!eventdate - Show event date and days remaining');
        log.info('!reload - Reload guest list from Google Sheets');
        log.info('!debugapi - Test API connection to Google Apps Script');
        log.info('!followups - View scheduled follow-up reminders');
        if (process.env.NODE_ENV === 'development') {
          log.info('!test - Send a test RSVP message (development only)');
        }
      }
      // Enhanced QR code logging and web access
      else if (update.qr) {
        // Save the QR code for web access
        lastQR = update.qr;
        
        // Generate QR in terminal
        qrcode.toString(update.qr, { type: 'terminal', small: true }, (err, text) => {
          if (!err) {
            log.info('\n\n==== WHATSAPP QR CODE (SCAN WITH PHONE) ====');
            console.log('\x1b[36m%s\x1b[0m', text); // Cyan color for visibility
            log.info('============================================');
            log.info('Scan this QR code with WhatsApp to connect your bot');
            log.info(`Or visit http://localhost:${serverPort}/qr or your Railway.app URL to scan it`);
          } else {
            log.error('Failed to generate QR code:', err);
          }
        });
        
        // Also create an image file and HTML for web access
        try {
          // Generate QR as PNG
          qrcode.toFile('whatsapp-qr.png', update.qr, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 300
          });
          
          // Generate HTML with the QR code
          const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>WhatsApp QR Code</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="60">
  <style>
    body { 
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background-color: #f0f2f5;
    }
    .container {
      background-color: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 500px;
    }
    h1 { color: #128C7E; }
    .qr-container { margin: 20px 0; }
    img { max-width: 100%; height: auto; }
    p { margin: 10px 0; line-height: 1.5; }
    .refresh { margin-top: 20px; color: #777; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WhatsApp QR Code</h1>
    <div class="qr-container">
      <img src="data:image/png;base64,${Buffer.from(update.qr).toString('base64')}" alt="WhatsApp QR Code">
    </div>
    <p>1. Open WhatsApp on your phone</p>
    <p>2. Tap Menu or Settings and select <strong>Linked Devices</strong></p>
    <p>3. Tap on <strong>Link a Device</strong></p>
    <p>4. Scan this QR code with your phone's camera</p>
    <p class="refresh">This page will refresh automatically every 60 seconds</p>
  </div>
</body>
</html>`;
          
          fs.writeFileSync('whatsapp-qr.html', htmlContent);
          log.info('QR code saved as HTML and PNG files');
        } catch (qrErr) {
          log.error('Error saving QR code files:', qrErr);
        }
      }
      
      // Connection state handling
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        log.info(`Connection closed. Attempting to reconnect...`);
        let shouldReconnect = true;
        
        if (lastDisconnect && lastDisconnect.error) {
          const statusCode = new Boom(lastDisconnect.error).output.statusCode;
          log.warn(`Disconnected with status code: ${statusCode}`);
          
          if (statusCode === DisconnectReason.loggedOut) {
            log.error('Device logged out, please scan the QR code again');
            // Reset lastQR to force new QR generation
            lastQR = null;
            // Clear session data on logout to force a fresh connection
            try {
              if (fs.existsSync(SESSION_PATH)) {
                const files = fs.readdirSync(SESSION_PATH);
                for (const file of files) {
                  if (file !== '.gitkeep') {
                    fs.unlinkSync(path.join(SESSION_PATH, file));
                  }
                }
                log.info('Cleared session files after logout');
              }
            } catch (clearErr) {
              log.error('Failed to clear session files:', clearErr);
            }
            shouldReconnect = true; // Changed to true to try reconnecting with fresh state
          } else if (statusCode === DisconnectReason.connectionReplaced) {
            log.warn('Connection replaced by another session');
            shouldReconnect = false;
          } else if (statusCode === DisconnectReason.connectionClosed) {
            log.info('Connection closed by server, reconnecting...');
            shouldReconnect = true;
          } else if (statusCode === DisconnectReason.connectionLost) {
            log.info('Connection lost to server, reconnecting...');
            shouldReconnect = true;
          } else if (statusCode === DisconnectReason.badSession) {
            log.error('Bad session detected, clearing session files and reconnecting');
            // Clear session data on bad session
            try {
              if (fs.existsSync(SESSION_PATH)) {
                const files = fs.readdirSync(SESSION_PATH);
                for (const file of files) {
                  if (file !== '.gitkeep') {
                    fs.unlinkSync(path.join(SESSION_PATH, file));
                  }
                }
                log.info('Cleared session files after bad session');
              }
            } catch (clearErr) {
              log.error('Failed to clear session files:', clearErr);
            }
            shouldReconnect = true;
          }
        }
        
        if (shouldReconnect) {
          log.info('Reconnecting...');
          setTimeout(() => {
            // Small delay before reconnecting to avoid fast reconnect loop
            return clientstart(); // Try to reconnect
          }, 3000);
        }
      }
    });
    
    // Handle connection heartbeat to ensure connection stays alive
    setInterval(async () => {
      try {
        if (waClient && waClient.user) {
          // Send a ping to keep the connection alive
          await waClient.sendPresenceUpdate('available');
          log.info('Heartbeat sent successfully');
        }
      } catch (error) {
        log.warn('Heartbeat failed, connection may be unstable', error);
        
        // Try to recover connection if repeatedly failing
        if (global.lastHeartbeatFailed) {
          log.warn('Second consecutive heartbeat failure, checking connection status');
          if (waClient && waClient.ws && waClient.ws.readyState !== 1) {
            log.warn('WebSocket not in OPEN state, connection may need to be restored');
          }
        }
        global.lastHeartbeatFailed = true;
        return;
      }
      
      // Reset the failure flag on success
      global.lastHeartbeatFailed = false;
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Save credentials on update
    waClient.ev.on('creds.update', saveCreds);
    
    // Set the global client reference
    client = waClient;
    
    return waClient;
  } catch (error) {
    log.error('Error initializing WhatsApp client:', error);
    throw error;
  }
}

// Add route for QR code
app.get('/qr', (req, res) => {
  // Check if force reset is requested via query parameter
  if (req.query.reset === 'true') {
    log.info('QR reset requested via URL parameter');
    // Force logout to generate a new QR code
    if (client) {
      log.info('Attempting to logout current session to force new QR code');
      // Set a flag to ignore the current session and generate a new QR
      process.env.RESET_SESSION = 'true';
      // Redirect back to the QR page without the reset parameter
      return res.redirect('/qr');
    }
  }
  
  if (lastQR) {
    // Generate QR image and serve it
    qrcode.toDataURL(lastQR, (err, url) => {
      if (err) {
        res.status(500).send('Error generating QR code');
        return;
      }

      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>WhatsApp QR Code</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="60">
  <style>
    body { 
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background-color: #f0f2f5;
    }
    .container {
      background-color: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 500px;
    }
    h1 { color: #128C7E; }
    .qr-container { margin: 20px 0; }
    img { max-width: 100%; height: auto; }
    p { margin: 10px 0; line-height: 1.5; }
    .refresh { margin-top: 20px; color: #777; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WhatsApp QR Code</h1>
    <div class="qr-container">
      <img src="${url}" alt="WhatsApp QR Code">
    </div>
    <p>1. Open WhatsApp on your phone</p>
    <p>2. Tap Menu or Settings and select <strong>Linked Devices</strong></p>
    <p>3. Tap on <strong>Link a Device</strong></p>
    <p>4. Scan this QR code with your phone's camera</p>
    <p class="refresh">This page will refresh automatically every 60 seconds</p>
  </div>
</body>
</html>`;

      res.send(html);
    });
  } else {
    // Provide a page that explains there's no QR code and offers a reset option
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>WhatsApp Connection</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="15">
  <style>
    body { 
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background-color: #f0f2f5;
    }
    .container {
      background-color: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 500px;
    }
    h1 { color: #128C7E; }
    p { margin: 15px 0; line-height: 1.5; }
    .btn {
      display: inline-block;
      background-color: #128C7E;
      color: white;
      padding: 10px 20px;
      text-decoration: none;
      border-radius: 4px;
      margin-top: 15px;
      font-weight: bold;
    }
    .status { color: #e74c3c; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WhatsApp Connection</h1>
    <p class="status">No QR code is available yet.</p>
    <p>This could be because:</p>
    <ul style="text-align:left">
      <li>The bot is still starting up</li>
      <li>The bot thinks it's already connected (but isn't)</li>
      <li>There was an error generating the QR code</li>
    </ul>
    <p>This page will refresh automatically every 15 seconds.</p>
    <p>Or you can try to force a new connection:</p>
    <a href="/qr?reset=true" class="btn">Reset Connection & Generate New QR</a>
  </div>
</body>
</html>`;

    res.send(html);
  }
});

// Create a public directory for static files
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Create css directory in public
const cssDir = path.join(publicDir, 'css');
if (!fs.existsSync(cssDir)) {
  fs.mkdirSync(cssDir, { recursive: true });
}

// Copy the dashboard CSS file if it doesn't exist
const dashboardCssPath = path.join(cssDir, 'dashboard.css');
if (!fs.existsSync(dashboardCssPath)) {
  try {
    const defaultCss = `/* Dashboard CSS */
:root {
    --primary-color: #128C7E;
    --secondary-color: #25D366;
    --accent-color: #075E54;
    --light-bg: #f0f2f5;
}
body { 
    font-family: Arial, sans-serif;
    background-color: var(--light-bg);
    direction: rtl;
}
.stats-card {
    background-color: white;
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
    text-align: center;
}`;
    fs.writeFileSync(dashboardCssPath, defaultCss);
    log.info(`Created default dashboard CSS at ${dashboardCssPath}`);
  } catch (err) {
    log.error(`Failed to create dashboard CSS file: ${err.message}`);
  }
}

// Import authentication middleware
import dashboardAuth from './utils/dashboardAuth.js';
import cookieParser from 'cookie-parser';

// Parse cookies and request body for authentication
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Serve static files
app.use(express.static(publicDir));
app.use(express.static(__dirname));

// API endpoint for guest list
app.get('/api/guests', dashboardAuth, async (req, res) => {
  try {
    const guestsList = await appScriptManager.fetchGuestList();
    
    // Ensure all guests have both lowercase and uppercase property names for compatibility
    const formattedGuests = guestsList.map(guest => {
      return {
        // Original properties
        ...guest,
        // Add uppercase properties for dashboard compatibility
        Name: guest.name || '',
        Phone: guest.phone || '',
        Email: guest.email || '',
        Status: guest.status || 'Pending',
        GuestCount: guest.count || '0',
        Notes: guest.notes || '',
        LastContacted: guest.lastContacted || '',
      };
    });
    
    log.info(`Sending ${formattedGuests.length} guests to dashboard`);
    res.json({ success: true, guests: formattedGuests });
  } catch (error) {
    log.error('Error fetching guests for dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for event details
app.get('/api/event-details', dashboardAuth, async (req, res) => {
  try {
    const eventDetails = await appScriptManager.getEventDetails();
    
    // Ensure date is in DD.MM.YYYY format for Hebrew locale
    let formattedDate = eventDetails.date;
    
    // If date is in YYYY-MM-DD format, convert to DD.MM.YYYY
    if (formattedDate && formattedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const dateParts = formattedDate.split('-');
      formattedDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
      log.info(`Converted date format from ${eventDetails.date} to ${formattedDate}`);
    }
    
    // Ensure we have both lowercase and uppercase property names for compatibility
    const formattedDetails = {
      // Original lowercase properties from getEventDetails with formatted date
      name: eventDetails.name,
      date: formattedDate,
      time: eventDetails.time,
      location: eventDetails.location,
      description: eventDetails.description,
      
      // Add uppercase properties for dashboard compatibility with formatted date
      Name: eventDetails.name,
      Date: formattedDate,
      Time: eventDetails.time,
      Location: eventDetails.location,
      Description: eventDetails.description
    };
    
    log.info(`Sending event details to dashboard: ${JSON.stringify(formattedDetails)}`);
    res.json({ success: true, details: formattedDetails });
  } catch (error) {
    log.error('Error fetching event details for dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dashboard routes
app.get('/dashboard', dashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Dashboard login page - GET handler
app.get('/dashboard/login', (req, res) => {
  // Check if user is already authenticated via cookie
  if (req.cookies?.dashboard_token) {
    return res.redirect('/dashboard');
  }
  
  // Display login form
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard Login</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
        <style>
            body {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background-color: #f0f2f5;
                font-family: Arial, sans-serif;
            }
            .login-container {
                background-color: white;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                width: 100%;
                max-width: 400px;
                text-align: center;
            }
            .logo {
                color: #128C7E;
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 20px;
            }
            .form-control {
                margin-bottom: 15px;
                padding: 10px;
            }
            .btn-primary {
                background-color: #128C7E;
                border-color: #128C7E;
                padding: 10px;
                width: 100%;
            }
            .btn-primary:hover {
                background-color: #075E54;
                border-color: #075E54;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">אירוע RSVP - כניסה למנהלים</div>
            <form method="POST" action="/dashboard/login">
                <div class="mb-3">
                    <input type="password" name="password" class="form-control" placeholder="סיסמת גישה" required>
                </div>
                <button type="submit" class="btn btn-primary">כניסה</button>
            </form>
            <p class="mt-3 text-muted">גישה מיועדת למנהלי האירוע בלבד</p>
        </div>
    </body>
    </html>
  `);
});

// Dashboard login processing
app.post('/dashboard/login', (req, res) => {
  try {
    log.info(`Dashboard login attempt from IP: ${req.ip}`);
    
    // Check if password is provided in the request body
    if (!req.body || !req.body.password) {
      log.warn(`Dashboard login failed: No password provided`);
      return res.status(400).send('Password is required');
    }
    
    // Forward to the auth middleware which will handle the login
    dashboardAuth(req, res, () => {
      log.info(`Dashboard login successful for IP: ${req.ip}`);
      res.redirect('/dashboard');
    });
  } catch (error) {
    log.error(`Dashboard login error: ${error.message}`);
    res.status(500).send('An error occurred during login');
  }
});

// Dashboard logout endpoint
app.get('/dashboard/logout', (req, res) => {
  log.info(`Dashboard logout for IP: ${req.ip}`);
  
  // Clear the cookie with all possible options to ensure it's removed
  res.clearCookie('dashboard_token'); // Simple clear
  
  // Also try with specific options
  res.clearCookie('dashboard_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  
  // Add debug header to confirm cookie was cleared
  res.setHeader('X-Cookie-Cleared', 'true');
  
  // Check if this is an API call or direct browser request
  const isApiCall = req.headers.accept && req.headers.accept.includes('application/json');
  
  if (isApiCall) {
    // If API call, return JSON response
    res.json({ success: true, message: 'Logged out successfully' });
  } else {
    // If direct browser access, redirect to login page
    res.redirect('/dashboard');
  }
});

// API endpoint to send message from dashboard
app.post('/api/send-message', dashboardAuth, express.json(), async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Missing phone or message' });
    }
    
    // Normalize phone number - ensure it has country code
    let normalizedPhone = phone.trim();
    if (!normalizedPhone.startsWith('+')) {
      // Add Israel country code if not present
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+972' + normalizedPhone.substring(1);
      } else {
        normalizedPhone = '+972' + normalizedPhone;
      }
    }
    
    // Send the message using WhatsApp client
    if (conn) {
      // Send message
      await conn.sendMessage(normalizedPhone + '@s.whatsapp.net', { text: message });
      
      log.info(`Dashboard: Message sent to ${normalizedPhone} via WhatsApp`);
      res.json({ success: true, message: 'Message sent successfully' });
    } else {
      log.error('Dashboard: WhatsApp client not connected');
      res.status(500).json({ success: false, error: 'WhatsApp client not connected' });
    }
  } catch (error) {
    log.error('Error sending message from dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  if (client && client.user) {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      botConnected: true,
      uptime: process.uptime()
    });
  } else {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      botConnected: false,
      uptime: process.uptime()
    });
  }
});

// Home page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Event RSVP Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .card {
          background: #f8f9fa;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        h1, h2 { color: #333; }
        .status {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 15px;
          font-weight: bold;
        }
        .connected {
          background-color: #d4edda;
          color: #155724;
        }
        .disconnected {
          background-color: #f8d7da;
          color: #721c24;
        }
        .mode {
          background-color: #cce5ff;
          color: #004085;
        }
        .button {
          display: inline-block;
          background-color: #128C7E;
          color: white;
          padding: 10px 15px;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
          margin-top: 10px;
        }
        .button:hover {
          background-color: #0C6B5B;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Event RSVP Bot</h1>
        <p>Status: 
          <span class="status ${client ? 'connected' : 'disconnected'}">
            ${client ? 'Connected' : 'Waiting for connection'}
          </span>
        </p>
        <p>Mode: 
          <span class="status mode">
            ${process.env.NODE_ENV || 'development'}
          </span>
        </p>
        <p>Server Time: ${new Date().toLocaleString()}</p>
      </div>
      
      <div class="card">
        <h2>Connection Instructions</h2>
        <p>To connect WhatsApp:</p>
        <ul>
          <li>Open the QR code page</li>
          <li>Scan the QR code with WhatsApp on your phone</li>
          <li>Once connected, you can use the admin commands</li>
        </ul>
        ${!client ? `<a href="/qr" class="button">Open QR Code Scanner</a>` : ''}
      </div>
      
      <div class="card">
        <h2>Guest Dashboard</h2>
        <p>View real-time information about your event guests:</p>
        <ul>
          <li>See confirmed, declined, and pending guests</li>
          <li>View total expected attendees</li>
          <li>Track response rates</li>
          <li>Search and filter the guest list</li>
        </ul>
        <a href="/dashboard" class="button">Open Guest Dashboard</a>
      </div>
      
      <div class="card">
        <h2>Admin Commands</h2>
        <ul>
          <li><strong>!status</strong> - Show event details and RSVP statistics</li>
          <li><strong>!eventdate</strong> - Show event date and messaging schedule</li>
          <li><strong>!sendrsvp</strong> - Manually send RSVP messages</li>
          <li><strong>!sendrsvpforce</strong> - Send to ALL guests</li>
          <li><strong>!clearcache</strong> - Clear the contacted guests cache</li>
          <li><strong>!reload</strong> - Refresh data from Google Sheets</li>
          <li><strong>!debugapi</strong> - Test API connection</li>
          ${process.env.NODE_ENV === 'development' ? '<li><strong>!test</strong> - Send a test message with buttons</li>' : ''}
        </ul>
      </div>
    </body>
    </html>
  `);
});

// API handling logic has been moved to the Google Apps Script

// Watch for file changes (useful during development)
function watchForChanges() {
  if (process.env.NODE_ENV === 'development') {
    fs.watchFile(__filename, () => {
      fs.unwatchFile(__filename);
      console.log('\x1b[0;32m'+__filename+' \x1b[1;32mupdated!\x1b[0m');
      process.exit(0);
    });
  }
}

// Start the bot and server
clientstart()
  .then(async (waClient) => {
    app.listen(serverPort, () => {
      log.info(`Web server running on port ${serverPort}`);
    });
    
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
          const buttons = [
            {buttonId: 'yes', buttonText: {displayText: 'Yes, I\'ll attend'}, type: 1},
            {buttonId: 'no', buttonText: {displayText: 'No, I can\'t attend'}, type: 1}
          ];
          
          const buttonMessage = {
            text: `*${eventDetails.name} - בדיקת הודעה*\n\nמנהל יקר,\n\nזוהי הזמנתRSVP לבדיקה:\n\n📅 תאריך: ${eventDetails.date}\n⏰ שעה: ${eventDetails.time}\n📍 מיקום: ${eventDetails.location}\n\n${eventDetails.description}\n\nהאם תוכלו להגיע`,
            footer: 'אנא השיב באמצעות הכפתורים למטה',
            buttons: buttons,
            headerType: 1,
            viewOnce: true
          };
          
          await waClient.sendMessage(adminPhone + '@s.whatsapp.net', buttonMessage);
          log.info(`Sent test RSVP message to admin (${adminPhone})`);
        } catch (error) {
          log.error('Error sending test message:', error);
        }
      }, 5000); // Wait 5 seconds for connection to establish
    }
    
    // Watch for file changes in development
    watchForChanges();
  })
  .catch(err => {
    log.error('Failed to start the bot:', err);
    process.exit(1);
  });