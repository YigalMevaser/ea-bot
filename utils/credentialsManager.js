/**
 * Credentials Manager - Handles API credentials for multiple customers
 * This module manages keys and connections for multiple events
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getIsraelTimestamp } from './timeUtils.js';
import { validateJsonFile } from './fixDataAccess.js'; // Import the file validation utility

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for Railway single volume configuration
const persistentBase = '/app/persistent';
const isRailwaySingleVolume = fs.existsSync(persistentBase);

// Define the path for storing credentials
const credentialsDir = isRailwaySingleVolume ? path.join(persistentBase, 'data') : path.join(__dirname, '..', 'data');
const credentialsFile = path.join(credentialsDir, 'credentials.json');

// Log the credentials directory being used
console.log(`CredentialsManager using directory: ${credentialsDir} (${isRailwaySingleVolume ? 'single volume' : 'standard'} configuration)`);

// Create data directory if it doesn't exist
if (!fs.existsSync(credentialsDir)) {
  fs.mkdirSync(credentialsDir, { recursive: true, mode: 0o777 });
}

// Initialize credentials data with encryption using our validation utility
let credentials = validateJsonFile(credentialsFile, {});
console.log(`Loaded ${Object.keys(credentials).length} credential records`);

// Make sure data is correctly loaded
if (Object.keys(credentials).length > 0) {
  console.log(`Found credentials for customer IDs: ${Object.keys(credentials).join(', ')}`);
}

// Create a simple 32-byte key for AES-256 encryption
// Using a fixed secret key for consistency
const SECRET_KEY = process.env.SECRET_KEY || 'yourActualSecretKeyHere123';

// Log key to help debug
console.log(`Original SECRET_KEY: ${SECRET_KEY.substring(0, 3)}...`);

// Generate a stable encryption key - using all 32 bytes of the hash directly
// rather than using the hex representation which would be 64 chars
const encryptionKey = crypto.createHash('sha256')
  .update(SECRET_KEY)
  .digest(); // Binary buffer, exactly 32 bytes for AES-256

/**
 * Encrypt sensitive data
 * @param {string} text - Text to encrypt
 * @returns {string} Encrypted text
 * @private
 */
function encrypt(text) {
  try {
    if (!text) {
      return '';
    }
    
    // Debug output to verify key
    console.log(`Encrypting with key length: ${encryptionKey.length} bytes`);
    
    // Ensure we have a valid key length (32 bytes for AES-256)
    if (encryptionKey.length !== 32) {
      console.error(`Warning: Invalid key length detected: ${encryptionKey.length} bytes. Using alternative method.`);
      // Fall back to a predictable 32-byte key if the hash isn't right
      const fallbackKey = Buffer.alloc(32, 'yourActualSecretKeyHere123');
      console.log(`Using fallback key with length: ${fallbackKey.length}`);
      
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', fallbackKey, iv);
      let encrypted = cipher.update(text);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      return iv.toString('hex') + ':' + encrypted.toString('hex');
    }
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error(`Encryption error: ${error.message}`);
    throw new Error(`Failed to encrypt data: ${error.message}`);
  }
}

/**
 * Decrypt sensitive data
 * @param {string} text - Encrypted text
 * @returns {string} Decrypted text
 * @private
 */
function decrypt(text) {
  try {
    if (!text || text.length < 17 || !text.includes(':')) {
      return '';
    }
    
    // Ensure we have a valid key length (32 bytes for AES-256)
    if (encryptionKey.length !== 32) {
      throw new Error(`Invalid key length: ${encryptionKey.length} bytes. Must be 32 bytes.`);
    }
    
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error(`Decryption error: ${error.message}`);
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

/**
 * Save credentials data to file
 * @private
 */
function saveCredentials() {
  fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2));
}

/**
 * Store API credentials for a customer
 * @param {string} customerId - Customer ID
 * @param {Object} apiData - API credentials
 * @param {string} apiData.appScriptUrl - Google Apps Script URL
 * @param {string} apiData.secretKey - Secret key for the API
 */
export function storeCredentials(customerId, apiData) {
  const timestamp = getIsraelTimestamp();
  
  try {
    console.log(`[${timestamp}] Attempting to store credentials for customer: ${customerId}`);
    console.log(`[${timestamp}] Encryption key length: ${encryptionKey.length} bytes`);
    console.log(`[${timestamp}] apiData contains appScriptUrl: ${!!apiData.appScriptUrl}, secretKey: ${!!apiData.secretKey}`);
    
    // Validate inputs first
    if (!customerId || !apiData || !apiData.appScriptUrl || !apiData.secretKey) {
      console.error(`[${timestamp}] Invalid inputs: customerId or apiData missing required fields`);
      console.log(`customerId: ${customerId}`);
      console.log(`apiData: ${JSON.stringify(apiData, null, 2)}`);
      throw new Error('Invalid inputs for credential storage');
    }
    
    const encryptedUrl = encrypt(apiData.appScriptUrl);
    const encryptedKey = encrypt(apiData.secretKey);
    
    console.log(`[${timestamp}] Successfully encrypted credentials`);
    
    credentials[customerId] = {
      updatedAt: timestamp,
      appScriptUrl: encryptedUrl,
      secretKey: encryptedKey
    };
    
    saveCredentials();
    console.log(`[${timestamp}] Successfully stored credentials for customer: ${customerId}`);
    
    return true;
  } catch (error) {
    console.error(`[${timestamp}] Error storing credentials:`, error);
    throw error;
  }
}

/**
 * Get API credentials for a customer
 * @param {string} customerId - Customer ID
 * @returns {Object|null} Decrypted credentials or null if not found
 */
export function getCredentials(customerId) {
  // First check if we have a Railway environment variable for this customer
  const envSecretKey = process.env[`CUSTOMER_SECRET_${customerId}`];
  const envAppScriptUrl = process.env[`CUSTOMER_URL_${customerId}`];
  
  // If environment variable for secret key is defined, it takes precedence
  if (envSecretKey) {
    console.log(`Using environment variables for customer: ${customerId}`);
    
    // Use environment URL if available, otherwise use from credentials file
    const appScriptUrl = envAppScriptUrl || 
      (credentials[customerId] ? decrypt(credentials[customerId].appScriptUrl) : null);
    
    if (appScriptUrl) {
      return {
        appScriptUrl,
        secretKey: envSecretKey
      };
    }
  }
  
  // Otherwise use the credentials file
  if (!credentials[customerId]) return null;
  
  return {
    appScriptUrl: decrypt(credentials[customerId].appScriptUrl),
    secretKey: decrypt(credentials[customerId].secretKey)
  };
}

/**
 * Check if credentials exist for a customer
 * @param {string} customerId - Customer ID
 * @returns {boolean} Whether credentials exist
 */
export function hasCredentials(customerId) {
  return !!credentials[customerId];
}

/**
 * Delete credentials for a customer
 * @param {string} customerId - Customer ID
 * @returns {boolean} Success status
 */
export function deleteCredentials(customerId) {
  if (!credentials[customerId]) return false;
  
  delete credentials[customerId];
  saveCredentials();
  return true;
}
