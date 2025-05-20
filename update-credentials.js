#!/usr/bin/env node

/**
 * Update Credentials with Web App URLs
 * This script updates your credentials.json file with the Web App URLs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const credentialsFile = path.join(__dirname, 'data', 'credentials.json');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function promptUser(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Main function
async function updateCredentials() {
  console.log('=== Update Web App URLs in credentials.json ===\n');
  
  // Load current credentials
  let credentials;
  try {
    const data = fs.readFileSync(credentialsFile, 'utf8');
    credentials = JSON.parse(data);
    
    console.log('Current credentials:');
    console.log(JSON.stringify(credentials, null, 2));
    console.log('\n');
  } catch (error) {
    console.error(`Error loading credentials file: ${error.message}`);
    process.exit(1);
  }

  // Get URLs from user
  console.log('Please enter the FULL Web App URLs from your Google Apps Script deployments.\n');
  
  // Yigal and Shiran
  const yigalUrl = await promptUser('Yigal and Shiran Web App URL: ');
  
  // Yasmin and Netanel
  const yasminUrl = await promptUser('Yasmin and Netanel Web App URL: ');
  
  // Update credentials
  credentials.cust_1747609067224.appScriptUrl = yigalUrl || credentials.cust_1747609067224.appScriptUrl;
  credentials.cust_1747636321249.appScriptUrl = yasminUrl || credentials.cust_1747636321249.appScriptUrl;
  
  // Write the updated credentials
  try {
    fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2));
    console.log('\nCredentials updated successfully!');
  } catch (error) {
    console.error(`Error writing credentials file: ${error.message}`);
  }
  
  rl.close();
}

// Run the script
updateCredentials();
