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

// Add the useMockData constant
const useMockData = process.env.USE_MOCK_DATA === 'true';
console.log(`Using mock data: ${useMockData ? 'Yes' : 'No'}`);

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Setup logging
const logFile = path.join(logDir, `bot-${new Date().toISOString().slice(0,10)}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Custom console logger that writes to file as well
const log = {
  info: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [INFO] ${message}\n`;
    console.log(message);
    logStream.write(logMessage);
  },
  error: (message, error) => {
    const timestamp = new Date().toISOString();
    const errorStack = error?.stack || error || 'No stack trace';
    const logMessage = `[${timestamp}] [ERROR] ${message}\n${errorStack}\n`;
    console.error(message, error);
    logStream.write(logMessage);
  },
  warn: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [WARN] ${message}\n`;
    console.warn(message);
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

      // Check if we're using mock data (regardless of environment)
      if (useMockData) {
        this.log.info('Using mock guest data');
        const mockGuests = [
          // Add admin phone for testing - with explicit different formats to debug
          {
            name: "Admin User (With +)",
            phone: process.env.ADMIN_NUMBERS?.split(',')[0] || "+972526901876",
            email: "admin@example.com",
            status: "Pending",
            count: "0",
            notes: "",
            lastContacted: ""
          },
          {
            name: "Admin User (Without +)",
            phone: (process.env.ADMIN_NUMBERS?.split(',')[0] || "+972526901876").replace('+', ''),
            email: "admin2@example.com",
            status: "Pending",
            count: "0",
            notes: "",
            lastContacted: ""
          }
        ];
        
        const adminPhone = process.env.ADMIN_NUMBERS?.split(',')[0] || "+972526901876";
        this.log.info(`Added admin phone ${adminPhone} to mock data for testing`);
        this.cachedGuests = mockGuests;
        this.lastFetchTime = now;
        return mockGuests;
      }
      
      // Make API request to Apps Script
      this.log.info(`Fetching guest list from Google Sheets: ${this.scriptUrl}`);
      const response = await axios.post(this.scriptUrl, {
        key: this.secretKey,
        operation: "get_guests"
      });
      
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
      this.log.error('Failed to fetch guest list:', error);
      // Return empty array or mock data if in development
      if (process.env.NODE_ENV === 'development') {
        this.log.info('Using fallback mock data due to error');
        return [
          {
            name: "Test User",
            phone: process.env.ADMIN_NUMBERS?.split(',')[0] || "+12345678901",
            email: "test@example.com",
            status: "Pending",
            count: "0",
            notes: "",
            lastContacted: ""
          }
        ];
      }
      return [];
    }
  }
  
  async updateGuestStatus(guestPhone, status, guestCount, notes = '') {
    try {
      // Format the phone number consistently
      const formattedPhone = this.formatPhoneNumber(guestPhone);
      
      // If using mock data, just log the update
      if (useMockData) {
        this.log.info(`[MOCK DATA] Would update guest status: ${formattedPhone} to ${status} with ${guestCount} guests`);
        
        // Update cached guests for testing
        if (this.cachedGuests) {
          const guestIndex = this.cachedGuests.findIndex(g => g.phone === formattedPhone);
          if (guestIndex >= 0) {
            this.cachedGuests[guestIndex].status = status;
            this.cachedGuests[guestIndex].count = guestCount.toString();
            this.cachedGuests[guestIndex].notes = notes;
            this.cachedGuests[guestIndex].lastContacted = new Date().toISOString();
          }
        }
        
        return true;
      }
      
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
      
      if (!response.data.success) {
        throw new Error(response.data.message || "Failed to update guest status");
      }
      
      // Invalidate cache
      this.cachedGuests = null;
      
      this.log.info(`Updated status for ${formattedPhone} to ${status} with ${guestCount} guests`);
      return true;
    } catch (error) {
      this.log.error(`Failed to update guest status: ${error.message}`, error);
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
      
      // Use mock data if specified
      if (useMockData) {
        this.log.info('Using mock event details');
        const mockEventDetails = {
          name: "Family Reunion",
          date: "June 15, 2025",
          time: "6:00 PM",
          location: "Grand Hotel, 123 Main St",
          description: "Join us for our family reunion! Food and drinks will be provided."
        };
        
        this.cachedEventDetails = mockEventDetails;
        this.lastFetchTime = now;
        return mockEventDetails;
      }
      
      // Make API request to Apps Script
      this.log.info(`Fetching event details from Google Sheets: ${this.scriptUrl}`);
      const response = await axios.post(this.scriptUrl, {
        key: this.secretKey,
        operation: "get_event_details"
      });
      
      if (!response.data.success) {
        throw new Error(response.data.message || "Failed to fetch event details");
      }
      
      const details = response.data.details;
      
      const eventDetails = {
        name: details.Name || "Event",
        date: details.Date || new Date().toLocaleDateString(),
        time: details.Time || "12:00 PM",
        location: details.Location || "TBD",
        description: details.Description || "Please RSVP for our event"
      };
      
      // Update cache
      this.cachedEventDetails = eventDetails;
      this.lastFetchTime = now;
      
      return eventDetails;
    } catch (error) {
      this.log.error(`Failed to get event details: ${error.message}`, error);
      
      // Return mock data in development mode or on error
      if (process.env.NODE_ENV === 'development') {
        return {
          name: "Family Reunion (Dev)",
          date: "June 15, 2025",
          time: "6:00 PM",
          location: "Grand Hotel, 123 Main St",
          description: "Join us for our family reunion! Food and drinks will be provided."
        };
      }
      
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

// Declare client at the top level so it's accessible in event handlers
let client = null;

// Setup Express server
const app = express();
const serverPort = process.env.PORT || 3000;

// Initialize Apps Script manager before clientstart
const appScriptManager = new AppsScriptManager(
  process.env.APPS_SCRIPT_URL || 'http://localhost:3000/mock',
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
  const SESSION_PATH = process.env.NODE_ENV === 'production' 
    ? path.join(__dirname, 'session')  // Production path
    : path.join(__dirname, 'local_session');  // Local path for development

  console.log('Using session path:', SESSION_PATH);

  // Ensure the directory exists
  try {
    if (!fs.existsSync(SESSION_PATH)) {
      fs.mkdirSync(SESSION_PATH, { recursive: true });
      console.log(`Created session directory at: ${SESSION_PATH}`);
    }
  } catch (err) {
    console.error(`Failed to create session directory: ${err.message}`);
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
        log.info('Starting RSVP message batch');
        
        // Ensure we have a valid connection
        if (!waClient.user) {
          log.warn('No active connection, skipping RSVP message batch');
          return;
        }
        
        // Get event details
        const eventDetails = await appScriptManager.getEventDetails();
        log.info(`Preparing messages for event: ${eventDetails.name}`);
        
        // Fetch the guest list
        const guests = await appScriptManager.fetchGuestList();
        log.info(`Found ${guests.length} potential guests to contact`);
        
        // Filter guests who haven't been contacted yet and haven't responded
        const pendingGuests = guests.filter(guest => 
          !contactedGuests.has(guest.phone) && 
          (guest.status === 'Pending' || guest.status === '')
        );
        
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
              {buttonId: 'yes', buttonText: {displayText: 'Yes, I\'ll attend'}, type: 1},
              {buttonId: 'no', buttonText: {displayText: 'No, I can\'t attend'}, type: 1}
            ];
            
            const buttonMessage = {
              text: `*${eventDetails.name} - RSVP Invitation*\n\nDear ${guest.name},\n\nYou're cordially invited to ${eventDetails.name}!\n\n📅 Date: ${eventDetails.date}\n⏰ Time: ${eventDetails.time}\n📍 Location: ${eventDetails.location}\n\n${eventDetails.description}\n\nWill you be able to attend?`,
              footer: 'Please respond using the buttons below',
              buttons: buttons,
              headerType: 1,
              viewOnce: true
            };
            
            // Send the message
            await waClient.sendMessage(guest.phone + '@s.whatsapp.net', buttonMessage);
            
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
        
        // Log incoming messages
        log.info(`Message from ${senderPhone}: ${m.text}`);
        // Check if this is a message sent as a response to our auto-responses 
        // by checking patterns that might indicate it's an auto-reply
        const possibleAutoReply = 
        (text && (text.includes("Thank you for letting us know") || 
                text.includes("We're sorry you can't make it") || 
                text.includes("I'm not sure I understand your response")));

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
          if (m.text === '!sendrsvp') {
            await waClient.sendMessage(m.chat, { text: "Starting RSVP message batch..." });
            await sendRSVPMessages(true);
            await waClient.sendMessage(m.chat, { text: "RSVP message batch completed!" });
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
          if (m.text === '!test' && process.env.NODE_ENV === 'development') {
            try {
              // Send a test message with buttons
              const buttons = [
                {buttonId: 'test_yes', buttonText: {displayText: 'Yes (Test)'}, type: 1},
                {buttonId: 'test_no', buttonText: {displayText: 'No (Test)'}, type: 1}
              ];
              
              const buttonMessage = {
                text: `*TEST MESSAGE*\n\nThis is a test RSVP invitation.\n\nWill you be able to attend the test event?`,
                footer: 'Please respond using the buttons below',
                buttons: buttons,
                headerType: 1,
                viewOnce: true
              };
              
              await waClient.sendMessage(m.chat, buttonMessage);
              log.info('Sent test message with buttons');
            } catch (error) {
              log.error('Error sending test message:', error);
              await waClient.sendMessage(m.chat, { 
                text: "Error sending test message. Check logs for details." 
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
              {buttonId: 'guest_1', buttonText: {displayText: '1 (Just me)'}, type: 1},
              {buttonId: 'guest_2', buttonText: {displayText: '2 people'}, type: 1},
              {buttonId: 'guest_more', buttonText: {displayText: '3 or more'}, type: 1}
            ];
            
            await waClient.sendMessage(m.chat, {
              text: "Great! How many people will be attending in total (including yourself)?",
              footer: 'Please select an option below',
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
                text: "Thank you for letting us know. We're sorry you can't make it!" 
              });
            } catch (error) {
              log.error(`Error updating decline status for ${senderPhone}:`, error);
              
              // Send generic acknowledgment if update fails
              await waClient.sendMessage(m.chat, { 
                text: "Thank you for your response!" 
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
                text: "Please reply with the total number of people attending (including yourself):" 
              });
              return;
            }
            
            try {
              // Update their status in the sheet
              await appScriptManager.updateGuestStatus(senderPhone, 'Confirmed', guestCount.toString());
              
              // Send confirmation
              await waClient.sendMessage(m.chat, { 
                text: `Thank you for confirming! We've noted that ${guestCount} ${guestCount === 1 ? 'person' : 'people'} will be attending.` 
              });
            } catch (error) {
              log.error(`Error updating confirm status for ${senderPhone}:`, error);
              
              // Send generic acknowledgment if update fails
              await waClient.sendMessage(m.chat, { 
                text: "Thank you for your RSVP! We've noted your attendance." 
              });
            }
            return;
          }
        }
        
        // Handle text responses
        if (!m.text) return;
        
        const text = m.text.toLowerCase().trim();
        
        // Manual Yes/No responses
        if (text === 'yes' || text.includes('yes i') || text.includes('i will') || 
          text.includes('i am coming') || text.includes('i\'ll attend')) {
          
          // This is an acceptance but we need to ask for the number of guests
          const buttons = [
            {buttonId: 'guest_1', buttonText: {displayText: '1 (Just me)'}, type: 1},
            {buttonId: 'guest_2', buttonText: {displayText: '2 people'}, type: 1},
            {buttonId: 'guest_more', buttonText: {displayText: '3 or more'}, type: 1}
          ];
          
          await waClient.sendMessage(m.chat, {
            text: "Great! How many people will be attending in total (including yourself)?",
            footer: 'Please select an option below',
            buttons: buttons,
            headerType: 1,
            viewOnce: true
          });
          
          return;
        }
        
        if (text === 'no' || text.includes('cannot') || text.includes("can't") || 
          text.includes('not attend') || text.includes('won\'t be')) {
          
          // This is a decline
          try {
            // Update their status in the sheet
            await appScriptManager.updateGuestStatus(senderPhone, 'Declined', '0');
            
            // Send acknowledgment
            await waClient.sendMessage(m.chat, { 
              text: "Thank you for letting us know. We're sorry you can't make it!" 
            });
          } catch (error) {
            log.error(`Error updating decline status for ${senderPhone}:`, error);
            
            // Send generic acknowledgment if update fails
            await waClient.sendMessage(m.chat, { 
              text: "Thank you for your response!" 
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
              text: `Thank you for confirming! We've noted that ${guestCount} ${guestCount === 1 ? 'person' : 'people'} will be attending.` 
            });
          } catch (error) {
            log.error(`Error updating confirm status for ${senderPhone}:`, error);
            
            // Send generic acknowledgment if update fails
            await waClient.sendMessage(m.chat, { 
              text: "Thank you for your response! We've noted your attendance." 
            });
          }
          
          return;
        }
        
        // If we couldn't determine a clear response
        if (text.includes('rsvp') || text.includes('attend') || text.includes('coming')) {
          // This is probably related to the RSVP
          await waClient.sendMessage(m.chat, { 
            text: "I'm not sure I understand your response. Please reply with 'Yes' if you're attending, or 'No' if you can't attend. If you're attending, please also let me know how many people total will be coming." 
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
        log.info('!status - Show current bot status and event details');
        log.info('!reload - Reload guest list from Google Sheets');
        if (process.env.NODE_ENV === 'development') {
          log.info('!test - Send a test RSVP message (development only)');
        }
      }
      // Enhanced QR code logging
      else if (update.qr) {
        // Log QR to console
        qrcode.toString(update.qr, { type: 'terminal', small: true }, (err, text) => {
          if (!err) {
            log.info('\n\n==== WHATSAPP QR CODE (SCAN WITH PHONE) ====');
            console.log('\x1b[36m%s\x1b[0m', text); // Cyan color for visibility
            log.info('============================================');
            log.info('Scan this QR code with WhatsApp to connect your bot');
            log.info('If you cannot see the QR code clearly, check your terminal settings or try a different terminal');
          } else {
            log.error('Failed to generate QR code:', err);
          }
        });
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
            shouldReconnect = false;
          }
        }
        
        if (shouldReconnect) {
          log.info('Reconnecting...');
          return clientstart(); // Try to reconnect
        }
      }
    });
    
    // Handle connection heartbeat to ensure connection stays alive
    setInterval(async () => {
      if (waClient.user) {
        try {
          // Send a ping to keep the connection alive
          await waClient.sendPresenceUpdate('available');
        } catch (error) {
          log.warn('Heartbeat failed, connection may be unstable');
        }
      }
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
          <li>Check the console/terminal for QR code</li>
          <li>Scan the QR code with WhatsApp on your phone</li>
          <li>Once connected, you can use the admin commands</li>
        </ul>
      </div>
      
      <div class="card">
        <h2>Admin Commands</h2>
        <ul>
          <li><strong>!status</strong> - Show event details and RSVP statistics</li>
          <li><strong>!sendrsvp</strong> - Manually send RSVP messages</li>
          <li><strong>!reload</strong> - Refresh data from Google Sheets</li>
          ${process.env.NODE_ENV === 'development' ? '<li><strong>!test</strong> - Send a test message with buttons</li>' : ''}
        </ul>
      </div>
    </body>
    </html>
  `);
});

// Mock API for development testing
if (process.env.NODE_ENV === 'development') {
  app.post('/mock', (req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        log.info('Mock API received:', data);
        
        // Handle operations
        if (data.operation === 'get_guests') {
          res.json({
            success: true,
            guests: [
              {
                Name: "John Smith",
                Phone: "+15551234567",
                Email: "john@example.com",
                Status: "Pending",
                GuestCount: "",
                Notes: "",
                LastContacted: ""
              },
              {
                Name: "Jane Doe",
                Phone: "+15557654321",
                Email: "jane@example.com",
                Status: "Pending",
                GuestCount: "",
                Notes: "",
                LastContacted: ""
              },
              {
                Name: "Test Admin",
                Phone: process.env.ADMIN_NUMBERS?.split(',')[0] || "+12345678901",
                Email: "admin@example.com",
                Status: "Pending",
                GuestCount: "",
                Notes: "",
                LastContacted: ""
              }
            ]
          });
        } 
        else if (data.operation === 'get_event_details') {
          res.json({
            success: true,
            details: {
              Name: "Family Reunion (Mock)",
              Date: "June 15, 2025",
              Time: "6:00 PM",
              Location: "Grand Hotel, 123 Main St",
              Description: "Join us for our family reunion! Food and drinks will be provided."
            }
          });
        }
        else if (data.operation === 'update_status') {
          res.json({
            success: true,
            message: "Status updated successfully"
          });
        }
        else {
          res.json({
            success: false,
            message: "Unknown operation"
          });
        }
      } catch (e) {
        res.json({
          success: false,
          message: "Invalid request: " + e.message
        });
      }
    });
  });
}

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
            text: `*${eventDetails.name} - RSVP Invitation (TEST)*\n\nDear Admin,\n\nThis is a test message:\n\n📅 Date: ${eventDetails.date}\n⏰ Time: ${eventDetails.time}\n📍 Location: ${eventDetails.location}\n\n${eventDetails.description}\n\nWill you be able to attend?`,
            footer: 'Please respond using the buttons below',
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