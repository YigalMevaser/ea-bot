#!/usr/bin/env node

/**
 * Credentials Verification Script
 * This script verifies the API credentials for all customers
 * and attempts to make a test call to their Google Apps Script
 * 
 * Usage: 
 *   node verify-credentials.js
 */

import { getActiveCustomers } from './utils/customerManager.js';
import { getCredentials } from './utils/credentialsManager.js';
import axios from 'axios';
import { getIsraelTimestamp } from './utils/timeUtils.js';

// Log function with timestamp
function log(message) {
  console.log(`[${getIsraelTimestamp()}] ${message}`);
}

// Make test request to the Google Apps Script
async function testApiConnection(appScriptUrl, secretKey) {
  try {
    log(`Testing API connection to ${appScriptUrl}`);
    log(`Using secret key starting with: ${secretKey.substring(0, 3)}...`);
    
    // First, try with secretKey parameter (new format)
    const response1 = await axios.post(appScriptUrl, {
      action: 'getEventDetails',
      secretKey: secretKey
    });
    
    if (response1.data.success) {
      log('✅ API connection successful with secretKey parameter!');
      return {
        success: true,
        format: 'new',
        response: response1.data
      };
    }
    
    log('API request with secretKey parameter failed, trying key parameter');
    
    // If that fails, try with key parameter (old format)
    const response2 = await axios.post(appScriptUrl, {
      action: 'getEventDetails',
      key: secretKey
    });
    
    if (response2.data.success) {
      log('✅ API connection successful with key parameter!');
      return {
        success: true,
        format: 'old',
        response: response2.data
      };
    }
    
    log('❌ API connection failed with both formats');
    return {
      success: false,
      error: 'Both request formats failed',
      responses: {
        newFormat: response1.data,
        oldFormat: response2.data
      }
    };
  } catch (error) {
    log(`❌ API connection error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Main function
async function main() {
  log('=== Credentials Verification ===');
  
  try {
    // Get all active customers
    const customers = getActiveCustomers();
    log(`Found ${customers.length} active customers`);
    
    if (customers.length === 0) {
      log('No active customers found');
      return;
    }
    
    // Test each customer's credentials
    for (const customer of customers) {
      log(`\nVerifying credentials for customer: ${customer.name} (${customer.id})`);
      
      // Get credentials for this customer
      const credentials = getCredentials(customer.id);
      
      if (!credentials) {
        log(`❌ No credentials found for ${customer.id}`);
        continue;
      }
      
      log(`Found credentials for ${customer.id}`);
      log(`App Script URL: ${credentials.appScriptUrl}`);
      log(`Secret Key (first 3 chars): ${credentials.secretKey.substring(0, 3)}...`);
      
      // Test the API connection for this customer
      const testResult = await testApiConnection(credentials.appScriptUrl, credentials.secretKey);
      
      if (testResult.success) {
        log(`✅ Connection successful for ${customer.name} (${customer.id})`);
        log(`Using format: ${testResult.format === 'new' ? 'secretKey' : 'key'} parameter`);
        log(`Event details: ${JSON.stringify(testResult.response.details?.Name || 'Unknown')}`);
      } else {
        log(`❌ Connection failed for ${customer.name} (${customer.id})`);
        log(`Error: ${testResult.error}`);
        if (testResult.responses) {
          log(`New format response: ${JSON.stringify(testResult.responses.newFormat)}`);
          log(`Old format response: ${JSON.stringify(testResult.responses.oldFormat)}`);
        }
      }
    }
    
  } catch (error) {
    log(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main().then(() => {
  log('\nCredentials verification complete');
}).catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});
