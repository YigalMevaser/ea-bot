/**
 * WhatsApp Bot Connection Monitor
 * 
 * This script checks the connection status of the bot and attempts recovery
 * if the connection is unstable. Run it on a schedule with a cron job.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pino from 'pino';
import http from 'http';
import https from 'https';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Setup logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logFile = path.join(logDir, `connection-${new Date().toISOString().slice(0,10)}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Custom console logger that writes to file as well
const log = {
  info: (message) => {
    // Format date in local timezone (Israel - UTC+3)
    const date = new Date();
    const timestamp = new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
    const logMessage = `[${timestamp}] [INFO] ${message}\n`;
    console.log(`[${timestamp}] [INFO] ${message}`);
    logStream.write(logMessage);
  },
  error: (message, error) => {
    const date = new Date();
    const timestamp = new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
    const errorStack = error?.stack || error || 'No stack trace';
    const logMessage = `[${timestamp}] [ERROR] ${message}\n${errorStack}\n`;
    console.error(`[${timestamp}] [ERROR] ${message}`, error);
    logStream.write(logMessage);
  },
  warn: (message) => {
    const date = new Date();
    const timestamp = new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
    const logMessage = `[${timestamp}] [WARN] ${message}\n`;
    console.warn(`[${timestamp}] [WARN] ${message}`);
    logStream.write(logMessage);
  }
};

// Get the server hostname - prefer environment variable, or use localhost
const SERVER_HOST = process.env.SERVER_HOST || (process.env.RAILWAY_STATIC_URL ? 
  process.env.RAILWAY_STATIC_URL.replace('https://', '') : 'localhost');

// Choose port - Railway uses PORT=3000
const SERVER_PORT = process.env.PORT || 3000;

// Check if we should use HTTPS (like for Railway)
const useHttps = SERVER_HOST.includes('railway.app') || 
  process.env.USE_HTTPS === 'true' ||
  SERVER_HOST !== 'localhost';

log.info(`Starting connection monitor for ${useHttps ? 'https://' : 'http://'}${SERVER_HOST}:${SERVER_PORT}`);

// Function to check bot health
async function checkBotHealth() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: '/health',
      method: 'GET',
      timeout: 10000 // 10 seconds timeout
    };

    const protocol = useHttps ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const health = JSON.parse(data);
            resolve({
              status: res.statusCode,
              healthy: health.status === 'healthy',
              details: health
            });
          } else {
            resolve({
              status: res.statusCode,
              healthy: false,
              error: `HTTP Error ${res.statusCode}`,
              data
            });
          }
        } catch (e) {
          reject(new Error(`Failed to parse health check response: ${e.message}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error(`Health check request failed: ${e.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timed out'));
    });
    
    req.end();
  });
}

// Main function
async function main() {
  try {
    log.info('Checking bot health status...');
    const healthCheck = await checkBotHealth();
    
    if (healthCheck.healthy) {
      log.info('Bot is healthy and connected!');
      log.info(`Details: ${JSON.stringify(healthCheck.details)}`);
    } else {
      log.warn(`Bot health check failed: ${JSON.stringify(healthCheck)}`);
      
      // You could add more recovery actions here if needed
      // For example, you could send a notification or trigger a restart
    }
  } catch (error) {
    log.error('Error checking bot health:', error);
  }
  
  // Close log stream before exiting
  logStream.end();
}

// Run the main function
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
