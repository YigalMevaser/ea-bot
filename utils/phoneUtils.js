/**
 * Phone number utilities for multi-tenant management
 */

import { getActiveCustomers } from './customerManager.js';
import { formatPhoneNumber } from './numberFormatter.js';

/**
 * Find the customer ID for a given phone number
 * This function helps route guest responses to the correct customer's sheets
 * @param {string} phone - The phone number to look up
 * @returns {string|null} Customer ID or null if not found
 */
export function findCustomerIdByPhone(phone) {
    const formattedPhone = formatPhoneNumber(phone);
    const customers = getActiveCustomers();
    
    // First try exact match
    const exactMatch = customers.find(c => c.phone === formattedPhone);
    if (exactMatch) {
        return exactMatch.id;
    }
    
    // Then try matching just the digits
    const phoneDigits = formattedPhone.replace(/\D/g, '');
    for (const customer of customers) {
        const customerDigits = customer.phone.replace(/\D/g, '');
        // Match if the shorter number is contained within the longer one
        if (phoneDigits.includes(customerDigits) || customerDigits.includes(phoneDigits)) {
            return customer.id;
        }
    }
    
    return null;
}
