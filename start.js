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

// Check that required environment variables are set
if (!process.env.EVENT_DATE) {
  console.warn('Warning: EVENT_DATE is not set in .env file. Using current date + 30 days as fallback.');
  // Set a default event date 30 days from now
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 30);
  process.env.EVENT_DATE = defaultDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
  console.log(`Using fallback EVENT_DATE: ${process.env.EVENT_DATE}`);
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