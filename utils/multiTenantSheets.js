/**
 * Multi-tenant Google Sheets Integration
 * This module allows interaction with multiple Google Sheets for different customers
 */

import axios from 'axios';
import { getIsraelTimestamp } from './timeUtils.js';
import { getCredentials } from './credentialsManager.js';

/**
 * Create a new AppScriptManager for a specific customer
 * @param {string} customerId - Customer ID
 * @returns {Object|null} AppScriptManager instance or null if no credentials
 */
export function createAppScriptManager(customerId) {
  const credentials = getCredentials(customerId);
  if (!credentials) {
    console.error(`[${getIsraelTimestamp()}] No credentials found for customer ${customerId}`);
    return null;
  }
  
  const { appScriptUrl, secretKey } = credentials;
  
  return {
    /**
     * Format phone number to be consistent
     * @param {string} phone - Phone number to format
     * @returns {string} Formatted phone number
     */
    formatPhoneNumber(phone) {
      if (!phone) return '';
      
      // Strip all non-numeric characters
      const digits = phone.replace(/\D/g, '');
      
      // Handle Israeli numbers that might be missing the country code
      if (digits.length === 10 && digits.startsWith('05')) {
        return '+972' + digits.substring(1);
      } else if (digits.length === 9 && digits.startsWith('5')) {
        return '+972' + digits;
      } else if (digits.startsWith('972')) {
        return '+' + digits;
      } else if (!digits.startsWith('+')) {
        return '+' + digits;
      }
      
      return phone;
    },
    
    /**
     * Make a request to the Google Apps Script web app
     * @private
     * @param {string} action - Action to perform
     * @param {Object} data - Data to send
     * @returns {Promise<Object>} Response data
     */
    async makeRequest(action, data = {}) {
      try {
        const timestamp = getIsraelTimestamp();
        console.log(`[${timestamp}] Making ${action} request for customer ${customerId}`);
        console.log(`[${timestamp}] App Script URL: ${appScriptUrl}`);
        console.log(`[${timestamp}] Secret Key (first 3 chars): ${secretKey.substring(0, 3)}...`);
        
        // First try with secretKey parameter and action parameter (new format)
        const newFormatBody = {
          action,
          secretKey,
          ...data
        };
        console.log(`[${timestamp}] Trying new format request: ${JSON.stringify({...newFormatBody, secretKey: '***hidden***'})}`);
        
        try {
          const response = await axios.post(appScriptUrl, newFormatBody, { timeout: 10000 });
          console.log(`[${timestamp}] New format response status: ${response.status}, data: ${JSON.stringify(response.data)}`);
          
          if (response.data.success) {
            return response.data;
          }
          
          console.log(`[${timestamp}] New format failed, trying operation parameter format`);
        } catch (newFormatError) {
          console.log(`[${timestamp}] New format request failed: ${newFormatError.message}`);
          // Continue to try other formats
        }
        
        // Try with action parameter replaced by operation parameter
        const operationFormatBody = {
          operation: action, // Use operation instead of action
          secretKey,
          ...data
        };
        console.log(`[${timestamp}] Trying operation format request: ${JSON.stringify({...operationFormatBody, secretKey: '***hidden***'})}`);
        
        try {
          const response = await axios.post(appScriptUrl, operationFormatBody, { timeout: 10000 });
          console.log(`[${timestamp}] Operation format response status: ${response.status}, data: ${JSON.stringify(response.data)}`);
          
          if (response.data.success) {
            return response.data;
          }
          
          console.log(`[${timestamp}] Operation format failed, trying old format with key parameter`);
        } catch (operationError) {
          console.log(`[${timestamp}] Operation format request failed: ${operationError.message}`);
          // Continue to try old format
        }
        
        // Try with key parameter (old format)
        const oldFormatBody = {
          operation: action, // Use operation as the parameter name
          key: secretKey,
          ...data
        };
        console.log(`[${timestamp}] Trying old format request: ${JSON.stringify({...oldFormatBody, key: '***hidden***'})}`);
        
        try {
          const response = await axios.post(appScriptUrl, oldFormatBody, { timeout: 10000 });
          console.log(`[${timestamp}] Old format response status: ${response.status}, data: ${JSON.stringify(response.data)}`);
          
          if (!response.data.success) {
            // Both formats failed
            const errorMsg = response.data.error || 'Unknown error';
            console.error(`[${timestamp}] API Error in ${action} for ${customerId}: ${errorMsg}`);
            
            if (response.data.debug) {
              console.error(`[${timestamp}] API Debug info: ${JSON.stringify(response.data.debug)}`);
            }
            
            // Create a basic response structure with success=false but don't throw an error
            // This allows the app to continue with defaults
            console.log(`[${timestamp}] All API formats failed, returning fallback empty response`);
            
            // Construct different fallback responses based on action type
            if (action === 'getEventDetails') {
              return { success: true, details: {} };
            } else if (action === 'getGuests') {
              return { success: true, guests: [] };
            } else {
              return { success: false, error: errorMsg };
            }
          }
          
          return response.data;
        } catch (finalError) {
          console.error(`[${timestamp}] Final API attempt failed for ${customerId}: ${finalError.message}`);
          
          // Provide fallback responses instead of throwing
          if (action === 'getEventDetails') {
            return { success: true, details: {} };
          } else if (action === 'getGuests') {
            return { success: true, guests: [] };
          } else {
            throw new Error(`API Error: ${finalError.message}`);
          }
        }
      } catch (error) {
        console.error(`[${getIsraelTimestamp()}] Error in ${action} for customer ${customerId}:`, error.message);
        throw error;
      }
    },
    
    /**
     * Get all guests from the spreadsheet
     * @returns {Promise<Array>} List of guests
     */
    async getGuests() {
      try {
        const timestamp = getIsraelTimestamp();
        console.log(`[${timestamp}] Getting guest list for ${customerId}...`);
        
        const response = await this.makeRequest('getGuests');
        console.log(`[${timestamp}] Guest list response for ${customerId}: ${JSON.stringify(response)}`);
        
        if (response.guests) {
          console.log(`[${timestamp}] Successfully retrieved ${response.guests.length} guests for ${customerId}`);
          
          if (response.guests.length === 0) {
            console.log(`[${timestamp}] ⚠️ Warning: Guest list is empty for ${customerId}`);
            console.log(`[${timestamp}] This may indicate an issue with sheet names in the Google Apps Script`);
            return [];
          } else if (response.guests.length > 0) {
            console.log(`[${timestamp}] First guest sample: ${JSON.stringify(response.guests[0])}`);
          }
          
          // Normalize the guest data to ensure consistent property names
          const normalizedGuests = response.guests.map(guest => {
            // Format the phone number consistently
            const rawPhone = guest.phone || guest.Phone || '';
            const formattedPhone = this.formatPhoneNumber(rawPhone);
            
            return {
              name: guest.name || guest.Name || '',
              phone: formattedPhone,
              email: guest.email || guest.Email || '',
              status: guest.status || guest.Status || 'Pending',
              count: guest.count || guest.guestCount || guest.GuestCount || '0',
              notes: guest.notes || guest.Notes || '',
              lastContacted: guest.lastContacted || guest.LastContacted || '',
              // Also include uppercase properties for backward compatibility
              Name: guest.name || guest.Name || '',
              Phone: formattedPhone,
              Email: guest.email || guest.Email || '',
              Status: guest.status || guest.Status || 'Pending',
              GuestCount: guest.count || guest.guestCount || guest.GuestCount || '0',
              Notes: guest.notes || guest.Notes || '',
              LastContacted: guest.lastContacted || guest.LastContacted || ''
            };
          });
          
          console.log(`[${timestamp}] Normalized first guest: ${JSON.stringify(normalizedGuests[0])}`);
          return normalizedGuests;
        } else {
          console.log(`[${timestamp}] ⚠️ Warning: No guests property in response for ${customerId}: ${JSON.stringify(response)}`);
          return [];
        }
      } catch (error) {
        console.error(`[${getIsraelTimestamp()}] Error getting guest list for ${customerId}: ${error.message}`);
        return [];
      }
    },
    
    /**
     * Get event details from the spreadsheet
     * @returns {Promise<Object>} Event details
     */
    async getEventDetails() {
      try {
        const timestamp = getIsraelTimestamp();
        console.log(`[${timestamp}] Getting event details for ${customerId}...`);
        
        const response = await this.makeRequest('getEventDetails');
        console.log(`[${timestamp}] Event details response: ${JSON.stringify(response)}`);
        
        // Check if we have details in the response
        if (!response.details) {
          console.error(`[${timestamp}] No details property in response for ${customerId}`);
          return {};
        }
        
        const rawDetails = response.details;
        console.log(`[${timestamp}] Raw details: ${JSON.stringify(rawDetails)}`);
        
        // Create normalized details with support for both upper and lowercase properties
        const normalizedDetails = {
          // Standard lowercase properties with fallback to uppercase
          name: rawDetails.name || rawDetails.Name || '',
          date: rawDetails.date || rawDetails.Date || '',
          time: rawDetails.time || rawDetails.Time || '',
          location: rawDetails.location || rawDetails.Location || '',
          description: rawDetails.description || rawDetails.Description || '',
          
          // Also include uppercase properties for backward compatibility
          Name: rawDetails.name || rawDetails.Name || '',
          Date: rawDetails.date || rawDetails.Date || '',
          Time: rawDetails.time || rawDetails.Time || '',
          Location: rawDetails.location || rawDetails.Location || '',
          Description: rawDetails.description || rawDetails.Description || ''
        };
        
        console.log(`[${timestamp}] Normalized details: ${JSON.stringify(normalizedDetails)}`);
        return normalizedDetails;
      } catch (error) {
        console.error(`[${getIsraelTimestamp()}] Error getting event details for ${customerId}: ${error.message}`);
        return {};
      }
    },
    
    /**
     * Update guest status in the spreadsheet
     * @param {string} phone - Guest phone number
     * @param {string} status - New status (Confirmed, Declined)
     * @param {number} guestCount - Number of guests attending
     * @param {string} notes - Additional notes
     * @returns {Promise<Object>} Updated guest data
     */
    async updateGuestStatus(phone, status, guestCount = 1, notes = '') {
      const timestamp = getIsraelTimestamp();
      const formattedPhone = this.formatPhoneNumber(phone);
      console.log(`[${timestamp}] Updating guest status for phone: ${formattedPhone}, status: ${status}, count: ${guestCount}`);
      
      // Try up to 3 times
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await this.makeRequest('updateGuestStatus', {
            phone: formattedPhone,
            status,
            guestCount,
            notes,
            lastContacted: getIsraelTimestamp()
          });
          
          console.log(`[${timestamp}] Successfully updated guest status for ${formattedPhone}`);
          return result;
        } catch (error) {
          console.error(`[${timestamp}] Error updating guest status (attempt ${attempt}/3): ${error.message}`);
          
          if (attempt < 3) {
            // Wait a bit before retrying
            console.log(`[${timestamp}] Retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            // All retries failed
            throw new Error(`Failed to update guest status after 3 attempts: ${error.message}`);
          }
        }
      }
    },
    
    /**
     * Get RSVP statistics
     * @returns {Promise<Object>} RSVP statistics
     */
    async getRsvpStats() {
      const response = await this.makeRequest('getRsvpStats');
      return response.stats || {};
    },
    
    /**
     * Mark guest as contacted
     * @param {string} phone - Guest phone number
     * @returns {Promise<Object>} Updated guest data
     */
    async markGuestContacted(phone) {
      return this.makeRequest('markGuestContacted', {
        phone,
        lastContacted: getIsraelTimestamp()
      });
    }
  };
}
