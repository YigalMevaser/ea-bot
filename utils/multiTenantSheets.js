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
        
        const response = await axios.post(appScriptUrl, {
          action,
          secretKey,
          ...data
        });
        
        if (!response.data.success) {
          throw new Error(`API Error: ${response.data.error || 'Unknown error'}`);
        }
        
        return response.data;
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
      const response = await this.makeRequest('getGuests');
      return response.guests || [];
    },
    
    /**
     * Get event details from the spreadsheet
     * @returns {Promise<Object>} Event details
     */
    async getEventDetails() {
      const response = await this.makeRequest('getEventDetails');
      return response.details || {};
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
      return this.makeRequest('updateGuestStatus', {
        phone,
        status,
        guestCount,
        notes,
        lastContacted: getIsraelTimestamp()
      });
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
