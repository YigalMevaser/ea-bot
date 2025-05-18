/**
 * Data Directory Access Fix - A utility to ensure data files are accessible
 * This is used to repair permissions and file access issues
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Repair and ensure the data directory and files are set up correctly
 */
export function ensureDataAccess() {
  console.log('Checking data directory access...');
  
  // Define paths
  const dataDir = path.join(__dirname, '..', 'data');
  const customersFile = path.join(dataDir, 'customers.json');
  const credentialsFile = path.join(dataDir, 'credentials.json');
  
  // Ensure data directory exists with proper permissions
  try {
    if (!fs.existsSync(dataDir)) {
      console.log('Creating data directory...');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o777 });
    } else {
      // Set permissions to ensure writeability
      console.log('Setting data directory permissions...');
      fs.chmodSync(dataDir, 0o777);
    }
  } catch (error) {
    console.error(`Error setting up data directory: ${error.message}`);
  }
  
  // Ensure customers file exists
  try {
    if (!fs.existsSync(customersFile)) {
      console.log('Creating customers file...');
      fs.writeFileSync(customersFile, JSON.stringify([], null, 2), { mode: 0o666 });
    } else {
      console.log('Setting customers file permissions...');
      fs.chmodSync(customersFile, 0o666);
    }
  } catch (error) {
    console.error(`Error setting up customers file: ${error.message}`);
  }
  
  // Ensure credentials file exists
  try {
    if (!fs.existsSync(credentialsFile)) {
      console.log('Creating credentials file...');
      fs.writeFileSync(credentialsFile, JSON.stringify({}, null, 2), { mode: 0o666 });
    } else {
      console.log('Setting credentials file permissions...');
      fs.chmodSync(credentialsFile, 0o666);
    }
  } catch (error) {
    console.error(`Error setting up credentials file: ${error.message}`);
  }
  
  // Test write access
  try {
    const testFile = path.join(dataDir, '.permission_test');
    fs.writeFileSync(testFile, 'permission test');
    fs.unlinkSync(testFile);
    console.log('✓ Data directory is writable');
  } catch (error) {
    console.error(`× Data directory is NOT writable: ${error.message}`);
  }
  
  console.log('Data directory access check complete');
}

/**
 * Check if a JSON file is properly formed and readable
 * @param {string} filePath - Path to the JSON file
 * @returns {Object} The parsed JSON or empty object/array
 */
export function validateJsonFile(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      console.log(`Reading file: ${filePath}`);
      const contents = fs.readFileSync(filePath, 'utf8');
      
      // Check if empty
      if (!contents || contents.trim() === '') {
        console.log(`File ${filePath} is empty, using default value`);
        
        // Write default value
        const isArray = Array.isArray(defaultValue);
        fs.writeFileSync(filePath, JSON.stringify(isArray ? [] : {}, null, 2));
        
        return isArray ? [] : {};
      }
      
      // Try to parse JSON
      try {
        return JSON.parse(contents);
      } catch (parseError) {
        console.error(`Error parsing JSON in ${filePath}: ${parseError.message}`);
        
        // Backup corrupted file
        const backupPath = `${filePath}.corrupted-${Date.now()}`;
        fs.copyFileSync(filePath, backupPath);
        console.log(`Backed up corrupted file to ${backupPath}`);
        
        // Create new file with default value
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
        return defaultValue;
      }
    } else {
      console.log(`File ${filePath} doesn't exist, creating...`);
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
  } catch (error) {
    console.error(`Error accessing ${filePath}: ${error.message}`);
    return defaultValue;
  }
}
