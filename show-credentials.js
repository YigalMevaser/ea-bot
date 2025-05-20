#!/usr/bin/env node

/**
 * Show Credentials - Displays the current credentials in a readable format
 */

import { getCredentials } from './utils/credentialsManager.js';

// Customer IDs
const CUSTOMER_IDS = ['cust_1747609067224', 'cust_1747636321249'];

console.log('==== Current Customer Credentials ====\n');

for (const id of CUSTOMER_IDS) {
  const credentials = getCredentials(id);
  
  console.log(`Customer ID: ${id}`);
  if (credentials) {
    console.log(`  App Script URL: ${credentials.appScriptUrl}`);
    console.log(`  Secret Key: ${credentials.secretKey?.substring(0, 5)}... (${credentials.secretKey?.length} chars)`);
  } else {
    console.log('  No credentials found');
  }
  console.log('');
}
