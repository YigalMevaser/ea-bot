// init-all-credentials.js - Initialize credentials for all customers
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Running auto-initialization of credentials for all customers...');

// Check for Railway single volume configuration
const persistentBase = '/app/persistent';
const isRailwaySingleVolume = fs.existsSync(persistentBase);

// Define the path for storing customer data
const dataDir = isRailwaySingleVolume ? path.join(persistentBase, 'data') : path.join(__dirname, 'data');
const customersFile = path.join(dataDir, 'customers.json');
const credentialsFile = path.join(dataDir, 'credentials.json');

// Make sure directories exist
try {
  if (!fs.existsSync(dataDir)) {
    console.log(`Creating data directory: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (error) {
  console.error('Error creating data directory:', error);
}

// Read customers file
let customers = [];
try {
  console.log(`Reading file: ${customersFile}`);
  if (fs.existsSync(customersFile)) {
    const data = fs.readFileSync(customersFile, 'utf8');
    customers = JSON.parse(data);
    console.log(`Found ${customers.length} customers`);
  } else {
    console.warn(`Warning: Customers file not found at ${customersFile}`);
    
    // Try to find fixed-customers.json as a fallback
    const fixedCustomersFile = path.join(dataDir, 'fixed-customers.json');
    if (fs.existsSync(fixedCustomersFile)) {
      console.log(`Using fixed-customers.json as fallback`);
      const fixedData = fs.readFileSync(fixedCustomersFile, 'utf8');
      customers = JSON.parse(fixedData);
      
      // Save this to customers.json
      fs.writeFileSync(customersFile, fixedData);
      console.log(`Restored ${customers.length} customers from fixed data`);
    } else {
      console.error(`No customer data found, cannot initialize credentials`);
    }
  }
} catch (error) {
  console.error('Error reading customers file:', error);
}

// Read or create credentials file
let credentials = {};
try {
  if (fs.existsSync(credentialsFile)) {
    const data = fs.readFileSync(credentialsFile, 'utf8');
    credentials = JSON.parse(data);
    console.log(`Found ${Object.keys(credentials).length} existing credential records`);
  } else {
    console.log(`Creating new credentials file at ${credentialsFile}`);
    credentials = {};
  }
} catch (error) {
  console.error('Error reading credentials file:', error);
  credentials = {};
}

// Initialize credentials for each customer if they don't exist
let modified = false;
for (const customer of customers) {
  if (!customer.id || !customer.appScriptUrl || !customer.secretKey) {
    console.warn(`Skipping customer with incomplete data: ${customer.name || 'unnamed'}`);
    continue;
  }
  
  if (!credentials[customer.id]) {
    console.log(`Initializing credentials for customer: ${customer.name}`);
    credentials[customer.id] = {
      appScriptUrl: customer.appScriptUrl,
      secretKey: customer.secretKey
    };
    modified = true;
  }
}

// Save updated credentials
if (modified) {
  try {
    const data = JSON.stringify(credentials, null, 2);
    fs.writeFileSync(credentialsFile, data);
    fs.chmodSync(credentialsFile, 0o666); // Set permissions to rw-rw-rw-
    console.log(`✅ Updated credentials saved with ${Object.keys(credentials).length} records`);
  } catch (error) {
    console.error('Error saving credentials file:', error);
  }
} else {
  console.log('No credential updates needed');
}

// Verify the credentials.json file
try {
  if (fs.existsSync(credentialsFile)) {
    const stats = fs.statSync(credentialsFile);
    console.log(`Credentials file size: ${stats.size} bytes`);
    
    // Print the number of records
    const verifyData = fs.readFileSync(credentialsFile, 'utf8');
    const verifyCredentials = JSON.parse(verifyData);
    console.log(`Loaded ${Object.keys(verifyCredentials).length} credential records`);
  } else {
    console.error('Credentials file still missing after initialization attempt');
  }
} catch (error) {
  console.error('Error verifying credentials file:', error);
}

console.log('Credential initialization complete');
