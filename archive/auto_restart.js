
// auto_restart.js - Automatically restarts the bot if it crashes
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configure log file
const LOG_FILE = path.join(__dirname, 'bot.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Function to start the bot
function startBot() {
    // Log start time
    logStream.write(`\n[${new Date().toISOString()}] Starting bot...\n`);
    
    // Start the bot process
    const bot = spawn('node', ['start/run.js'], { 
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' }
    });
    
    // Pipe stdout and stderr to both console and log file
    bot.stdout.pipe(process.stdout);
    bot.stderr.pipe(process.stderr);
    bot.stdout.pipe(logStream);
    bot.stderr.pipe(logStream);
    
    // Restart on exit
    bot.on('exit', (code) => {
        logStream.write(`\n[${new Date().toISOString()}] Bot exited with code ${code}. Restarting in 30 seconds...\n`);
        setTimeout(startBot, 30000); // Restart after 30 seconds
    });
    
    // Handle errors
    bot.on('error', (error) => {
        logStream.write(`\n[${new Date().toISOString()}] Error: ${error.message}\n`);
    });
}

// Start the bot initially
startBot();

console.log('Auto-restart script running. Bot will automatically restart if it crashes.');
console.log(`Logs are being written to ${LOG_FILE}`);
