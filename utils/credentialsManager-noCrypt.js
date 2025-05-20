/**
 * Credentials Manager (No Encryption Version)
 * This is a simplified version that doesn't use encryption for troubleshooting
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getIsraelTimestamp } from './timeUtils.js';
import { validateJsonFile } from './fixDataAccess.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for Railway single volume configuration
const persistentBase = '/app/persistent';
const isRailwaySingleVolume = fs.existsSync(persistentBase);

// Define the path for storing credentials
const credentialsDir = isRailwaySingleVolume ? path.join(persistentBase, 'data') : path.join(__dirname, '..', 'data');
const credentialsFile = path.join(credentialsDir, 'credentials.json');

// Log the credentials directory being used
console.log(`CredentialsManager (NO ENCRYPTION) using directory: ${credentialsDir}`);

// Create data directory if it doesn't exist
if (!fs.existsSync(credentialsDir)) {
  fs.mkdirSync(credentialsDir, { recursive: true, mode: 0o777 });
}

// Initialize credentials data with our validation utility
let credentials = validateJsonFile(credentialsFile, {});
console.log(`Loaded ${Object.keys(credentials).length} credential records`);

// Make sure data is correctly loaded
if (Object.keys(credentials).length > 0) {
  console.log(`Found credentials for customer IDs: ${Object.keys(credentials).join(', ')}`);
}

/**
 * Save credentials data to file
 * @private
 */
function saveCredentials() {
  fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2));
}

/**
 * Store API credentials for a customer - NO ENCRYPTION VERSION
 * @param {string} customerId - Customer ID
 * @param {Object} apiData - API credentials
 * @param {string} apiData.appScriptUrl - Google Apps Script URL
 * @param {string} apiData.secretKey - Secret key for the API
 */
export function storeCredentials(customerId, apiData) {
  const timestamp = getIsraelTimestamp();
  
  try {
    console.log(`[${timestamp}] Storing credentials for customer: ${customerId} (NO ENCRYPTION)`);
    
    // Validate inputs first
    if (!customerId || !apiData || !apiData.appScriptUrl || !apiData.secretKey) {
      console.error(`[${timestamp}] Invalid inputs: customerId or apiData missing required fields`);
      throw new Error('Invalid inputs for credential storage');
    }
    
    // Store credentials directly without encryption
    credentials[customerId] = {
      updatedAt: timestamp,
      appScriptUrl: apiData.appScriptUrl,
      secretKey: apiData.secretKey
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
 * Get API credentials for a customer - NO ENCRYPTION VERSION
 * @param {string} customerId - Customer ID
 * @returns {Object|null} Credentials or null if not found
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
      (credentials[customerId] ? credentials[customerId].appScriptUrl : null);
    
    if (appScriptUrl) {
      return {
        appScriptUrl,
        secretKey: envSecretKey
      };
    }
  }
  
  // Otherwise use the credentials file directly
  if (!credentials[customerId]) return null;
  
  return {
    appScriptUrl: credentials[customerId].appScriptUrl,
    secretKey: credentials[customerId].secretKey
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
