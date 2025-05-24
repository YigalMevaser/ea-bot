/**
 * Guest phone number to customer ID mapping
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDataAccess } from './fixDataAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for Railway single volume configuration
const persistentBase = '/app/persistent';
const isRailwaySingleVolume = fs.existsSync(persistentBase);

// Define the path for storing guest mapping data
const dataDir = isRailwaySingleVolume ? path.join(persistentBase, 'data') : path.join(__dirname, '..', 'data');
const guestMapFile = path.join(dataDir, 'guest_map.json');

// Ensure data directory and permissions are set up correctly
ensureDataAccess();

// Initialize guest map from file or create new
let guestMap = {};
try {
    if (fs.existsSync(guestMapFile)) {
        const data = fs.readFileSync(guestMapFile, 'utf8');
        guestMap = JSON.parse(data);
        console.log(`[guestMap] Loaded ${Object.keys(guestMap).length} guest mappings`);
        console.log('[guestMap] Current mappings:', JSON.stringify(guestMap, null, 2));
    }
} catch (error) {
    console.error('Error loading guest map:', error);
    guestMap = {};
}

/**
 * Save guest map to file
 * @private
 */
function saveGuestMap() {
    try {
        fs.writeFileSync(guestMapFile, JSON.stringify(guestMap, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving guest map:', error);
        return false;
    }
}

/**
 * Associate a guest phone number with a customer
 * @param {string} phone - Guest phone number
 * @param {string} customerId - Customer ID
 * @param {string} guestName - Guest name for logging
 */
export function mapGuestToCustomer(phone, customerId, guestName = '') {
    if (!phone || !customerId) {
        console.log('[guestMap] Missing phone or customerId');
        return;
    }

    // Clean phone number - first remove any non-numeric characters except +
    let cleanPhone = String(phone).replace(/[^\d+]/g, '');
    
    // If it doesn't start with +, add it
    if (!cleanPhone.startsWith('+')) {
        cleanPhone = '+' + cleanPhone;
    }
    
    // Handle Israeli phone numbers specifically
    if (cleanPhone.startsWith('+972')) {
        // Already has correct Israeli prefix
    } else if (cleanPhone.startsWith('+0')) {
        // Israeli number with 0 prefix after country code: +05X -> +9725X
        cleanPhone = '+972' + cleanPhone.substring(2);
    } else if (cleanPhone.startsWith('+1') && cleanPhone.length === 12) {
        // US format that should be Israeli: +1XXXXXXXXX -> +972XXXXXXXX
        cleanPhone = '+972' + cleanPhone.substring(2);
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith('+') && !cleanPhone.startsWith('+972')) {
        // Other country code that should be Israeli
        cleanPhone = '+972' + cleanPhone.substring(2);
    }
    
    // Log the mapping attempt
    console.log(`[guestMap] Attempting to map ${guestName} (${phone} -> ${cleanPhone}) to customer ${customerId}`);
    console.log(`[guestMap] Current mappings before:`, JSON.stringify(guestMap, null, 2));

    if (guestMap[cleanPhone] === customerId) {
        console.log(`[guestMap] Guest ${guestName} (${cleanPhone}) already mapped to ${customerId}`);
        return;
    }

    guestMap[cleanPhone] = customerId;
    console.log(`[guestMap] Mapped guest ${guestName} (${cleanPhone}) to customer ${customerId}`);
    console.log(`[guestMap] Current mappings after:`, JSON.stringify(guestMap, null, 2));
    saveGuestMap();
}

/**
 * Look up which customer a guest belongs to
 * @param {string} phone - Guest phone number
 * @returns {string|null} Customer ID or null if not found
 */
export function findCustomerForGuest(phone) {
    if (!phone) {
        console.log('[guestMap] No phone number provided');
        return null;
    }

    // Clean phone number
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    console.log(`[guestMap] Looking up guest with cleaned phone: ${cleanPhone}`);
    console.log(`[guestMap] Current guest mappings:`, guestMap);
    
    // Try exact match
    if (guestMap[cleanPhone]) {
        console.log(`[guestMap] Found exact match for ${cleanPhone} -> ${guestMap[cleanPhone]}`);
        return guestMap[cleanPhone];
    }

    // Try matching with/without + prefix
    const phoneDigits = cleanPhone.replace(/[^\d]/g, '');
    console.log(`[guestMap] Trying digit-only match with: ${phoneDigits}`);
    
    for (const [mappedPhone, customerId] of Object.entries(guestMap)) {
        const mappedDigits = mappedPhone.replace(/[^\d]/g, '');
        console.log(`[guestMap] Comparing with mapped phone ${mappedPhone} (${mappedDigits})`);
        if (phoneDigits === mappedDigits) {
            console.log(`[guestMap] Found digit match ${phoneDigits} = ${mappedDigits} -> ${customerId}`);
            return customerId;
        }
    }

    console.log(`[guestMap] No matching guest found for ${cleanPhone}`);
    return null;
}

/**
 * Clear all guest-to-customer mappings
 */
export function clearGuestMap() {
    guestMap = {};
    saveGuestMap();
    console.log('Cleared all guest-to-customer mappings');
}

/**
 * Get all guest-to-customer mappings for a specific customer
 * @param {string} customerId - Customer ID
 * @returns {Object} Map of guest phone numbers to names for this customer
 */
export function getCustomerGuests(customerId) {
    if (!customerId) return {};
    return Object.fromEntries(
        Object.entries(guestMap)
            .filter(([_, cid]) => cid === customerId)
    );
}
