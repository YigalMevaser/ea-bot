/**
 * Auto-restart script for WhatsApp RSVP Bot
 * 
 * This script checks if the bot process is running and restarts it if not.
 * Use this with system-level monitoring tools like cron or systemd.
 * For Railway deployment, you can set up a periodic trigger to run this.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import http from 'http';
import https from 'https';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if the app is running on Railway.app
const isRailway = process.env.RAILWAY_STATIC_URL ? true : false;
const SERVER_HOST = isRailway ? process.env.RAILWAY_STATIC_URL.replace('https://', '') : 'localhost';
const SERVER_PORT = process.env.PORT || 3000;
const useHttps = isRailway || SERVER_HOST !== 'localhost';
// Format date in local timezone (Israel - UTC+3)
const date = new Date();
const timestamp = new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');

console.log(`[${timestamp}] Starting auto-restart check for ${useHttps ? 'https://' : 'http://'}${SERVER_HOST}:${SERVER_PORT}`);
console.log(`[${timestamp}] Running in ${isRailway ? 'Railway.app' : 'local'} environment`);

// Function to check if the bot is responsive
function checkBotHealth() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: '/health',
      method: 'GET',
      timeout: 10000
    };

    const protocol = useHttps ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const health = JSON.parse(data);
            resolve({
              healthy: health.status === 'healthy' && health.botConnected,
              details: health
            });
          } catch (e) {
            resolve({ healthy: false, error: 'Invalid JSON response' });
          }
        } else {
          resolve({ 
            healthy: false, 
            error: `HTTP status code: ${res.statusCode}` 
          });
        }
      });
    });
    
    req.on('error', () => {
      resolve({ healthy: false, error: 'Connection error' });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, error: 'Connection timeout' });
    });
    
    req.end();
  });
}

// Main function - checks health and takes action if needed
async function main() {
  try {
    // Format date in local timezone (Israel - UTC+3)
    const date = new Date();
    const checkTimestamp = new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
    console.log(`[${checkTimestamp}] Checking bot health...`);
    const health = await checkBotHealth();
    
    if (health.healthy) {
      console.log(`[${checkTimestamp}] Bot is healthy!`);
      process.exit(0);
    }
    
    console.warn(`[${checkTimestamp}] Bot health check failed:`, health.error || 'Unknown reason');
    
    // For Railway, we can't restart directly, but we can log this for monitoring
    if (isRailway) {
      console.error(`[${checkTimestamp}] BOT_NEEDS_RESTART: Health check failed on Railway deployment`);
      // Railway will see this error in logs and can be configured to restart
      process.exit(1);
    }
    
    // For local deployment, attempt to restart the bot
    console.log(`[${checkTimestamp}] Attempting to restart the bot...`);
    
    exec('npm restart', (error, stdout, stderr) => {
      if (error) {
        console.error(`[${checkTimestamp}] Failed to restart bot:`, error);
        process.exit(1);
      }
      
      console.log(`[${checkTimestamp}] Bot restart initiated successfully`);
      console.log(`[${checkTimestamp}] ${stdout}`);
      
      if (stderr) {
        console.error(`[${checkTimestamp}] Restart stderr:`, stderr);
      }
      
      process.exit(0);
    });
    
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[${errorTimestamp}] Error in auto-restart check:`, error);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  const fatalTimestamp = new Date().toISOString();
  console.error(`[${fatalTimestamp}] Fatal error:`, err);
  process.exit(1);
});
