/**
 * Phone number utilities for multi-tenant management
 */

import { getActiveCustomers } from './customerManager.js';
import { formatPhoneNumber } from './numberFormatter.js';
import { findCustomerForGuest } from './guestMap.js';

/**
 * Find the customer ID for a given phone number
 * This function helps route guest responses to the correct customer's sheets
 * @param {string} phone - The phone number to look up
 * @returns {string|null} Customer ID or null if not found
 */
export function findCustomerIdByPhone(phone) {
    console.log(`[phoneUtils] Looking up customer for phone: ${phone}`);
    
    if (!phone) {
        console.log('[phoneUtils] No phone number provided');
        return null;
    }

    // First standardize the input phone number
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const phoneDigits = cleanPhone.replace(/[^\d]/g, '');
    console.log(`[phoneUtils] Cleaned phone: ${cleanPhone}, digits only: ${phoneDigits}`);

    // First check if this is a guest phone number we've mapped
    const guestCustomerId = findCustomerForGuest(cleanPhone);
    if (guestCustomerId) {
        console.log(`[phoneUtils] Found guest mapping to customer: ${guestCustomerId}`);
        return guestCustomerId;
    }

    // If not a guest, might be a customer admin - check customer phone numbers
    const formattedPhone = formatPhoneNumber(cleanPhone);
    console.log(`[phoneUtils] No guest mapping found. Formatted admin phone: ${formattedPhone}`);
    
    const customers = getActiveCustomers();
    console.log(`[phoneUtils] Found ${customers.length} active customers`);
    console.log(`[phoneUtils] Active customers:`, customers.map(c => ({ id: c.id, phone: c.phone })));

    // Try exact match with formatted numbers
    if (formattedPhone) {
        console.log(`[phoneUtils] Attempting exact match with formatted admin phone: ${formattedPhone}`);
        for (const customer of customers) {
            const customerFormatted = formatPhoneNumber(customer.phone);
            console.log(`[phoneUtils] Comparing with formatted customer phone: ${customerFormatted}`);
            if (formattedPhone === customerFormatted) {
                console.log(`[phoneUtils] Found exact formatted match with customer: ${customer.id}`);
                return customer.id;
            }
        }
    }
    
    // If no exact match with formatted numbers, try matching just the digits
    console.log(`[phoneUtils] No exact match found. Trying digit-only comparison with: ${phoneDigits}`);
    
    for (const customer of customers) {
        const customerDigits = customer.phone.replace(/[^\d]/g, '');
        console.log(`[phoneUtils] Comparing with customer ${customer.id} digits: ${customerDigits}`);
        
        // Try exact digit match for admin phones
        if (phoneDigits === customerDigits) {
            console.log(`[phoneUtils] Found exact digit match with customer: ${customer.id}`);
            return customer.id;
        }

        // If the number could be the same but with/without country code
        if (phoneDigits.endsWith(customerDigits) || customerDigits.endsWith(phoneDigits)) {
            console.log(`[phoneUtils] Found partial digit match with customer: ${customer.id}`);
            return customer.id;
        }
    }
    
    console.log(`[phoneUtils] No matching customer found for phone: ${phone}`);
    return null;
}
