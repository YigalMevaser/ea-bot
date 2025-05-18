const fs = require('fs');
const QRCode = require('qrcode');

// Replace this with the QR data from your logs
const qrData = "2@WjRK/4+0IUv/fc64DXtP27YS9v5uyUtNPwKnNEXWdrpZUyV8BrACDEPmVjCCsJuNebMOUT2h8+sLnAK6QmDPlufQY2qxrwgePho=,4UP7+fptzOdrrfCQkxCzbs/URZNqDh4IGy6O22kwllA=,29WrqRgGqFzsUdPolVyE5lDr9q6ljaa7TeG9t9dvxFE=,JfC+jjbMAxyOOVBlzB4GlDR3PMukAhdPRSjh0gwXT3k=";

// Generate QR code as an image file
QRCode.toFile('whatsapp-qr.png', qrData, {
  errorCorrectionLevel: 'H',
  type: 'png',
  width: 500,
  margin: 1
}, function(err) {
  // Format date in local timezone (Israel - UTC+3)
  const date = new Date();
  const timestamp = new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
  if (err) {
    console.error(`[${timestamp}] Error generating QR code:`, err);
  } else {
    console.log(`[${timestamp}] QR code generated successfully: whatsapp-qr.png`);
  }
});

// Also create an HTML file with the QR code
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>WhatsApp QR Code</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.0/build/qrcode.min.js"></script>
  <style>
    body { 
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    #qrcode { 
      margin: 20px;
      padding: 20px;
      background: white;
      border-radius: 10px;
    }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>Scan With WhatsApp</h1>
  <div id="qrcode"></div>
  <p>Scan this QR code with WhatsApp to connect your bot</p>
  
  <script>
    // Create a clean QR code with proper sizing
    QRCode.toCanvas(document.getElementById('qrcode'), '${qrData}', {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  </script>
</body>
</html>
`;

fs.writeFileSync('whatsapp-qr.html', htmlContent);
console.log('HTML file created: whatsapp-qr.html');