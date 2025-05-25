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
import cookieParser from 'cookie-parser';
import dashboardAuth from './utils/dashboardAuth.js';
import { EventEmitter } from 'events';
import { calculateDaysRemaining, filterGuestsByEventProximity, getMessageByProximity } from './utils/eventScheduler.js';
import { getActiveCustomers } from './utils/customerManager.js';
import { createAppScriptManager } from './utils/multiTenantSheets.js';
import { mapGuestToCustomer } from './utils/guestMap.js';
import adminRoutes from './routes/adminRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import uploadRoutes from './upload-invitation-image.js';

// Import all Baileys functions via dynamic import to handle ES Module vs CommonJS compatibility
import * as baileysImport from '@nstar/baileys';
// Import FileType once for dynamic file-type detection
import * as fileTypeImport from 'file-type';
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
const FileType = fileTypeImport.default || fileTypeImport;

const args = process.argv.slice(2);
const shouldSendTestMessage = args.includes('--test-message') || process.env.TEST_MESSAGE === 'true';
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

// Utility functions (migrated from removed lib directory)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getBuffer = async (url) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary');
};
const smsg = (conn, m, hasParent) => {
  if (!m) return m;
  let M = proto.WebMessageInfo;
  m = M.fromObject(m);
  if (m.key) {
    m.id = m.key.id;
    m.isBaileys = m.id && m.id.length === 16 || m.id.startsWith('3EB0') && m.id.length === 12 || false;
    m.chat = conn.decodeJid(m.key.remoteJid || message.message?.senderKeyDistributionMessage?.groupId || '');
    m.isGroup = m.chat.endsWith('@g.us');
    m.sender = conn.decodeJid(m.key.fromMe && conn.user.id || m.participant || m.key.participant || m.chat || '');
    m.fromMe = m.key.fromMe || false;
  }
  return m;
};

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error('Uncaught Exception:', err);
});

