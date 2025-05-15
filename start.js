// Simple startup script for Event RSVP Bot
import 'dotenv/config';
import './index.js';

console.log('Starting Event RSVP Bot...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Using mock data: ${process.env.USE_MOCK_DATA === 'true' ? 'Yes' : 'No'}`);