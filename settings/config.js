/*─────────────────────────────────────────
  GitHub   : https://github.com/kiuur    
  YouTube  : https://youtube.com/@kyuurzy
  Rest API : https://laurine.site        
  Telegram : https://kyuucode.t.me       
──────────────────────────────────────────*/

import fs from 'fs';
import { fileURLToPath } from 'url';

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);

// Original configuration
global.owner = "6281351692548"
global.linkch = "https://whatsapp.com/channel/0029Vask3D80rGiHtQYeeo27"

global.status = true
global.welcome = true

global.mess = {
    owner: "no, this is for owners only",
    group: "this is for groups only",
    private: "this is specifically for private chat"
}

global.packname = '¿? laurine'
global.author = 'https://www.kyuurzy.tech'
global.pairing = "PELERRRR"

global.KEY = "GET APIKEY elevenlabs.io"
global.IDVOICE = "GET ON elevenlabs.io"

// Add Event RSVP Bot configuration
global.eventConfig = {
    name: "Family Event RSVP Bot",
    version: "1.0.0",
    description: "WhatsApp bot for managing event RSVPs"
}

// Watch for file changes
const file = fileURLToPath(import.meta.url);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log('\x1b[0;32m' + file + ' \x1b[1;32mupdated!\x1b[0m');
  process.exit(0); // Restart the app when config changes
});