console.clear();
console.log('Starting Event RSVP Bot...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

// Initialize the application

// Create logs directory if it doesn't exist (only for non-production)
const logDir = path.join(__dirname, 'logs');
if (process.env.NODE_ENV !== 'production') {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

// Setup logging stream
let logStream;
if (process.env.NODE_ENV === 'production') {
  // In containers, write logs to stdout
  logStream = process.stdout;
} else {
  const logFile = path.join(logDir, `bot-${new Date().toISOString().slice(0,10)}.log`);
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
}

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
  constructor(scriptUrl, secretKey, logFn = console.log, customerId = null) {
    this.scriptUrl = scriptUrl;
    this.secretKey = secretKey;
    this.log = logFn;
    this.customerId = customerId;
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
      
      // Try with key parameter (original format)
      try {
        const response = await axios.post(this.scriptUrl, {
          key: this.secretKey,
          operation: "get_guests"
        });
        
        // NEW LOGGING - Log API response
        this.log.info(`API response status: ${response.status}`);
        this.log.info(`API response data: ${JSON.stringify(response.data)}`);
        
        if (response.data.success) {
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
        }
      } catch (error) {
        this.log.warn(`First request format failed: ${error.message}`);
      }
      
      // Try with secretKey and action parameter (new format)
      try {
        const response = await axios.post(this.scriptUrl, {
          secretKey: this.secretKey,
          action: "getGuests"
        });
        
        this.log.info(`Second format API response status: ${response.status}`);
        this.log.info(`Second format API response data: ${JSON.stringify(response.data)}`);
        
        if (response.data.success) {
          // Format the data
          const guests = response.data.guests.map(guest => ({
            name: guest.name || guest.Name || '',
            phone: this.formatPhoneNumber(guest.phone || guest.Phone || ''),
            email: guest.email || guest.Email || '',
            status: guest.status || guest.Status || 'Pending',
            count: guest.guestCount || guest.GuestCount || '0',
            notes: guest.notes || guest.Notes || '',
            lastContacted: guest.lastContacted || guest.LastContacted || ''
          })).filter(guest => guest.phone); // Only include guests with phone numbers
          
          // Update cache
          this.cachedGuests = guests;
          this.lastFetchTime = now;
          
          this.log.info(`Fetched ${guests.length} guests from Apps Script (second format)`);
          return guests;
        }
      } catch (error) {
        this.log.warn(`Second request format failed: ${error.message}`);
      }
      
      // If we get here, both requests failed
      throw new Error("Failed to fetch guest list - all request formats failed");
      
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
      
      // Make API request to Apps Script - try multiple formats
      this.log.info(`Updating guest status in Apps Script: ${formattedPhone}`);
      
      // Try with key parameter (original format)
      try {
        const response = await axios.post(this.scriptUrl, {
          key: this.secretKey,
          operation: "update_status",
          phone: formattedPhone,
          status: status,
          guestCount: guestCount.toString(),
          notes: notes
        });
        
        // NEW LOGGING - Log response
        this.log.info(`Update response: ${JSON.stringify(response.data)}`);
        
        if (response.data.success) {
          // Invalidate cache
          this.cachedGuests = null;
          
          this.log.info(`Updated status for ${formattedPhone} to ${status} with ${guestCount} guests`);
          return true;
        }
      } catch (error) {
        this.log.warn(`First update status request format failed: ${error.message}`);
      }
      
      // Try with secretKey parameter (new format)
      try {
        const response = await axios.post(this.scriptUrl, {
          secretKey: this.secretKey,
          action: "updateGuestStatus",
          phone: formattedPhone,
          status: status,
          guestCount: guestCount.toString(),
          notes: notes
        });
        
        this.log.info(`Second format update response: ${JSON.stringify(response.data)}`);
        
        if (response.data.success) {
          // Invalidate cache
          this.cachedGuests = null;
          
          this.log.info(`Updated status for ${formattedPhone} to ${status} with ${guestCount} guests (second format)`);
          return true;
        }
      } catch (error) {
        this.log.warn(`Second update status request format failed: ${error.message}`);
      }
      
      // If we get here, both requests failed
      throw new Error("Failed to update guest status - all request formats failed");
      
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
    console.log(`[AppsScriptManager] Formatting phone number: ${phone}`);
    
    if (!phone) {
      console.log('[AppsScriptManager] Phone number is empty or null');
      return '';
    }
    
    // Remove all non-numeric characters except +
    let cleaned = String(phone).replace(/[^\d+]/g, '');
    console.log(`[AppsScriptManager] After removing non-numeric chars: ${cleaned}`);
    
    // Remove + if it exists, we'll add it back later
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
      console.log(`[AppsScriptManager] Removed + prefix: ${cleaned}`);
    }
    
    // Handle empty or too short numbers
    if (cleaned.length < 9) {
      console.log(`[AppsScriptManager] Number too short: ${cleaned}`);
      return '';
    }
    
    // For Israeli numbers:
    if (cleaned.startsWith('972')) {
      // Already has country code
      console.log(`[AppsScriptManager] Already has 972 prefix: ${cleaned}`);
    } else if (cleaned.startsWith('0')) {
      // Convert Israeli format (0XX-XXX-XXXX) to international
      cleaned = '972' + cleaned.substring(1);
      console.log(`[AppsScriptManager] Converted 0 prefix to 972: ${cleaned}`);
    } else if (cleaned.length === 9) {
      // Assuming this is an Israeli number without prefix
      cleaned = '972' + cleaned;
      console.log(`[AppsScriptManager] Added 972 to 9-digit number: ${cleaned}`);
    } else if (cleaned.length === 10) {
      // If it starts with 05, assume it's an Israeli mobile number
      if (cleaned.startsWith('05')) {
        cleaned = '972' + cleaned.substring(1);
        console.log(`[AppsScriptManager] Converted Israeli mobile number: ${cleaned}`);
      } else {
        // Non-Israeli 10-digit number, preserve as is but add 972
        cleaned = '972' + cleaned;
        console.log(`[AppsScriptManager] Added 972 to 10-digit number: ${cleaned}`);
      }
    }
    
    // Add the + prefix
    cleaned = '+' + cleaned;
    console.log(`[AppsScriptManager] Added + prefix: ${cleaned}`);
    
    // Allow both 9 and 10 digit numbers after the +972 prefix
    if (!/^\+972\d{8,9}$/.test(cleaned)) {
      console.warn(`[AppsScriptManager] Invalid phone number format after cleaning: ${cleaned}`);
      return '';
    }
    
    console.log(`[AppsScriptManager] Final formatted number: ${cleaned}`);
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
      
      // Make API request to Apps Script - try multiple formats
      this.log.info(`Fetching event details from Google Sheets: ${this.scriptUrl}`);
      
      // Try with key parameter and operation (original format)
      try {
        const response = await axios.post(this.scriptUrl, {
          key: this.secretKey,
          operation: "get_event_details"
        });
        
        // NEW LOGGING - Log response
        this.log.info(`Event details response: ${JSON.stringify(response.data)}`);
        
        if (response.data.success) {
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
        }
      } catch (error) {
        this.log.warn(`First event details request format failed: ${error.message}`);
      }
      
      // Try with secretKey parameter and action (new format)
      try {
        const response = await axios.post(this.scriptUrl, {
          secretKey: this.secretKey,
          action: "getEventDetails" 
        });
        
        this.log.info(`Second format event details response status: ${response.status}`);
        this.log.info(`Second format event details response data: ${JSON.stringify(response.data)}`);
        
        if (response.data.success) {
          const details = response.data.details;
          
          // Support both uppercase and lowercase property names
          const eventDetails = {
            name: details.Name || details.name || "Event",
            date: details.Date || details.date || new Date().toLocaleDateString(),
            // Fix the time format from Google Sheets
            time: typeof (details.Time || details.time) === 'string' && (details.Time || details.time || '').includes('T') ? 
              new Date(details.Time || details.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
              details.Time || details.time || "12:00 PM",
            location: details.Location || details.location || "TBD",
            description: details.Description || details.description || "Please RSVP for our event"
          };
          
          // Update cache
          this.cachedEventDetails = eventDetails;
          this.lastFetchTime = now;
          
          return eventDetails;
        }
      } catch (error) {
        this.log.warn(`Second event details request format failed: ${error.message}`);
      }
      
      // If we get here, both requests failed
      throw new Error("Failed to fetch event details - all request formats failed");
      
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

/**
 * Load customer-specific invitation image if available, fallback to default
 * @param {string} customerId - The customer ID to load image for
 * @returns {Buffer|null} - The image buffer or null if no image found
 */
function loadInvitationImage(customerId = null) {
  try {
    // Only load customer-specific image, no fallback
    if (customerId) {
      const customerImagePath = path.join(__dirname, 'data', 'images', `${customerId}.jpeg`);
      if (fs.existsSync(customerImagePath)) {
        log.info(`Loading customer-specific invitation image for customer ${customerId}`);
        return fs.readFileSync(customerImagePath);
      }
      log.info(`No invitation image found for ${customerId}`);
    }
    
    // Return null if no image is found
    return null;
  } catch (error) {
    log.error('Failed to load invitation image:', error);
    return null;
  }
}

// Load the default invitation image
let invitationImage = loadInvitationImage();

// Declare client at the top level so it's accessible in event handlers
let client = null;
/**
 * Send message with automatic reconnect on WebSocket closure (status 428)
 * @param {string} jid
 * @param {object} msg
 */
async function sendWithReconnect(jid, msg) {
  try {
    return await client.sendMessage(jid, msg);
  } catch (err) {
    if (err.isBoom && err.output?.statusCode === 428) {
      log.warn('WebSocket closed, reconnecting...');
      client = await clientstart();
      return await client.sendMessage(jid, msg);
    }
    throw err;
  }
}

// Setup Express server
const app = express();
// Health status flag
let botConnected = false;
// Health-check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', botConnected });
});
const serverPort = process.env.PORT || 8080; // Use Railway.app default port 

// Initialize global event emitter for communication between components
global.eventEmitter = new EventEmitter();

// Store the latest QR code
let lastQR = null;

// Initialize Apps Script manager before clientstart (env-vars are guaranteed)
const appScriptManager = new AppsScriptManager(
  process.env.APPS_SCRIPT_URL,
  process.env.SECRET_KEY,
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
    // Track WhatsApp connection status
    waClient.ev.on('connection.update', update => {
      const conn = update.connection;
      if (conn === 'open') {
        botConnected = true;
      } else if (conn === 'close') {
        botConnected = false;
      }
    });

    // In-memory map of guest phone to customer for live replies
    const replyCustomerMap = new Map();
    
    // Helper function to send RSVP messages across all customers
    const sendRSVPMessages = async (forced = false) => {
      try {
        const customers = getActiveCustomers();
        log.info(`Starting RSVP batches for ${customers.length} customers`);
        if (!waClient.user) {
          log.warn('No active connection, aborting RSVP batches');
          return;
        }
        for (const cust of customers) {
          const mgr = createAppScriptManager(cust.id);
          if (!mgr) {
            log.warn(`Skipping customer ${cust.id}, missing credentials`);
            continue;
          }
          log.info(`Batch for ${cust.name} (${cust.id})`);
          const details = await mgr.getEventDetails();
          log.info(`Event: ${details.name}`);
          const eventDate = process.env.EVENT_DATE || details.date;
          const daysRemaining = calculateDaysRemaining(eventDate);
          log.info(`Days until event: ${daysRemaining}`);
          const guests = await mgr.getGuests();
          let pending = forced
            ? guests.filter(g => !contactedGuests.has(g.phone) && (!g.status || g.status === 'Pending'))
            : filterGuestsByEventProximity(guests, eventDate, contactedGuests);
          if (!forced && pending.length === 0 && daysRemaining > 0) {
            log.info(`No messages for ${cust.id} today`);
            continue;
          }
          pending = pending.slice(0, MESSAGE_BATCH_SIZE);
          for (const g of pending) {
            const messageText = getMessageByProximity(daysRemaining, details, g.name);
            const buttons = [
              { buttonId: 'yes', buttonText: { displayText: 'כן, אני מגיע/ה' }, type: 1 },
              { buttonId: 'no', buttonText: { displayText: 'לא אוכל להגיע' }, type: 1 },
              { buttonId: 'maybe', buttonText: { displayText: 'לא בטוח/ה, תשאל אותי מחר' }, type: 1 }
            ];
            const msg = { text: messageText, footer: 'אנא השיבו באמצעות הכפתורים למטה', buttons, headerType: 1, viewOnce: true };
            const to = (g.phone.startsWith('+') ? g.phone.substring(1) : g.phone) + '@s.whatsapp.net';
            await waClient.sendMessage(to, msg);
            
            // Map the phone number in the same format that will come back in responses
            // WhatsApp removes the + prefix, so we need to map both formats
            const phoneForMapping = g.phone.startsWith('+') ? g.phone.substring(1) : g.phone;
            const phoneWithPlus = phoneForMapping.startsWith('+') ? phoneForMapping : '+' + phoneForMapping;
            
            log.info(`[MAPPING] Guest: ${g.name}, Original: ${g.phone}, ForMapping: ${phoneForMapping}, WithPlus: ${phoneWithPlus}`);
            
            // Map both formats to ensure we can find the guest regardless of format
            mapGuestToCustomer(phoneForMapping, cust.id, g.name);
            mapGuestToCustomer(phoneWithPlus, cust.id, g.name);
            
            contactedGuests.add(g.phone);
            await sleep(MESSAGE_DELAY);
          }
        }
      } catch (err) {
        log.error('sendRSVPMessages error:', err);
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
        
        // Get the sender's phone number and normalize format
        let senderPhone = m.sender.split('@')[0];
        
        // Normalize phone number format to match what we store in guest mappings
        if (!senderPhone.startsWith('+')) {
          senderPhone = '+' + senderPhone;
        }
        
        log.info(`[DEBUG] Extracted senderPhone: ${senderPhone} from ${m.sender}`);
        
        // Check if the message is from the bot's own number (auto-reply from WhatsApp)
        if (waClient.user && senderPhone === waClient.user.id.split(':')[0]) {
          log.info(`Ignoring message from bot's own number: ${senderPhone}`);
          return;
        }
        
        // Better handling of message text
        let messageText = '';
        
        // Extract message text from various possible message types
        try {
          if (m.text) {
            messageText = m.text;
          } else if (m.message?.conversation) {
            messageText = m.message.conversation;
          } else if (m.message?.extendedTextMessage?.text) {
            messageText = m.message.extendedTextMessage.text;
          } else if (mek.message?.conversation) {
            messageText = mek.message.conversation;
          } else if (mek.message?.extendedTextMessage?.text) {
            messageText = mek.message.extendedTextMessage.text;
          }
          
          // Assign to m.text for compatibility with existing code
          m.text = messageText;
        } catch (err) {
          log.error(`Error extracting message text: ${err.message}`);
        }
        
        // Log incoming messages
        log.info(`Message from ${senderPhone}: ${messageText}`);
        
        // Define text variable for processing
        const text = messageText ? messageText.toLowerCase().trim() : '';
        
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
        
        // Enhanced logging to debug command processing
        if (isAdmin && m.text && m.text.startsWith('!')) {
          log.info(`Admin command received: ${m.text}`);
          log.info(`Admin phone numbers configured: ${ADMIN_NUMBERS.join(', ')}`);
        }
        
        if (isAdmin) {
          // Process admin commands in a more structured way
          const cmd = m.text ? m.text.trim() : '';
          
          // Command handler for better logging and reliability
          const handleCommand = async (command, handler) => {
            if (cmd === command) {
              log.info(`Executing admin command: ${command}`);
              try {
                await handler();
              } catch (error) {
                log.error(`Error executing ${command}:`, error);
                await waClient.sendMessage(m.chat, { 
                  text: `Error executing command ${command}: ${error.message}` 
                });
              }
              return true;
            }
            return false;
          };
          
          // Handle each command in sequence
          let commandHandled = false;
          
          // !followups command
          commandHandled = await handleCommand('!followups', async () => {
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
          });
          
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
          
          // List available customers command
          if (m.text === '!listcustomers' || m.text === '!customers') {
            try {
              // Import necessary modules for customer management
              const { getActiveCustomers, getCustomerById } = await import('./utils/customerManager.js');
              
              // Get all active customers
              const activeCustomers = getActiveCustomers();
              
              if (activeCustomers.length === 0) {
                await waClient.sendMessage(m.chat, { text: "No active customers found in the system." });
                return;
              }
              
              // Build a list of customers
              let message = "*Available Customers*\n\n";
              
              activeCustomers.forEach((customer, index) => {
                const daysRemaining = calculateDaysRemaining(customer.eventDate);
                const daysInfo = daysRemaining >= 0 ? 
                  `${daysRemaining} days remaining` : 
                  `${Math.abs(daysRemaining)} days ago`;
                  
                message += `${index + 1}. *${customer.name}* (${customer.eventName})\n`;
                message += `   ID: \`${customer.id}\`\n`;
                message += `   Date: ${customer.eventDate} (${daysInfo})\n`;
                message += `   Phone: ${customer.phone}\n\n`;
              });
              
              message += "To send RSVP to a specific customer, use: !sendrsvpforce [customer_id]";
              
              await waClient.sendMessage(m.chat, { text: message });
            } catch (error) {
              log.error('Error listing customers:', error);
              await waClient.sendMessage(m.chat, { 
                text: `Error: ${error.message}` 
              });
            }
            return;
          }
          
          // Check if the message is a response to our RSVP buttons

          // Enhanced force command that can target specific customers
          if (m.text.startsWith('!sendrsvpforce')) {
            try {
              // Extract customer ID if provided (format: !sendrsvpforce [customerID])
              const parts = m.text.split(' ');
              const targetCustomerId = parts.length > 1 ? parts[1] : null;
              
              // Import necessary modules for customer management
              const { getActiveCustomers, getCustomerById } = await import('./utils/customerManager.js');
              
              // If no specific customer ID provided, get all active customers
              if (!targetCustomerId) {
                await waClient.sendMessage(m.chat, { text: "Forcing RSVP messages to ALL guests across all customers..." });
                
                // Get all active customers
                const activeCustomers = getActiveCustomers();
                
                if (activeCustomers.length === 0) {
                  await waClient.sendMessage(m.chat, { text: "No active customers found in the system." });
                  return;
                }
                
                // Loop through each customer and execute the command
                let processedCount = 0;
                for (const customer of activeCustomers) {
                  await waClient.sendMessage(m.chat, { 
                    text: `Processing customer: ${customer.name} (${customer.eventName})` 
                  });
                  
                  try {
                    // Use the reusable utility function for each customer
                    const result = await executeRsvpForceCommand(waClient, customer, m.chat);
                    if (result.success) {
                      processedCount++;
                    }
                  } catch (customerError) {
                    log.error(`Error processing customer ${customer.id}:`, customerError);
                    await waClient.sendMessage(m.chat, { 
                      text: `Error processing customer ${customer.name}: ${customerError.message}` 
                    });
                  }
                }
                
                await waClient.sendMessage(m.chat, { 
                  text: `Completed processing ${processedCount} of ${activeCustomers.length} customers` 
                });
                return;
              }
              
              // Process specific customer if ID was provided
              const targetCustomer = getCustomerById(targetCustomerId);
              
              if (!targetCustomer) {
                await waClient.sendMessage(m.chat, { 
                  text: `Customer with ID ${targetCustomerId} not found. Use !customers to see available customers.` 
                });
                return;
              }
              
              // Use the reusable utility function for the specific customer
              await executeRsvpForceCommand(waClient, targetCustomer, m.chat);
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
              
              // Try to load customer-specific invitation image
              const customerImage = loadInvitationImage(appScriptManager.customerId);

              // Create message with image if available
              let buttonMessage;
              if (customerImage) {
                buttonMessage = {
                  image: customerImage,
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
          
          // Debug guest mappings command
          if (m.text === '!guestmap') {
            try {
              const { findCustomerForGuest } = await import('./utils/guestMap.js');
              const { getActiveCustomers } = await import('./utils/customerManager.js');
              
              await waClient.sendMessage(m.chat, { text: "🔍 Checking guest mappings..." });
              
              const customers = getActiveCustomers();
              let report = "*Guest Mapping Report*\n\n";
              
              for (const customer of customers) {
                const mgr = createAppScriptManager(customer.id);
                if (!mgr) continue;
                
                try {
                  const guests = await mgr.getGuests();
                  report += `*Customer: ${customer.name} (${customer.id})*\n`;
                  report += `Guests: ${guests.length}\n`;
                  
                  guests.slice(0, 3).forEach(guest => {
                    const mappedCustomer = findCustomerForGuest(guest.phone);
                    report += `  📱 ${guest.phone} → ${mappedCustomer || 'NOT MAPPED'}\n`;
                  });
                  
                  if (guests.length > 3) {
                    report += `  ... and ${guests.length - 3} more\n`;
                  }
                  report += '\n';
                } catch (error) {
                  report += `*Customer: ${customer.name}* - Error: ${error.message}\n\n`;
                }
              }
              
              await waClient.sendMessage(m.chat, { text: report });
            } catch (error) {
              log.error('Error in guestmap command:', error);
              await waClient.sendMessage(m.chat, { 
                text: `Error checking guest mappings: ${error.message}` 
              });
            }
            return;
          }
          
          // NEW CODE - Debug API Command
          if (m.text === '!debugapi') {
            try {
              log.info('Testing multi-tenant API connection...');
              await waClient.sendMessage(m.chat, { text: "🔍 Testing multi-tenant API connections..." });
              
              const { getActiveCustomers } = await import('./utils/customerManager.js');
              const customers = getActiveCustomers();
              
              let report = "*API Connection Test Results*\n\n";
              
              for (const customer of customers) {
                report += `*Customer: ${customer.name} (${customer.id})*\n`;
                
                try {
                  const mgr = createAppScriptManager(customer.id);
                  if (!mgr) {
                    report += `❌ No manager created (missing credentials)\n\n`;
                    continue;
                  }
                  
                  // Test getting guests
                  try {
                    const guests = await mgr.getGuests();
                    report += `✅ Guests: ${guests.length}\n`;
                    
                    if (guests.length > 0) {
                      const firstGuest = guests[0];
                      report += `  📱 Sample: ${firstGuest.name} (${firstGuest.phone})\n`;
                      
                      // Test phone number mapping
                      const { findCustomerForGuest } = await import('./utils/guestMap.js');
                      const mappedCustomer = findCustomerForGuest(firstGuest.phone);
                      report += `  🔗 Mapped to: ${mappedCustomer || 'NOT MAPPED'}\n`;
                    }
                  } catch (guestError) {
                    report += `❌ Guests error: ${guestError.message}\n`;
                  }
                  
                  // Test getting event details
                  try {
                    const details = await mgr.getEventDetails();
                    report += `✅ Event: ${details.name || 'No name'}\n`;
                  } catch (detailsError) {
                    report += `❌ Details error: ${detailsError.message}\n`;
                  }
                  
                  // Test updating guest status with a dummy phone
                  try {
                    const testPhone = '+972501234567';
                    const result = await mgr.updateGuestStatus(testPhone, 'Test', 1, 'API test');
                    report += `✅ Update test: ${result.success ? 'Success' : 'Failed'}\n`;
                  } catch (updateError) {
                    report += `❌ Update error: ${updateError.message}\n`;
                  }
                  
                } catch (error) {
                  report += `❌ General error: ${error.message}\n`;
                }
                report += '\n';
              }
              
              await waClient.sendMessage(m.chat, { text: report });
              return;
            } catch (error) {
              log.error('Error in debugapi command:', error);
              await waClient.sendMessage(m.chat, { 
                text: `Debug error: ${error.message}` 
              });
            }
          }
          
          // Phone lookup test command
          if (m.text.startsWith('!phonetest ')) {
            try {
              const testPhone = m.text.substring(11); // Remove '!phonetest '
              await waClient.sendMessage(m.chat, { text: `🔍 Testing phone lookup for: ${testPhone}` });
              
              const { findCustomerIdByPhone } = await import('./utils/phoneUtils.js');
              const { formatPhoneNumber } = await import('./utils/numberFormatter.js');
              const { findCustomerForGuest } = await import('./utils/guestMap.js');
              
              // Test different formats
              const originalPhone = testPhone;
              const formattedPhone = formatPhoneNumber(testPhone);
              const normalizedPhone = testPhone.startsWith('+') ? testPhone : '+' + testPhone;
              
              let report = "*Phone Lookup Test Results*\n\n";
              report += `Original: ${originalPhone}\n`;
              report += `Formatted: ${formattedPhone}\n`;
              report += `Normalized: ${normalizedPhone}\n\n`;
              
              // Test customer lookup
              const customerId1 = findCustomerIdByPhone(originalPhone);
              const customerId2 = findCustomerIdByPhone(formattedPhone);
              const customerId3 = findCustomerIdByPhone(normalizedPhone);
              
              report += `Customer lookup results:\n`;
              report += `- Original → ${customerId1 || 'NOT FOUND'}\n`;
              report += `- Formatted → ${customerId2 || 'NOT FOUND'}\n`;
              report += `- Normalized → ${customerId3 || 'NOT FOUND'}\n\n`;
              
              // Test guest mapping
              const guestCustomer1 = findCustomerForGuest(originalPhone);
              const guestCustomer2 = findCustomerForGuest(formattedPhone);
              const guestCustomer3 = findCustomerForGuest(normalizedPhone);
              
              report += `Guest mapping results:\n`;
              report += `- Original → ${guestCustomer1 || 'NOT MAPPED'}\n`;
              report += `- Formatted → ${guestCustomer2 || 'NOT MAPPED'}\n`;
              report += `- Normalized → ${guestCustomer3 || 'NOT MAPPED'}\n`;
              
              await waClient.sendMessage(m.chat, { text: report });
              return;
            } catch (error) {
              await waClient.sendMessage(m.chat, { 
                text: `Phone test error: ${error.message}` 
              });
            }
            return;
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
              await waClient.sendMessage(m.chat, { 
                text: `Debug error: ${error.message}` 
              });
            }
            return;
          }
          
          // New diagnostics command for troubleshooting data issues
          if (m.text === '!diagnose') {
            try {
              await waClient.sendMessage(m.chat, { 
                text: "🔍 Running diagnostics... Please wait." 
              });
              
              // Import necessary utilities
              const { ensureDataAccess, validateJsonFile } = await import('./utils/fixDataAccess.js');
              const fs = await import('fs');
              const path = await import('path');
              const { getActiveCustomers } = await import('./utils/customerManager.js');
              
              // Define paths
              const dataDir = path.default.join(process.cwd(), 'data');
              const customersFile = path.default.join(dataDir, 'customers.json');
              const credentialsFile = path.default.join(dataDir, 'credentials.json');
              
              // Check data directory
              const dirExists = fs.default.existsSync(dataDir);
              const dirStats = dirExists ? fs.default.statSync(dataDir) : null;
              const dirPerms = dirStats ? (dirStats.mode & parseInt('777', 8)).toString(8) : 'n/a';
              
              // Check customer file
              const custFileExists = fs.default.existsSync(customersFile);
              const custStats = custFileExists ? fs.default.statSync(customersFile) : null;
              const custPerms = custStats ? (custStats.mode & parseInt('777', 8)).toString(8) : 'n/a';
              const custSize = custStats ? custStats.size : 0;
              
              // Check credentials file
              const credFileExists = fs.default.existsSync(credentialsFile);
              const credStats = credFileExists ? fs.default.statSync(credentialsFile) : null;
              const credPerms = credStats ? (credStats.mode & parseInt('777', 8)).toString(8) : 'n/a';
              const credSize = credStats ? credStats.size : 0;
              
              // Load and validate customers
              let customersValid = false;
              let customerCount = 0;
              let activeCustomers = [];
              
              try {
                if (custFileExists) {
                  const custData = validateJsonFile(customersFile, []);
                  customerCount = custData.length;
                  customersValid = Array.isArray(custData);
                  activeCustomers = getActiveCustomers() || [];
                }
              } catch (custError) {
                log.error('Error validating customers file:', custError);
              }
              
              // Load and validate credentials
              let credsValid = false;
              let credCount = 0;
              
              try {
                if (credFileExists) {
                  const credsData = validateJsonFile(credentialsFile, {});
                  credCount = Object.keys(credsData).length;
                  credsValid = typeof credsData === 'object' && !Array.isArray(credsData);
                }
              } catch (credError) {
                log.error('Error validating credentials file:', credError);
              }
              
              // Run fix utility
              try {
                ensureDataAccess();
              } catch (fixError) {
                log.error('Error running data fix:', fixError);
              }
              
              // Test write access
              let writeAccess = false;
              try {
                const testFile = path.default.join(dataDir, '.diagnose_test');
                fs.default.writeFileSync(testFile, 'test data');
                fs.default.unlinkSync(testFile);
                writeAccess = true;
              } catch (writeError) {
                log.error('Write access test failed:', writeError);
              }
              
              // Create diagnostic report
              const report = 
                "📊 *WhatsApp RSVP Bot Diagnostics Report*\n\n" +
                "*File System Status:*\n" +
                `- Data Directory: ${dirExists ? '✅' : '❌'} (${dirPerms})\n` +
                `- Customers File: ${custFileExists ? '✅' : '❌'} (${custPerms}, ${custSize} bytes)\n` +
                `- Credentials File: ${credFileExists ? '✅' : '❌'} (${credPerms}, ${credSize} bytes)\n` +
                `- Write Access: ${writeAccess ? '✅' : '❌'}\n\n` +
                "*Data Validation:*\n" +
                `- Customers File Valid: ${customersValid ? '✅' : '❌'}\n` +
                `- Credentials File Valid: ${credsValid ? '✅' : '❌'}\n\n` +
                "*Customer Information:*\n" +
                `- Total Customers: ${customerCount}\n` +
                `- Active Customers: ${activeCustomers.length}\n` +
                (activeCustomers.length > 0 ? 
                `- First Customer: ${activeCustomers[0]?.name || 'Unknown'} (${activeCustomers[0]?.eventName || 'Unknown Event'})\n` : 
                "- No active customers found\n") +
                "\n*Bot Status:*\n" +
                `- Connected: ${!!waClient.user ? '✅' : '❌'}\n` +
                `- Mode: ${process.env.NODE_ENV || 'development'}\n`;
              
              // Send the report
              await waClient.sendMessage(m.chat, { text: report });
              
              // Check customer file content
              if (custFileExists && custSize > 0 && customersValid && customerCount === 0) {
                await waClient.sendMessage(m.chat, { 
                  text: "⚠️ WARNING: Customers file exists and is valid but contains no customers. This may indicate a permission issue or data loss."
                });
              }
              
              // Fix permissions if needed
              if (dirExists && dirPerms !== '777') {
                try {
                  fs.default.chmodSync(dataDir, 0o777);
                  await waClient.sendMessage(m.chat, { 
                    text: "🔧 Fixed data directory permissions."
                  });
                } catch (permError) {
                  log.error('Error fixing directory permissions:', permError);
                }
              }
              
              if (custFileExists && custPerms !== '666') {
                try {
                  fs.default.chmodSync(customersFile, 0o666);
                  await waClient.sendMessage(m.chat, { 
                    text: "🔧 Fixed customers file permissions."
                  });
                } catch (permError) {
                  log.error('Error fixing customers file permissions:', permError);
                }
              }
              
              if (credFileExists && credPerms !== '666') {
                try {
                  fs.default.chmodSync(credentialsFile, 0o666);
                  await waClient.sendMessage(m.chat, { 
                    text: "🔧 Fixed credentials file permissions."
                  });
                } catch (permError) {
                  log.error('Error fixing credentials file permissions:', permError);
                }
              }
            } catch (error) {
              log.error('Error in diagnose command:', error);
              await waClient.sendMessage(m.chat, { 
                text: `Diagnostics error: ${error.message}\n\nCheck server logs for details.`
              });
            }
            return;
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
              await waClient.sendMessage(m.chat, { 
                text: `Debug error: ${error.message}` 
              });
            }
            return;
          }
          
          // New diagnostics command for troubleshooting data issues
          if (m.text === '!diagnose') {
            try {
              await waClient.sendMessage(m.chat, { 
                text: "🔍 Running diagnostics... Please wait." 
              });
              
              // Import necessary utilities
              const { ensureDataAccess, validateJsonFile } = await import('./utils/fixDataAccess.js');
              const fs = await import('fs');
              const path = await import('path');
              const { getActiveCustomers } = await import('./utils/customerManager.js');
              
              // Define paths
              const dataDir = path.default.join(process.cwd(), 'data');
              const customersFile = path.default.join(dataDir, 'customers.json');
              const credentialsFile = path.default.join(dataDir, 'credentials.json');
              
              // Check data directory
              const dirExists = fs.default.existsSync(dataDir);
              const dirStats = dirExists ? fs.default.statSync(dataDir) : null;
              const dirPerms = dirStats ? (dirStats.mode & parseInt('777', 8)).toString(8) : 'n/a';
              
              // Check customer file
              const custFileExists = fs.default.existsSync(customersFile);
              const custStats = custFileExists ? fs.default.statSync(customersFile) : null;
              const custPerms = custStats ? (custStats.mode & parseInt('777', 8)).toString(8) : 'n/a';
              const custSize = custStats ? custStats.size : 0;
              
              // Check credentials file
              const credFileExists = fs.default.existsSync(credentialsFile);
              const credStats = credFileExists ? fs.default.statSync(credentialsFile) : null;
              const credPerms = credStats ? (credStats.mode & parseInt('777', 8)).toString(8) : 'n/a';
              const credSize = credStats ? credStats.size : 0;
              
              // Load and validate customers
              let customersValid = false;
              let customerCount = 0;
              let activeCustomers = [];
              
              try {
                if (custFileExists) {
                  const custData = validateJsonFile(customersFile, []);
                  customerCount = custData.length;
                  customersValid = Array.isArray(custData);
                  activeCustomers = getActiveCustomers() || [];
                }
              } catch (custError) {
                log.error('Error validating customers file:', custError);
              }
              
              // Load and validate credentials
              let credsValid = false;
              let credCount = 0;
              
              try {
                if (credFileExists) {
                  const credsData = validateJsonFile(credentialsFile, {});
                  credCount = Object.keys(credsData).length;
                  credsValid = typeof credsData === 'object' && !Array.isArray(credsData);
                }
              } catch (credError) {
                log.error('Error validating credentials file:', credError);
              }
              
              // Run fix utility
              try {
                ensureDataAccess();
              } catch (fixError) {
                log.error('Error running data fix:', fixError);
              }
              
              // Test write access
              let writeAccess = false;
              try {
                const testFile = path.default.join(dataDir, '.diagnose_test');
                fs.default.writeFileSync(testFile, 'test data');
                fs.default.unlinkSync(testFile);
                writeAccess = true;
              } catch (writeError) {
                log.error('Write access test failed:', writeError);
              }
              
              // Create diagnostic report
              const report = 
                "📊 *WhatsApp RSVP Bot Diagnostics Report*\n\n" +
                "*File System Status:*\n" +
                `- Data Directory: ${dirExists ? '✅' : '❌'} (${dirPerms})\n` +
                `- Customers File: ${custFileExists ? '✅' : '❌'} (${custPerms}, ${custSize} bytes)\n` +
                `- Credentials File: ${credFileExists ? '✅' : '❌'} (${credPerms}, ${credSize} bytes)\n` +
                `- Write Access: ${writeAccess ? '✅' : '❌'}\n\n` +
                "*Data Validation:*\n" +
                `- Customers File Valid: ${customersValid ? '✅' : '❌'}\n` +
                `- Credentials File Valid: ${credsValid ? '✅' : '❌'}\n\n` +
                "*Customer Information:*\n" +
                `- Total Customers: ${customerCount}\n` +
                `- Active Customers: ${activeCustomers.length}\n` +
                (activeCustomers.length > 0 ? 
                `- First Customer: ${activeCustomers[0]?.name || 'Unknown'} (${activeCustomers[0]?.eventName || 'Unknown Event'})\n` : 
                "- No active customers found\n") +
                "\n*Bot Status:*\n" +
                `- Connected: ${!!waClient.user ? '✅' : '❌'}\n` +
                `- Mode: ${process.env.NODE_ENV || 'development'}\n`;
              
              // Send the report
              await waClient.sendMessage(m.chat, { text: report });
              
              // Check customer file content
              if (custFileExists && custSize > 0 && customersValid && customerCount === 0) {
                await waClient.sendMessage(m.chat, { 
                  text: "⚠️ WARNING: Customers file exists and is valid but contains no customers. This may indicate a permission issue or data loss."
                });
              }
              
              // Fix permissions if needed
              if (dirExists && dirPerms !== '777') {
                try {
                  fs.default.chmodSync(dataDir, 0o777);
                  await waClient.sendMessage(m.chat, { 
                    text: "🔧 Fixed data directory permissions."
                  });
                } catch (permError) {
                  log.error('Error fixing directory permissions:', permError);
                }
              }
              
              if (custFileExists && custPerms !== '666') {
                try {
                  fs.default.chmodSync(customersFile, 0o666);
                  await waClient.sendMessage(m.chat, { 
                    text: "🔧 Fixed customers file permissions."
                  });
                } catch (permError) {
                  log.error('Error fixing customers file permissions:', permError);
                }
              }
              
              if (credFileExists && credPerms !== '666') {
                try {
                  fs.default.chmodSync(credentialsFile, 0o666);
                  await waClient.sendMessage(m.chat, { 
                    text: "🔧 Fixed credentials file permissions."
                  });
                } catch (permError) {
                  log.error('Error fixing credentials file permissions:', permError);
                }
              }
            } catch (error) {
              log.error('Error in diagnose command:', error);
              await waClient.sendMessage(m.chat, { 
                text: `Diagnostics error: ${error.message}\n\nCheck server logs for details.`
              });
            }
            return;
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
              await waClient.sendMessage(m.chat, { 
                text: `Debug error: ${error.message}` 
              });
            }
            return;
          }
          
          // New diagnostics command for troubleshooting data issues
          if (m.text === '!diagnose') {
            try {
              await waClient.sendMessage(m.chat, { 
                text: "🔍 Running diagnostics... Please wait." 
              });
              
              // Import necessary utilities
              const { ensureDataAccess, validateJsonFile } = await import('./utils/fixDataAccess.js');
              const fs = await import('fs');
              const path = await import('path');
              const { getActiveCustomers } = await import('./utils/customerManager.js');
              
              // Define paths
              const dataDir = path.default.join(process.cwd(), 'data');
              const customersFile = path.default.join(dataDir, 'customers.json');
              const credentialsFile = path.default.join(dataDir, 'credentials.json');
              
              // Check data directory
              const dirExists = fs.default.existsSync(dataDir);
              const dirStats = dirExists ? fs.default.statSync(dataDir) : null;
              const dirPerms = dirStats ? (dirStats.mode & parseInt('777', 8)).toString(8) : 'n/a';
              
              // Check customer file
              const custFileExists = fs.default.existsSync(customersFile);
              const custStats = custFileExists ? fs.default.statSync(customersFile) : null;
              const custPerms = custStats ? (custStats.mode & parseInt('777', 8)).toString(8) : 'n/a';
              const custSize = custStats ? custStats.size : 0;
              
              // Check credentials file
              const credFileExists = fs.default.existsSync(credentialsFile);
              const credStats = credFileExists ? fs.default.statSync(credentialsFile) : null;
              const credPerms = credStats ? (credStats.mode & parseInt('777', 8)).toString(8) : 'n/a';
              const credSize = credStats ? credStats.size : 0;
              
              // Load and validate customers
              let customersValid = false;
              let customerCount = 0;
              let activeCustomers = [];
              
              try {
                if (custFileExists) {
                  const custData = validateJsonFile(customersFile, []);
                  customerCount = custData.length;
                  customersValid = Array.isArray(custData);
                  activeCustomers = getActiveCustomers() || [];
                }
              } catch (custError) {
                log.error('Error validating customers file:', custError);
              }
              
              // Load and validate credentials
              let credsValid = false;
              let credCount = 0;
              
              try {
                if (credFileExists) {
                  const credsData = validateJsonFile(credentialsFile, {});
                  credCount = Object.keys(credsData).length;
                  credsValid = typeof credsData === 'object' && !Array.isArray(credsData);
                }
              } catch (credError) {
                log.error('Error validating credentials file:', credError);
              }
              
              // Run fix utility
              try {
                ensureDataAccess();
              } catch (fixError) {
                log.error('Error running data fix:', fixError);
              }
              
              // Test write access
              let writeAccess = false;
              try {
                const testFile = path.default.join(dataDir, '.diagnose_test');
                fs.default.writeFileSync(testFile, 'test data');
                fs.default.unlinkSync(testFile);
                writeAccess = true;
              } catch (writeError) {
                log.error('Write access test failed:', writeError);
              }
              
              // Create diagnostic report
              const report = 
                "📊 *WhatsApp RSVP Bot Diagnostics Report*\n\n" +
                "*File System Status:*\n" +
                `- Data Directory: ${dirExists ? '✅' : '❌'} (${dirPerms})\n` +
                `- Customers File: ${custFileExists ? '✅' : '❌'} (${custPerms}, ${custSize} bytes)\n` +
                `- Credentials File: ${credFileExists ? '✅' : '❌'} (${credPerms}, ${credSize} bytes)\n` +
                `- Write Access: ${writeAccess ? '✅' : '❌'}\n\n` +
                "*Data Validation:*\n" +
                `- Customers File Valid: ${customersValid ? '✅' : '❌'}\n` +
                `- Credentials File Valid: ${credsValid ? '✅' : '❌'}\n\n` +
                "*Customer Information:*\n" +
                `- Total Customers: ${customerCount}\n` +
                `- Active Customers: ${activeCustomers.length}\n` +
                (activeCustomers.length > 0 ? 
                `- First Customer: ${activeCustomers[0]?.name || 'Unknown'} (${activeCustomers[0]?.eventName || 'Unknown Event'})\n` : 
                "- No active customers found\n") +
                "\n*Bot Status:*\n" +
                `- Connected: ${!!waClient.user ? '✅' : '❌'}\n` +
                `- Mode: ${process.env.NODE_ENV || 'development'}\n`;
              
              // Send the report
              await waClient.sendMessage(m.chat, { text: report });
              
              // Check customer file content
              if (custFileExists && custSize > 0 && customersValid && customerCount === 0) {
                await waClient.sendMessage(m.chat, { 
                  text: "⚠️ WARNING: Customers file exists and is valid but contains no customers. This may indicate a permission issue or data loss."
                });
              }
              
              // Fix permissions if needed
              if (dirExists && dirPerms !== '777') {
                try {
                  fs.default.chmodSync(dataDir, 0o777);
                  await waClient.sendMessage(m.chat, { 
                    text: "🔧 Fixed data directory permissions."
                  });
                } catch (permError) {
                  log.error('Error fixing directory permissions:', permError);
                }
              }
              
              if (custFileExists && custPerms !== '666') {
                try {
                  fs.default.chmodSync(customersFile, 0o666);
                  await waClient.sendMessage(m.chat, { 
                    text: "🔧 Fixed customers file permissions."
                  });
                } catch (permError) {
                  log.error('Error fixing customers file permissions:', permError);
                }
              }
              
              if (credFileExists && credPerms !== '666') {
                               try {
                  fs.default.chmodSync(credentialsFile, 0o666);
                  await waClient.sendMessage(m.chat, { 
                    text: "🔧 Fixed credentials file permissions."
                  });
                } catch (permError) {
                  log.error('Error fixing credentials file permissions:', permError);
                }
              }
            } catch (error) {
              log.error('Error in diagnose command:', error);
              await waClient.sendMessage(m.chat, { 
                text: `Diagnostics error: ${error.message}\n\nCheck server logs for details.`
              });
            }
            return;
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
        }
        
        // Handle RSVP button responses
        if (mek.message && mek.message.buttonsResponseMessage) {
          const raw = mek.message.buttonsResponseMessage;
          // Normalize button ID
          let buttonId = raw.selectedButtonId ?? raw.selectedId ?? '';
          
          // Infer from display text if missing or empty
          if (!buttonId || buttonId.trim() === '') {
            const displayText = raw.selectedDisplayText || '';
            const dt = displayText.toLowerCase();
            
            log.info(`[BUTTON] Empty button ID, trying to infer from display text: "${displayText}"`);
            
            if (dt.includes('כן') || dt.includes('yes') || dt.includes('מגיע') || dt.includes('attend')) {
              buttonId = 'yes';
            } else if (dt.includes('לא אוכל') || dt.includes('לא') || dt.includes('no') || dt.includes("can't") || dt.includes('cannot')) {
              buttonId = 'no';
            } else if (dt.includes('בטוח') || dt.includes('maybe') || dt.includes('לא בטוח') || dt.includes('מחר')) {
              buttonId = 'maybe';
            } else if (dt.includes('1') && dt.includes('רק')) {
              buttonId = 'guest_1';
            } else if (dt.includes('2')) {
              buttonId = 'guest_2';
            } else if (dt.includes('3') || dt.includes('יותר')) {
              buttonId = 'guest_more';
            }
            
            if (buttonId) {
              log.info(`[BUTTON] Inferred button ID: ${buttonId} from display text`);
            }
          }
          
          log.info(`[BUTTON] Button response received: ${buttonId} from phone: ${senderPhone}`);
          log.info(`[BUTTON] Raw button data:`, JSON.stringify(raw, null, 2));

          // Resolve customer context
          const { findCustomerIdByPhone } = await import('./utils/phoneUtils.js');
          const { createAppScriptManager } = await import('./utils/multiTenantSheets.js');
          
          // Debug phone number formats and guest mapping
          log.info(`[BUTTON] Original senderPhone: ${senderPhone}`);
          log.info(`[BUTTON] Checking customer mapping for: ${senderPhone}`);
          
          const customerId = findCustomerIdByPhone(senderPhone);
          log.info(`[BUTTON] Found customerId: ${customerId}`);
          
          if (!customerId) {
            log.error(`[BUTTON] No customer found for phone: ${senderPhone}`);
            // Try to find with different phone formats
            const alternatePhone = senderPhone.startsWith('+') ? senderPhone.substring(1) : '+' + senderPhone;
            const alternateCustomerId = findCustomerIdByPhone(alternatePhone);
            log.info(`[BUTTON] Tried alternate format ${alternatePhone}, found: ${alternateCustomerId}`);
            
            await waClient.sendMessage(m.chat, { text: "מצטערים, אך לא הצלחנו לאתר את האירוע המתאים." });
            return;
          }
          
          const mgr = createAppScriptManager(customerId);
          if (!mgr) {
            log.error(`[BUTTON] No manager created for customer: ${customerId}`);
            await waClient.sendMessage(m.chat, { text: "אירעה שגיאה בעדכון התשובה שלך. אנא נסה שוב מאוחר יותר." });
            return;
          }
          
          log.info(`[BUTTON] Created manager for customer: ${customerId}, processing button: ${buttonId}`);

          // Handle each button action
          switch (buttonId) {
            case 'yes':
            case 'test_yes': {
              // Ask how many guests
              const opts = [
                { buttonId: 'guest_1', buttonText: { displayText: '1 (רק אני)' }, type: 1 },
                { buttonId: 'guest_2', buttonText: { displayText: '2 אנשים' }, type: 1 },
                { buttonId: 'guest_more', buttonText: { displayText: '3 או יותר' }, type: 1 }
              ];
              await waClient.sendMessage(m.chat, { text: "כמה אנשים יגיעו?", buttons: opts, footer: 'בחר אפשרות', headerType: 1 });
              break;
            }
            case 'no':
            case 'test_no': {
              try {
                log.info(`[BUTTON] Calling updateGuestStatus for phone: ${senderPhone}, status: Declined`);
                // Format phone for API call - remove + prefix if present
                const apiPhone = senderPhone.startsWith('+') ? senderPhone.substring(1) : senderPhone;
                const result = await mgr.updateGuestStatus(apiPhone, 'Declined', 0);
                log.info(`[BUTTON] updateGuestStatus result:`, result);
                await waClient.sendMessage(m.chat, { text: "תודה שהודעת לנו. חבל שלא תוכל להגיע!" });
              } catch (error) {
                log.error(`[BUTTON] Error updating guest status:`, error);
                await waClient.sendMessage(m.chat, { text: "תודה על תשובתך!" });
              }
              break;
            }
            case 'maybe': {
              try {
                log.info(`[BUTTON] Calling updateGuestStatus for phone: ${senderPhone}, status: Maybe`);
                // Format phone for API call - remove + prefix if present
                const apiPhone = senderPhone.startsWith('+') ? senderPhone.substring(1) : senderPhone;
                const result = await mgr.updateGuestStatus(apiPhone, 'Maybe', 0, 'Follow up');
                log.info(`[BUTTON] updateGuestStatus result:`, result);
                // schedule follow-up (omitted for brevity)
                await waClient.sendMessage(m.chat, { text: "נשלח תזכורת מחר" });
              } catch (error) {
                log.error(`[BUTTON] Error updating guest status:`, error);
                await waClient.sendMessage(m.chat, { text: "תודה על תשובתך!" });
              }
              break;
            }
            default: {
              if (buttonId.startsWith('guest_')) {
                const count = buttonId === 'guest_2' ? 2 : buttonId === 'guest_more' ? 3 : 1;
                try {
                  log.info(`[BUTTON] Calling updateGuestStatus for phone: ${senderPhone}, status: Confirmed, count: ${count}`);
                  // Format phone for API call - remove + prefix if present (consistent with no/maybe handling)
                  const apiPhone = senderPhone.startsWith('+') ? senderPhone.substring(1) : senderPhone;
                  const result = await mgr.updateGuestStatus(apiPhone, 'Confirmed', count);
                  log.info(`[BUTTON] updateGuestStatus result:`, result);
                  await waClient.sendMessage(m.chat, { text: `תודה! רשמנו ${count} ${count === 1 ? 'אדם' : 'אנשים'}` });
                } catch (error) {
                  log.error(`[BUTTON] Error updating guest status:`, error);
                  await waClient.sendMessage(m.chat, { text: "תודה על תשובתך!" });
                }
              } else if (!buttonId || buttonId.trim() === '') {
                log.warn(`[BUTTON] Empty button ID received, raw data:`, JSON.stringify(raw, null, 2));
                // Try to provide helpful response without pestering the user
                await waClient.sendMessage(m.chat, { text: "קיבלנו את תשובתך, תודה!" });
              } else {
                log.warn(`[BUTTON] Unknown button ID: ${buttonId}`);
                await waClient.sendMessage(m.chat, { text: "לא הבנו את הבחירה שלך, נסה שוב בבקשה." });
              }
            }
          }
          return;
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
            // Import utilities for multi-tenant handling in text responses
            const { findCustomerIdByPhone } = await import('./utils/phoneUtils.js');
            const { createAppScriptManager } = await import('./utils/multiTenantSheets.js');
            
            // Find the correct customer based on the sender's phone number
            const customerId = findCustomerIdByPhone(senderPhone);
            if (!customerId) {
              log.error(`Could not find customer for phone number: ${senderPhone}`);
              await waClient.sendMessage(m.chat, { 
                text: "מצטערים, אך לא הצלחנו לאתר את האירוע המתאים. אנא צרו קשר עם מארגני האירוע." 
              });
              return;
            }
            
            const customerAppScriptManager = createAppScriptManager(customerId);
            if (!customerAppScriptManager) {
              log.error(`Could not create App Script Manager for customer: ${customerId}`);
              await waClient.sendMessage(m.chat, { 
                text: "מצטערים, אך אירעה שגיאה בעדכון התשובה שלך. אנא צרו קשר עם מארגני האירוע." 
              });
              return;
            }
            
            // Format phone for API call - remove + prefix if present (consistent with button handling)
            const apiPhone = senderPhone.startsWith('+') ? senderPhone.substring(1) : senderPhone;
            await customerAppScriptManager.updateGuestStatus(apiPhone, 'Declined', 0);
            
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
            // Import utilities for multi-tenant handling in text responses
            const { findCustomerIdByPhone } = await import('./utils/phoneUtils.js');
            const { createAppScriptManager } = await import('./utils/multiTenantSheets.js');
            // Find the correct customer based on the sender's phone number
            const customerId = findCustomerIdByPhone(senderPhone);
            if (!customerId) {
              log.error(`Could not find customer for phone number: ${senderPhone}`);
              await waClient.sendMessage(m.chat, { 
                text: "מצטערים, אך לא הצלחנו לאתר את האירוע המתאים. אנא צרו קשר עם מארגני האירוע." 
              });
              return;
            }
            
            const customerAppScriptManager = createAppScriptManager(customerId);
            if (!customerAppScriptManager) {
              log.error(`Could not create App Script Manager for customer: ${customerId}`);
              await waClient.sendMessage(m.chat, { 
                text: "מצטערים, אך אירעה שגיאה בעדכון התשובה שלך. אנא צרו קשר עם מארגני האירוע." 
              });
              return;
            }
            
            // Format phone for API call - remove + prefix if present (consistent with button handling)
            const apiPhone = senderPhone.startsWith('+') ? senderPhone.substring(1) : senderPhone;
            await customerAppScriptManager.updateGuestStatus(apiPhone, 'Confirmed', guestCount);
            
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
        log.info('!diagnose - Check system health and fix data issues');
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
    
    // Make the client available globally for other modules
    global.conn = waClient;
    
    // If app is initialized, make the client available to Express
    if (app) {
      app.set('whatsappClient', waClient);
    }
    
    return waClient;
  } catch (error) {
    log.error('Error initializing WhatsApp client:', error);
    throw error;
  }
}

/**
 * Execute the Send RSVP Force command for a specific customer
 * This function can be called from both WhatsApp commands and admin dashboard
 * @param {Object} waClient - The WhatsApp client instance
 * @param {Object} targetCustomer - The customer object
 * @param {String|null} replyToChat - The chat ID to reply to (null if from admin dashboard)
 * @returns {Promise<void>}
 */
async function executeRsvpForceCommand(waClient, targetCustomer, replyToChat) {
  try {
    log.info(`Executing RSVP Force command for customer: ${targetCustomer.name} (${targetCustomer.id})`);
    
    // Send initial status if we have a chat to reply to
    if (replyToChat) {
      await waClient.sendMessage(replyToChat, { 
        text: `Forcing RSVP messages for customer: ${targetCustomer.name} (${targetCustomer.eventName})` 
      });
    }
    
    // Create AppScript Manager for this specific customer
    let appScriptManager;
    try {
      log.info(`Creating AppScript manager for customer ${targetCustomer.name} (ID: ${targetCustomer.id})`);
      const { createAppScriptManager } = await import('./utils/multiTenantSheets.js');
      appScriptManager = createAppScriptManager(targetCustomer.id);
      
      if (!appScriptManager) {
        throw new Error('AppScript manager creation returned null');
      }
      
      // Verify manager has required methods
      const requiredMethods = ['getEventDetails', 'getGuests'];
      const missingMethods = requiredMethods.filter(method => typeof appScriptManager[method] !== 'function');
      
      if (missingMethods.length > 0) {
        throw new Error(`AppScript manager missing methods: ${missingMethods.join(', ')}`);
      }
      
      log.info('AppScript manager created successfully');
    } catch (managerError) {
      const errorMsg = `Failed to create AppScript manager for customer ${targetCustomer.name}: ${managerError.message}`;
      log.error(errorMsg);
      if (replyToChat) {
        await waClient.sendMessage(replyToChat, { text: errorMsg });
      }
      return;
    }
    
    // Get event details directly
    let eventDetails;
    try {
      log.info(`Fetching event details for customer ${targetCustomer.name}`);
      eventDetails = await appScriptManager.getEventDetails();
      log.info(`Event details response: ${JSON.stringify(eventDetails)}`);
      
      if (!eventDetails || Object.keys(eventDetails).length === 0) {
        throw new Error('Empty event details returned');
      }
      
      // Add default values for missing fields
      const defaults = {
        name: targetCustomer.eventName || 'Event',
        date: targetCustomer.eventDate || new Date().toLocaleDateString(),
        time: '18:00',
        location: 'TBD',
        description: 'Please RSVP for our event'
      };
      
      // Apply defaults where needed
      for (const [field, defaultValue] of Object.entries(defaults)) {
        if (!eventDetails[field] || eventDetails[field].trim() === '') {
          log.warn(`Missing event field "${field}" for customer ${targetCustomer.name}, using default: "${defaultValue}"`);
          eventDetails[field] = defaultValue;
          // Also set uppercase version for compatibility
          eventDetails[field.charAt(0).toUpperCase() + field.slice(1)] = defaultValue;
        }
      }
      
      log.info(`Final event details after applying defaults: ${JSON.stringify(eventDetails)}`);
    } catch (detailsError) {
      const errorMsg = `Could not retrieve event details for customer ${targetCustomer.name}: ${detailsError.message}`;
      log.error(errorMsg);
      if (replyToChat) {
        await waClient.sendMessage(replyToChat, { text: errorMsg });
      }
      return;
    }
    
    // Get guests directly
    const guests = await appScriptManager.getGuests();
    if (!Array.isArray(guests) || guests.length === 0) {
      const errorMsg = `No guests found for customer: ${targetCustomer.name}`;
      log.error(errorMsg);
      if (replyToChat) {
        await waClient.sendMessage(replyToChat, { text: errorMsg });
      }
      return;
    }
    
    // Log what we found
    log.info(`Found ${guests.length} guests to message for customer: ${targetCustomer.name}`);
    if (replyToChat) {
      await waClient.sendMessage(replyToChat, { 
        text: `Found ${guests.length} guests for customer: ${targetCustomer.name}` 
      });
    }
    
    // Try to load customer-specific invitation image, or fallback to default
    let invitationImage = null;
    try {
      // First try customer-specific image
      const customerImagePath = path.join(__dirname, 'data', 'images', `${targetCustomer.id}.jpeg`);
      if (fs.existsSync(customerImagePath)) {
        invitationImage = fs.readFileSync(customerImagePath);
        log.info(`Using customer-specific invitation image: ${customerImagePath}`);
      } else {
        // Fallback to default image
        invitationImage = fs.readFileSync(path.join(__dirname, 'invitation.jpeg'));
        log.info(`Using default invitation image`);
      }
    } catch (error) {
      log.warn(`No invitation image found: ${error.message}`);
    }
    
    // Send messages to each guest
    let successCount = 0;
    let errorCount = 0;
    
    for (const guest of guests) {
      try {
        // Create buttons for interactive responses
        const buttons = [
          {buttonId: 'yes', buttonText: {displayText: 'כן, אני מגיע/ה'}, type: 1},
          {buttonId: 'no', buttonText: {displayText: 'לא אוכל להגיע'}, type: 1},
          {buttonId: 'maybe', buttonText: {displayText: 'לא בטוח/ה, תשאל אותי מחר'}, type: 1}
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
        
        // Get guest name or use fallback
        const guestName = guest.name || guest.Name || 'אורח/ת';
        
        // Prepare message text with fallbacks for all key event details
        const messageText = `*${eventDetails.name} - הזמנה לאירוע*\n\n` +
                            `שלום ${guestName},\n\n` +
                            `אתם מוזמנים ל${eventDetails.name}!\n\n` +
                            `📅 תאריך: ${eventDetails.date || targetCustomer.eventDate || 'יפורסם בהמשך'}\n` +
                            `⏰ שעה: ${displayTime || '18:00'}\n` +
                            `📍 מיקום: ${eventDetails.location || 'יפורסם בהמשך'}\n\n` +
                            `${eventDetails.description || ''}\n\n` +
                            `האם תוכלו להגיע?`;
        
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
        log.info(`Preparing to send RSVP message to: ${guest.phone}`);
        
        // Validate phone number format
        if (!guest.phone) {
          log.error('Guest phone number is missing');
          errorCount++;
          continue;
        }
        
        // Remove the plus sign and any other non-numeric characters from phone
        const cleanPhone = guest.phone.replace(/[^\d]/g, '');
        const formattedPhone = cleanPhone + '@s.whatsapp.net';
        
        // Log message details before sending
        log.info(`Formatted phone: ${formattedPhone}`);
        log.info(`Message structure: ${JSON.stringify({
          ...buttonMessage,
          image: buttonMessage.image ? 'image-data-present' : 'no-image'
        })}`);
        
        try {
          // Verify WhatsApp client state
          if (!waClient.user) {
            throw new Error('WhatsApp client not connected');
          }
          
          // Send with timeout
          const sendPromise = waClient.sendMessage(formattedPhone, buttonMessage);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Send timeout')), 30000)
          );
          
          await Promise.race([sendPromise, timeoutPromise]);
          
          log.info(`✓ Successfully sent RSVP message to ${guest.name} (${guest.phone})`);
          successCount++;
          
          // CRITICAL FIX: Map the phone number to customer for button responses
          // This is what was missing compared to automatic sendRSVPMessages!
          const phoneForMapping = guest.phone.startsWith('+') ? guest.phone.substring(1) : guest.phone;
          const phoneWithPlus = phoneForMapping.startsWith('+') ? phoneForMapping : '+' + phoneForMapping;
          
          log.info(`[MAPPING] Manual RSVP - Guest: ${guest.name}, Original: ${guest.phone}, ForMapping: ${phoneForMapping}, WithPlus: ${phoneWithPlus}`);
          
          // Map both formats to ensure we can find the guest regardless of format
          mapGuestToCustomer(phoneForMapping, targetCustomer.id, guest.name);
          mapGuestToCustomer(phoneWithPlus, targetCustomer.id, guest.name);
          
          // Wait between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (sendError) {
          log.error(`Failed to send message to ${guest.name} (${guest.phone}):`, sendError);
          errorCount++;
          
          // Try to notify admin if we have a chat
          if (replyToChat) {
            await waClient.sendMessage(replyToChat, {
              text: `Failed to send to ${guest.name}: ${sendError.message}`
            }).catch(() => {}); // Ignore errors in error reporting
          }
        }
      } catch (error) {
        log.error(`Failed to send message to ${guest.name} (${guest.phone}):`, error);
        errorCount++;
      }
    }
    
    // Send summary message if we have a chat to reply to
    if (replyToChat) {
      await waClient.sendMessage(replyToChat, { 
        text: `Completed sending force messages to ${guests.length} guests\nSuccess: ${successCount}, Errors: ${errorCount}` 
      });
    }
    
    // Also send summary to the customer's admin phone
    const adminSummary = `*RSVP Message Summary*\n\nEvent: ${targetCustomer.eventName}\nTotal guests: ${guests.length}\nMessages sent: ${successCount}\nFailed: ${errorCount}`;
    
    try {
      await waClient.sendMessage(targetCustomer.phone + '@s.whatsapp.net', { text: adminSummary });
    } catch (error) {
      log.error(`Could not send summary to customer admin phone: ${error.message}`);
    }
    
    return { success: true, sent: successCount, errors: errorCount, total: guests.length };
  } catch (error) {
    log.error('Error in executeRsvpForceCommand:', error);
    if (replyToChat) {
      await waClient.sendMessage(replyToChat, { 
        text: `Error executing RSVP Force: ${error.message}` 
      });
    }
    return { success: false, error: error.message };
  }
}

// Add route for QR code
// QR code page - serve static files or existing generated QR
app.get('/qr', (req, res) => {
  // Handle force reset via query param
  if (req.query.reset === 'true') {
    log.info('QR reset requested via URL parameter');
    if (client) {
      process.env.RESET_SESSION = 'true';
      return res.redirect('/qr');
    }
  }
  if (lastQR) {
    // Serve pre-generated QR HTML
    return res.sendFile(path.join(__dirname, 'whatsapp-qr.html'));
  }
  // Serve no-QR static page
  return res.sendFile(path.join(__dirname, 'public', 'no-qr.html'));
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


// Parse cookies and request body for authentication
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Serve static files
app.use(express.static(publicDir));
app.use(express.static(__dirname));

// Add multi-tenant routes
app.use(adminRoutes);
app.use(dashboardRoutes);
app.use(uploadRoutes);

// Set up event handlers for admin-triggered WhatsApp commands
global.eventEmitter.on('admin-whatsapp-command', async (data) => {
  try {
    const { customerId, command, source = 'admin-dashboard' } = data;
    
    // Make sure the WhatsApp client is initialized
    if (!client) {
      log.error(`[${source}] WhatsApp client not initialized when executing command: ${command} for customer: ${customerId}`);
      return;
    }
    
    log.info(`[${source}] Processing WhatsApp command: ${command} for customer: ${customerId}`);
    
    // Import necessary modules for customer management
    const { getCustomerById } = await import('./utils/customerManager.js');
    const customer = getCustomerById(customerId);
    
    if (!customer) {
      log.error(`[${source}] Customer with ID ${customerId} not found`);
      return;
    }
    
    // Switch between different commands
    switch (command) {
      case 'sendrsvpforce':
        // Execute the same logic as the !sendrsvpforce command
        log.info(`[${source}] Executing Send RSVP Force for customer: ${customer.name}`);
        
        // Execute in the same way as we would from a WhatsApp message
        // This reuses the existing command implementation
        await executeRsvpForceCommand(client, customer, null);
        break;
        
      case 'liststatus':
        log.info(`[${source}] Executing List Status for customer: ${customer.name}`);
        // Create manager
        try {
          const { createAppScriptManager } = await import('./utils/multiTenantSheets.js');
          const appScriptManager = createAppScriptManager(customerId);
          if (!appScriptManager) {
            log.error(`[${source}] Failed to create App Script Manager for customer: ${customer.name}`);
            break;
          }
          // Fetch stats
          const stats = await appScriptManager.getRsvpStats();
          const message = `*RSVP Status for ${customer.name} (${customer.eventName})*\n\n` +
                          `📊 Total Guests: ${stats.total || 0}\n` +
                          `✅ Confirmed: ${stats.confirmed || 0}\n` +
                          `❌ Declined: ${stats.declined || 0}\n` +
                          `⏳ Pending: ${stats.pending || 0}\n\n` +
                          `Expected Attendance: ${stats.confirmedCount || 0} people\n` +
                          `Last Updated: ${new Date().toLocaleString()}`;
          // Send stats message, retry on connection closed
          try {
            await client.sendMessage(customer.phone + '@s.whatsapp.net', { text: message });
            log.info(`[${source}] Sent RSVP stats to customer: ${customer.name}`);
          } catch (sendErr) {
            // If WebSocket closed, reconnect and retry once
            if (sendErr.isBoom && sendErr.output?.statusCode === 428) {
              log.warn(`[${source}] Connection closed, reconnecting and retrying stats message`);
              try {
                client = await clientstart();
                await client.sendMessage(customer.phone + '@s.whatsapp.net', { text: message });
                log.info(`[${source}] Sent RSVP stats after reconnect to customer: ${customer.name}`);
              } catch (retryErr) {
                log.error(`[${source}] Retry send failed:`, retryErr);
              }
            } else {
              log.error(`[${source}] Failed to send stats to customer ${customer.name}:`, sendErr);
            }
          }
        } catch (err) {
          log.error(`[${source}] Error executing List Status for customer ${customer.name}:`, err);
        }
        break;
        
      default:
        log.warn(`[${source}] Unknown command: ${command} for customer: ${customer.name}`);
        break;
    }
  } catch (error) {
    log.error(`Error processing admin WhatsApp command:`, error);
  }
});

// API endpoint for guest list
app.get('/api/guests', dashboardAuth, async (req, res) => {
  try {
    // Get customer ID from the request
    const customerId = req.query.customerId;
    if (!customerId) {
      return res.status(400).json({ success: false, error: 'Customer ID is required' });
    }

    // Import necessary modules
    const { createAppScriptManager } = await import('./utils/multiTenantSheets.js');
    const customerAppScriptManager = createAppScriptManager(customerId);
    
    if (!customerAppScriptManager) {
      return res.status(404).json({ success: false, error: 'Customer credentials not found' });
    }

    const guestsList = await customerAppScriptManager.fetchGuestList();
    
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
    // Get customer ID from the request
    const customerId = req.query.customerId;
    if (!customerId) {
      return res.status(400).json({ success: false, error: 'Customer ID is required' });
    }

    // Import necessary modules
    const { createAppScriptManager } = await import('./utils/multiTenantSheets.js');
    const customerAppScriptManager = createAppScriptManager(customerId);
    
    if (!customerAppScriptManager) {
      return res.status(404).json({ success: false, error: 'Customer credentials not found' });
    }

    const eventDetails = await customerAppScriptManager.getEventDetails();
    
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
  // If already authenticated, redirect to dashboard
  if (req.cookies && req.cookies.dashboard_token) {
    return res.redirect('/dashboard');
  }
  // Serve static login page
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard-fixed.html'));
});
// Dashboard login POST handler
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

// Home page - serve static HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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