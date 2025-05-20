/**
 * Customer-specific dashboard routes
 * This module handles routing for individual customer dashboards
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCustomerById, getCustomerByPhone } from '../utils/customerManager.js';
import { createAppScriptManager } from '../utils/multiTenantSheets.js';
import { getIsraelTimestamp } from '../utils/timeUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Dashboard authentication middleware customized for multi-tenant
function customerDashboardAuth(req, res, next) {
  // Get the customer ID from the URL parameter
  const customerId = req.params.customerId;
  
  // Check if customer exists
  const customer = getCustomerById(customerId);
  if (!customer) {
    return res.status(404).send('Customer not found');
  }
  
  // Check for dashboard token in cookies
  const cookieName = `dashboard_token_${customerId}`;
  const token = req.cookies?.[cookieName];
  
  if (!token) {
    // Redirect to customer-specific login page
    return res.redirect(`/dashboard/${customerId}/login`);
  }
  
  // Simple token validation (for now a fixed password)
  const DASHBOARD_PASSWORD = '1234'; // Should be per-customer in production
  if (token !== DASHBOARD_PASSWORD) {
    res.clearCookie(cookieName);
    return res.redirect(`/dashboard/${customerId}/login`);
  }
  
  // Add customer to the request object
  req.customer = customer;
  next();
}

// Dashboard login page for specific customer
router.get('/dashboard/:customerId/login', (req, res) => {
  const customerId = req.params.customerId;
  
  // Check if customer exists
  const customer = getCustomerById(customerId);
  if (!customer) {
    return res.status(404).send('Customer not found');
  }
  
  // Check if user is already authenticated via cookie
  const cookieName = `dashboard_token_${customerId}`;
  if (req.cookies?.[cookieName]) {
    return res.redirect(`/dashboard/${customerId}`);
  }
  
  // Display login form
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>התחברות למערכת | ${customer.eventName}</title>
      <link rel="stylesheet" href="/css/dashboard.css">
      <style>
        body {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background-color: #f5f5f5;
          font-family: Arial, sans-serif;
        }
        
        .login-container {
          width: 100%;
          max-width: 400px;
          padding: 2rem;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          text-align: right;
        }
        
        h1 {
          margin-top: 0;
          color: #333;
          text-align: center;
        }
        
        .form-group {
          margin-bottom: 1rem;
        }
        
        label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: bold;
        }
        
        input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        button {
          display: block;
          width: 100%;
          padding: 0.75rem;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
        }
        
        button:hover {
          background-color: #45a049;
        }
        
        .error-message {
          color: #f44336;
          margin-top: 1rem;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h1>לוח בקרה לאירוע</h1>
        <h2 style="text-align: center;">${customer.eventName}</h2>
        
        <form id="login-form">
          <div class="form-group">
            <label for="password">סיסמת כניסה</label>
            <input type="password" id="password" name="password" placeholder="הזן את הסיסמה שקיבלת" required>
          </div>
          <button type="submit">כניסה</button>
          <p class="error-message" id="error-message" style="display: none;"></p>
        </form>
      </div>
      
      <script>
        document.getElementById('login-form').addEventListener('submit', function(e) {
          e.preventDefault();
          
          const password = document.getElementById('password').value;
          
          fetch('/api/dashboard/${customerId}/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              window.location.href = '/dashboard/${customerId}';
            } else {
              const errorMessage = document.getElementById('error-message');
              errorMessage.textContent = data.error || 'סיסמה שגויה';
              errorMessage.style.display = 'block';
            }
          })
          .catch(error => {
            console.error('Login error:', error);
            const errorMessage = document.getElementById('error-message');
            errorMessage.textContent = 'אירעה שגיאה. אנא נסה שנית';
            errorMessage.style.display = 'block';
          });
        });
      </script>
    </body>
    </html>
  `);
});

// Customer-specific dashboard authentication API
router.post('/api/dashboard/:customerId/login', (req, res) => {
  const customerId = req.params.customerId;
  const { password } = req.body;
  
  // Check if customer exists
  const customer = getCustomerById(customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }
  
  // Simple password validation (for now using a fixed password)
  const DASHBOARD_PASSWORD = '1234'; // Should be per-customer in production
  
  if (password !== DASHBOARD_PASSWORD) {
    console.log(`[${getIsraelTimestamp()}] Failed login attempt for customer: ${customerId}`);
    return res.status(401).json({ success: false, error: 'סיסמה שגויה' });
  }
  
  // Set cookie with token
  const cookieName = `dashboard_token_${customerId}`;
  res.cookie(cookieName, password, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  });
  
  console.log(`[${getIsraelTimestamp()}] Successful login for customer: ${customerId}`);
  res.json({ success: true });
});

// Main customer dashboard
router.get('/dashboard/:customerId', customerDashboardAuth, (req, res) => {
  // Customer info is already available via req.customer
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// API to get customer event details
router.get('/api/dashboard/:customerId/event-details', customerDashboardAuth, async (req, res) => {
  try {
    // Get customer from middleware
    const customer = req.customer;
    
    // Create a sheets manager for this customer
    const appScriptManager = createAppScriptManager(customer.id);
    if (!appScriptManager) {
      return res.status(500).json({ 
        success: false, 
        error: 'Unable to access Google Sheets API for this customer' 
      });
    }
    
    // Get event details from Google Sheets
    const eventDetails = await appScriptManager.getEventDetails();
    
    // Override with our local data if available
    const details = {
      ...eventDetails,
      date: customer.eventDate, // Use our stored date
      name: customer.eventName, // Use our stored event name
      customer: customer.name // Add customer name
    };
    
    res.json({ success: true, details });
  } catch (error) {
    console.error(`[${getIsraelTimestamp()}] Error fetching event details:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to get guest list for a specific customer
router.get('/api/dashboard/:customerId/guests', customerDashboardAuth, async (req, res) => {
  try {
    // Get customer from middleware
    const customer = req.customer;
    
    // Create a sheets manager for this customer
    const appScriptManager = createAppScriptManager(customer.id);
    if (!appScriptManager) {
      return res.status(500).json({ 
        success: false, 
        error: 'Unable to access Google Sheets API for this customer' 
      });
    }
    
    // Get guests from Google Sheets
    const guestsList = await appScriptManager.getGuests();
    
    // Normalize property names for compatibility
    const formattedGuests = guestsList.map(guest => {
      return {
        // Original properties
        ...guest,
        // Add uppercase properties for dashboard compatibility
        Name: guest.name || '',
        Phone: guest.phone || '',
        Email: guest.email || '',
        Status: guest.status || 'Pending',
        GuestCount: guest.count || '0',
        Notes: guest.notes || '',
        LastContacted: guest.lastContacted || '',
      };
    });
    
    console.log(`[${getIsraelTimestamp()}] Sending ${formattedGuests.length} guests to dashboard for customer: ${customer.id}`);
    res.json({ success: true, guests: formattedGuests });
  } catch (error) {
    console.error(`[${getIsraelTimestamp()}] Error fetching guests:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Logout from customer dashboard
router.get('/dashboard/:customerId/logout', (req, res) => {
  const customerId = req.params.customerId;
  const cookieName = `dashboard_token_${customerId}`;
  
  res.clearCookie(cookieName);
  res.redirect(`/dashboard/${customerId}/login`);
});

// API endpoint to send message from customer dashboard
router.post('/api/dashboard/:customerId/send-message', customerDashboardAuth, express.json(), async (req, res) => {
  try {
    const { phone, message } = req.body;
    const customer = req.customer;
    
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Missing phone or message' });
    }
    
    // Normalize phone number - ensure it has country code
    let normalizedPhone = phone.trim();
    if (!normalizedPhone.startsWith('+')) {
      // Add Israel country code if not present
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+972' + normalizedPhone.substring(1);
      } else {
        normalizedPhone = '+972' + normalizedPhone;
      }
    }
    
    // Get access to the global WhatsApp connection from index.js
    // This assumes the WhatsApp client is exported or made available somehow
    const conn = global.conn || req.app.get('whatsappClient');
    
    if (conn) {
      // Send the message using WhatsApp client
      await conn.sendMessage(normalizedPhone + '@s.whatsapp.net', { 
        text: message 
      });
      
      console.log(`[${new Date().toISOString()}] Customer ${customer.id}: Message sent to ${normalizedPhone}`);
      res.json({ success: true, message: 'Message sent successfully' });
    } else {
      console.error(`[${new Date().toISOString()}] Customer ${customer.id}: WhatsApp client not connected`);
      res.status(500).json({ success: false, error: 'WhatsApp client not connected' });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending message:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
