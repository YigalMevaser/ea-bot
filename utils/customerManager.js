/**
 * Customer Manager - Handles multiple customer events
 * This module enables multi-tenant support for the RSVP bot
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getIsraelTimestamp } from './timeUtils.js';
import { ensureDataAccess, validateJsonFile } from './fixDataAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for Railway single volume configuration
const persistentBase = '/app/persistent';
const isRailwaySingleVolume = fs.existsSync(persistentBase);

// Define the path for storing customer data
const dataDir = isRailwaySingleVolume ? path.join(persistentBase, 'data') : path.join(__dirname, '..', 'data');
const customersFile = path.join(dataDir, 'customers.json');

// Log the data directory being used
console.log(`CustomerManager using data directory: ${dataDir} (${isRailwaySingleVolume ? 'single volume' : 'standard'} configuration)`);

// Ensure data directory and permissions are set up correctly
ensureDataAccess();

// Initialize customers data with validation
let customers = [];
try {
  console.log(`Loading customers from: ${customersFile}`);
  customers = validateJsonFile(customersFile, []); // Default to empty array
  
  // Log how many customers were loaded
  console.log(`Loaded ${customers.length} customers from data file`);
  if (customers.length > 0) {
    console.log(`First customer: ${JSON.stringify(customers[0])}`);
  } else {
    console.log('No customers found in data file');
  }
} catch (error) {
  console.error(`Critical error loading customers data: ${error.message}`);
  customers = [];
}

/**
 * Save customers data to file
 * @private
 * @returns {boolean} Success status
 */
function saveCustomers() {
  try {
    fs.writeFileSync(customersFile, JSON.stringify(customers, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving customers data: ${error.message}`);
    return false;
  }
}

/**
 * Add a new customer event
 * @param {Object} customerData - Customer and event information
 * @param {string} customerData.name - Customer name
 * @param {string} customerData.phone - Contact phone number
 * @param {string} customerData.eventName - Name of the event
 * @param {string} customerData.eventDate - Event date in YYYY-MM-DD format
 * @param {string} customerData.spreadsheetUrl - Google Sheets URL for this event
 * @returns {Object} The created customer with ID
 */
export function addCustomer(customerData) {
  const timestamp = getIsraelTimestamp();
  
  try {
    // Validate required fields
    if (!customerData || !customerData.name || !customerData.phone || 
        !customerData.eventName || !customerData.eventDate) {
      console.error(`[${timestamp}] Missing required customer data fields`);
      throw new Error('Missing required customer data fields');
    }
    
    const newCustomer = {
      id: `cust_${Date.now()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      active: true,
      ...customerData
    };
    
    customers.push(newCustomer);
    const saved = saveCustomers();
    
    if (!saved) {
      console.error(`[${timestamp}] Failed to save customers data to file`);
      // Continue anyway since we have the customer in memory
    }
    
    console.log(`[${timestamp}] Added new customer: ${customerData.name}, Event: ${customerData.eventName}`);
    return newCustomer;
  } catch (error) {
    console.error(`[${timestamp}] Error adding customer:`, error);
    throw error;
  }
}

/**
 * Get a specific customer by ID
 * @param {string} id - Customer ID
 * @returns {Object|null} Customer object or null if not found
 */
export function getCustomerById(id) {
  return customers.find(customer => customer.id === id) || null;
}

/**
 * Get all active customers
 * @returns {Array} Array of active customer objects
 */
export function getActiveCustomers() {
  return customers.filter(customer => customer.active);
}

/**
 * Get all customers with events upcoming within the specified days
 * @param {number} days - Number of days from today
 * @returns {Array} Array of customer objects with upcoming events
 */
export function getCustomersWithUpcomingEvents(days = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return customers.filter(customer => {
    if (!customer.active) return false;
    
    const eventDate = new Date(customer.eventDate);
    const timeDiff = eventDate - today;
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    return daysDiff >= 0 && daysDiff <= days;
  });
}

/**
 * Update customer information
 * @param {string} id - Customer ID
 * @param {Object} updatedData - Fields to update
 * @returns {Object|null} Updated customer or null if not found
 */
export function updateCustomer(id, updatedData) {
  const index = customers.findIndex(customer => customer.id === id);
  
  if (index === -1) return null;
  
  customers[index] = {
    ...customers[index],
    ...updatedData,
    updatedAt: getIsraelTimestamp()
  };
  
  saveCustomers();
  return customers[index];
}

/**
 * Deactivate a customer
 * @param {string} id - Customer ID
 * @returns {boolean} Success status
 */
export function deactivateCustomer(id) {
  return updateCustomer(id, { active: false }) !== null;
}

/**
 * Get the existing customer associated with a phone number
 * @param {string} phone - Phone number to look up
 * @returns {Object|null} Customer object or null if not found
 */
export function getCustomerByPhone(phone) {
  return customers.find(customer => customer.phone === phone) || null;
}

/**
 * Check if a phone number belongs to a customer admin
 * @param {string} phone - Phone number to check
 * @returns {boolean} Whether the phone belongs to a customer
 */
export function isCustomerAdmin(phone) {
  return customers.some(customer => customer.phone === phone);
}
