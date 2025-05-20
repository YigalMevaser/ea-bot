#!/usr/bin/env node

/**
 * Credentials Initialization Script
 * This script initializes the API credentials for an existing customer
 * 
 * Usage: 
 * - For customers with Apps Script URLs:
 *   node init-credentials.js <customerId> <secretKey>
 * 
 * - For customers with Google Sheets URLs:
 *   node init-credentials.js <customerId> <secretKey> <appsScriptUrl>
 */

// Run this as an ES module
async function main() {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  
  // Import our utility modules
  const { storeCredentials } = await import('./utils/credentialsManager.js');
  const { getCustomerById } = await import('./utils/customerManager.js');
  
  // Get ES module dirname equivalent
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  // Get command line arguments
  const customerId = process.argv[2];
  const secretKey = process.argv[3];

  if (!customerId || !secretKey) {
    console.error('Usage:');
    console.error('- For customers with Apps Script URLs:');
    console.error('  node init-credentials.js <customerId> <secretKey>');
    console.error('- For customers with Google Sheets URLs:');
    console.error('  node init-credentials.js <customerId> <secretKey> <appsScriptUrl>');
    process.exit(1);
  }

  // Get the customer to extract the appScriptUrl
  const customer = getCustomerById(customerId);
  if (!customer) {
    console.error(`Customer with ID ${customerId} not found`);
    process.exit(1);
  }

  // Extract the appScriptUrl from the customer's spreadsheetUrl
  let appScriptUrl = customer.spreadsheetUrl;
  if (!appScriptUrl) {
    console.error(`No spreadsheetUrl found for customer ${customerId}`);
    process.exit(1);
  }
  
  // Check if it's a Google Sheets URL and convert it to an Apps Script URL if needed
  if (appScriptUrl.includes("docs.google.com/spreadsheets")) {
    console.log("Converting Google Sheets URL to Apps Script URL");
    // Note: This is a placeholder. In production, you would need to deploy an Apps Script
    // for each spreadsheet and get its URL. Here, we're generating a dummy URL.
    const spreadsheetId = appScriptUrl.split('/d/')[1].split('/')[0];
    console.log(`Extracted Spreadsheet ID: ${spreadsheetId}`);
    
    // Check if a script URL was provided as the third argument
    const scriptUrl = process.argv[4]; // Optional script URL as 4th argument
    if (scriptUrl && scriptUrl.includes('script.google.com')) {
      appScriptUrl = scriptUrl;
      console.log(`Using provided script URL: ${appScriptUrl}`);
    } else {
      console.error("ERROR: For Google Sheets URLs, you need to provide an Apps Script URL as the fourth argument.");
      console.error("Usage: node init-credentials.js <customerId> <secretKey> <appsScriptUrl>");
      process.exit(1);
    }
  }

  console.log('==== Credentials Initialization ====');
  console.log(`Customer ID: ${customerId}`);
  console.log(`Customer Name: ${customer.name}`);
  console.log(`Apps Script URL: ${appScriptUrl}`);
  console.log(`Secret Key: ${secretKey.substring(0, 3)}...`);

  try {
    // Store the credentials
    storeCredentials(customerId, { appScriptUrl, secretKey });
    console.log('\nCredentials stored successfully!');
    
    // Verify that credentials.json now has content
    const credentialsPath = path.join(__dirname, 'data', 'credentials.json');
    const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
    console.log(`\nCredentials file size: ${credentialsContent.length} bytes`);
    
    if (credentialsContent.length > 10) {
      console.log('Credentials file appears to have content.');
      console.log('Credential storage successful!');
    } else {
      console.log('WARNING: Credentials file appears to be empty or very small.');
    }
  } catch (error) {
    console.error('\nError storing credentials:', error);
    process.exit(1);
  }

  // Success!
  console.log('\nYou can now try accessing the dashboard again. The 500 errors should be resolved.');
}

// Execute the main function
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
