// Simple startup script for Event RSVP Bot
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting Event RSVP Bot...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

// Fix permissions and create directories
try {
  // Check for Railway single volume configuration
  const persistentBase = '/app/persistent';
  const isRailwaySingleVolume = fs.existsSync(persistentBase);
  
  // Define paths based on whether we're using the single volume setup
  let sessionPath;
  if (process.env.SESSION_PATH) {
    // If SESSION_PATH is explicitly set, use it (for backwards compatibility)
    sessionPath = process.env.SESSION_PATH;
    console.log(`Using explicitly set SESSION_PATH: ${sessionPath}`);
  } else if (isRailwaySingleVolume) {
    // If using single volume and SESSION_PATH not set, use the persistent session directory
    sessionPath = path.join(persistentBase, 'session');
    console.log(`Using Railway single volume SESSION_PATH: ${sessionPath}`);
  } else {
    // Default case - local development
    sessionPath = path.join(__dirname, 'session');
    console.log(`Using default SESSION_PATH: ${sessionPath}`);
  }
  
  // Set data and logs paths
  const dataPath = isRailwaySingleVolume ? path.join(persistentBase, 'data') : path.join(__dirname, 'data');
  const logsPath = isRailwaySingleVolume ? path.join(persistentBase, 'logs') : path.join(__dirname, 'logs');
  
  console.log('Setting up critical directories with proper permissions...');
  console.log(`Using ${isRailwaySingleVolume ? 'single Railway volume configuration' : 'standard directory configuration'}`);
  
  // Create directories if they don't exist and set permissions
  for (const dir of [sessionPath, dataPath, logsPath]) {
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
    } else {
      console.log(`Setting permissions for: ${dir}`);
      try {
        fs.chmodSync(dir, 0o777);
      } catch (permError) {
        console.warn(`Unable to set permissions for ${dir}: ${permError.message}`);
      }
    }
  }
  
  // Initialize basic data files
  const customersFile = path.join(dataPath, 'customers.json');
  const credentialsFile = path.join(dataPath, 'credentials.json');
  
  if (!fs.existsSync(customersFile)) {
    console.log(`Creating customers file: ${customersFile}`);
    fs.writeFileSync(customersFile, JSON.stringify([], null, 2), { mode: 0o666 });
  }
  
  if (!fs.existsSync(credentialsFile)) {
    console.log(`Creating credentials file: ${credentialsFile}`);
    fs.writeFileSync(credentialsFile, JSON.stringify({}, null, 2), { mode: 0o666 });
  }
  
  // Try to ensure we have write permissions (this might fail if not root)
  try {
    console.log('Checking write permissions for critical directories...');
    
    // Test session directory
    const testSessionFile = path.join(sessionPath, '.permission_test');
    fs.writeFileSync(testSessionFile, 'permission test');
    fs.unlinkSync(testSessionFile);
    console.log('✓ Write permissions confirmed for session directory');
    
    // Test data directory
    const testDataFile = path.join(dataPath, '.permission_test');
    fs.writeFileSync(testDataFile, 'permission test');
    fs.unlinkSync(testDataFile);
    console.log('✓ Write permissions confirmed for data directory');
    
    // Test logs directory
    const testLogsFile = path.join(logsPath, '.permission_test');
    fs.writeFileSync(testLogsFile, 'permission test');
    fs.unlinkSync(testLogsFile);
    console.log('✓ Write permissions confirmed for logs directory');
  } catch (permError) {
    console.warn(`⚠️ Permission issue detected: ${permError.message}`);
    console.warn('The application might fail when writing to directories. Consider running with elevated privileges.');
  }
} catch (error) {
  console.error(`Error setting up directories: ${error.message}`);
}

// Check that required environment variables are set
if (!process.env.EVENT_DATE) {
  console.warn('Warning: EVENT_DATE is not set in .env file. Using current date + 30 days as fallback.');
  // Set a default event date 30 days from now
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 30);
  process.env.EVENT_DATE = defaultDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
  console.log(`Using fallback EVENT_DATE: ${process.env.EVENT_DATE}`);
}

// Check that required environment variables are set (required for multi-tenant operation)
if (!process.env.SECRET_KEY) {
  console.error('❌ Missing SECRET_KEY – aborting');
  process.exit(1);
}
if (!process.env.APPS_SCRIPT_URL) {
  console.error('❌ Missing APPS_SCRIPT_URL – aborting');
  process.exit(1);
}
// Check that required dependencies are installed
try {
  await import('date-fns');
  console.log('✓ date-fns dependency found');
} catch (error) {
  console.warn('Warning: date-fns package is missing. Using fallbacks for date calculations.');
  console.warn('To fix this, run: npm install date-fns@^2.30.0');
}

// Start the bot
import './index.js';