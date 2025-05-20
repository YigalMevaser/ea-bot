#!/usr/bin/env node

/**
 * Deploy Final Fixed Version of Yasmin & Netanel Script
 * This script helps deploy the final fixed version of the script with corrected column mapping
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const FIXED_SCRIPT_PATH = path.join(__dirname, 'final-fixed-yasmin-netanel-script.js');
const GOOGLE_SCRIPT_URL = 'https://script.google.com/home/projects/';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m', 
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

// Main function
async function main() {
  try {
    // Debug mode
    console.log('Script started');
    console.log(`${colors.cyan}=== Deploy Final Fixed Yasmin & Netanel Script ===${colors.reset}\n`);
    
    // Step 1: Read the script file
    console.log(`${colors.blue}Reading final fixed script file...${colors.reset}`);
    
    if (!fs.existsSync(FIXED_SCRIPT_PATH)) {
      console.error(`${colors.red}ERROR: Fixed script file not found at ${FIXED_SCRIPT_PATH}${colors.reset}`);
      process.exit(1);
    }
    
    const scriptContent = fs.readFileSync(FIXED_SCRIPT_PATH, 'utf8');
    console.log(`${colors.green}✓ Fixed script file read successfully (${scriptContent.length} bytes)${colors.reset}\n`);
    
    // Step 2: Display deployment instructions
    console.log(`${colors.yellow}Instructions:${colors.reset}`);
    console.log(`1. Open your Google Apps Script for Yasmin & Netanel`);
    console.log(`   URL: ${colors.blue}https://script.google.com/home/all${colors.reset}`);
    console.log(`2. Select all code (Ctrl+A or Command+A) and delete it`);
    console.log(`3. Copy the following code and paste it (Ctrl+V or Command+V):\n`);
    
    console.log(`${colors.yellow}================ COPY FROM HERE ================\n${colors.reset}`);
    console.log(scriptContent);
    console.log(`\n${colors.yellow}================ COPY TO HERE ================\n${colors.reset}`);
    
    console.log(`4. Save the script (Ctrl+S or Command+S)`);
    console.log(`5. Deploy as a new web app version (Deploy > New deployment)`);
    console.log(`6. Select "Anyone" under "Who has access"`);
    console.log(`7. Click "Deploy" and copy the new URL\n`);
    
    // Step 3: Ask for confirmation
    const askDeploymentStatus = () => {
      rl.question(`Have you copied the script and deployed it? (yes/no): `, (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
          askForNewUrl();
        } else if (answer.toLowerCase() === 'no' || answer.toLowerCase() === 'n') {
          console.log(`\n${colors.yellow}Please follow the instructions to deploy the script.${colors.reset}`);
          askDeploymentStatus();
        } else {
          askDeploymentStatus();
        }
      });
    };
    
    // Step 4: Ask for the new URL
    const askForNewUrl = () => {
      console.log(`${colors.green}✓ Great! Continue with the next steps.${colors.reset}`);
      rl.question(`Paste the NEW script URL from the deployment: `, (url) => {
        if (!url) {
          console.log(`${colors.red}No URL provided. Please provide the deployment URL.${colors.reset}`);
          askForNewUrl();
          return;
        }
        
        console.log(`${colors.green}✓ New script URL received: ${url}${colors.reset}\n`);
        
        // Extract the script ID from the URL
        const scriptIdMatch = url.match(/\/s\/(.*?)\/exec/);
        const scriptId = scriptIdMatch ? scriptIdMatch[1] : url;
        
        // Step 5: Display next steps
        console.log(`To update your environment with the new URL, run:\n`);
        console.log(`${colors.blue}Railway Environment Variable:${colors.reset}`);
        console.log(`CUSTOMER_SCRIPT_cust_1747636321249=${url}\n`);
        
        // Display testing commands
        console.log(`${colors.blue}For testing, you can use:${colors.reset}`);
        console.log(`curl -L -X POST "${url}" \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -d '{"action":"getGuests","secretKey":"secretkey_cust_1747636321249_8261"}'\n`);
        
        // Step 6: Wrap up
        console.log(`${colors.yellow}=== Next Steps ===${colors.reset}`);
        console.log(`1. Update the Railway environment variable with the new URL`);
        console.log(`2. Restart the EA Bot service on Railway`);
        console.log(`3. Check the dashboard to verify guests are displayed correctly\n`);
        
        console.log(`${colors.green}=== Deployment Complete ===${colors.reset}`);
        rl.close();
      });
    };
    
    // Start the process
    askDeploymentStatus();
    
  } catch (error) {
    console.error(`${colors.red}ERROR: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the main function
main();
