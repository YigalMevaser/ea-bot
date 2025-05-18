/**
 * API routes for multi-tenant admin functionality
 * This module adds routes for customer management and admin authentication
 */

import express from 'express';
import { 
  addCustomer, 
  getCustomerById, 
  getActiveCustomers,
  getCustomersWithUpcomingEvents,
  updateCustomer, 
  deactivateCustomer 
} from '../utils/customerManager.js';
import { storeCredentials, hasCredentials } from '../utils/credentialsManager.js';
import { 
  authenticateAdmin, 
  validateAdminToken,
  logoutAdmin,
  adminAuthMiddleware 
} from '../utils/adminAuth.js';
import { getIsraelTimestamp } from '../utils/timeUtils.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Admin login page
router.get('/admin/login', (req, res) => {
  // Check if already authenticated
  if (req.cookies?.admin_token && validateAdminToken(req.cookies.admin_token)) {
    return res.redirect('/admin');
  }
  
  // Render login page
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Login | WhatsApp RSVP Bot</title>
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
        <h1>Admin Login</h1>
        <form id="login-form">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" required>
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required>
          </div>
          <button type="submit">Login</button>
          <p class="error-message" id="error-message" style="display: none;"></p>
        </form>
      </div>
      
      <script>
        document.getElementById('login-form').addEventListener('submit', function(e) {
          e.preventDefault();
          
          const username = document.getElementById('username').value;
          const password = document.getElementById('password').value;
          
          fetch('/api/admin/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              window.location.href = '/admin';
            } else {
              const errorMessage = document.getElementById('error-message');
              errorMessage.textContent = data.error || 'Login failed';
              errorMessage.style.display = 'block';
            }
          })
          .catch(error => {
            console.error('Login error:', error);
            const errorMessage = document.getElementById('error-message');
            errorMessage.textContent = 'An error occurred. Please try again.';
            errorMessage.style.display = 'block';
          });
        });
      </script>
    </body>
    </html>
  `);
});

// Admin dashboard page
router.get('/admin', adminAuthMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-dashboard.html'));
});

// Admin API endpoints
router.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Missing username or password' });
  }
  
  const result = authenticateAdmin(username, password);
  
  if (result.success) {
    // Set cookie with token
    res.cookie('admin_token', result.token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    });
    
    return res.json({ success: true });
  } else {
    return res.status(401).json({ success: false, error: result.error });
  }
});

router.post('/admin/logout', (req, res) => {
  const token = req.cookies?.admin_token;
  
  if (token) {
    logoutAdmin(token);
    res.clearCookie('admin_token');
  }
  
  res.redirect('/admin/login');
});

// Customer management APIs
router.get('/api/admin/customers', adminAuthMiddleware, (req, res) => {
  try {
    const timestamp = getIsraelTimestamp();
    console.log(`[${timestamp}] GET /api/admin/customers: Request received with filter=${req.query.filter}`);
    
    const filter = req.query.filter || 'all';
    let customers = [];
    
    // Check if customers.json has data
    try {
      // Check for Railway single volume configuration
      const persistentBase = '/app/persistent';
      const isRailwaySingleVolume = fs.existsSync(persistentBase);
      
      // Define the path based on the volume configuration
      const dataDir = isRailwaySingleVolume ? path.join(persistentBase, 'data') : path.join(__dirname, '..', 'data');
      const customersFile = path.join(dataDir, 'customers.json');
      
      console.log(`[${timestamp}] Customers file path: ${customersFile} (${isRailwaySingleVolume ? 'single volume' : 'standard'} configuration)`);
      
      if (fs.existsSync(customersFile)) {
        const fileContents = fs.readFileSync(customersFile, 'utf8');
        console.log(`[${timestamp}] customers.json contents: ${fileContents}`);
      } else {
        console.log(`[${timestamp}] customers.json file does not exist`);
      }
    } catch (fsError) {
      console.error(`[${timestamp}] Error reading customers file:`, fsError);
    }
    
    switch (filter) {
      case 'active':
        console.log(`[${timestamp}] Fetching active customers`);
        customers = getActiveCustomers();
        break;
      case 'upcoming':
        console.log(`[${timestamp}] Fetching upcoming customers`);
        customers = getCustomersWithUpcomingEvents(30); // Next 30 days
        break;
      case 'past':
        console.log(`[${timestamp}] Fetching past event customers`);
        const allActive = getActiveCustomers();
        const upcoming = getCustomersWithUpcomingEvents(30);
        // Filter to get only past events
        customers = allActive.filter(customer => {
          return !upcoming.some(upcomingCust => upcomingCust.id === customer.id);
        });
        break;
      case 'all':
      default:
        console.log(`[${timestamp}] Fetching all customers`);
        customers = getActiveCustomers();
    }
    
    // Add more debugging before sending the response
    console.log(`[${timestamp}] Found ${customers.length} customers`);
    if (customers.length > 0) {
      console.log(`[${timestamp}] First customer: ${JSON.stringify(customers[0])}`);
    } else {
      console.log(`[${timestamp}] No customers found to return`);
      // Double check if we can load customers directly from file as a fallback
      try {
        // Check for Railway single volume configuration
        const persistentBase = '/app/persistent';
        const isRailwaySingleVolume = fs.existsSync(persistentBase);
        
        // Define the path based on the volume configuration
        const dataDir = isRailwaySingleVolume ? path.join(persistentBase, 'data') : path.join(__dirname, '..', 'data');
        const customersFile = path.join(dataDir, 'customers.json');
        
        if (fs.existsSync(customersFile)) {
          const fileData = JSON.parse(fs.readFileSync(customersFile, 'utf8'));
          if (Array.isArray(fileData) && fileData.length > 0) {
            console.log(`[${timestamp}] Fallback: Found ${fileData.length} customers in file`);
            customers = fileData;
          }
        }
      } catch (fallbackError) {
        console.error(`[${timestamp}] Fallback attempt failed:`, fallbackError);
      }
    }
    
    // Send the response with proper success status and customer data
    res.json({ success: true, customers });
  } catch (error) {
    console.error(`[${getIsraelTimestamp()}] Error getting customers:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/admin/customers/:id', adminAuthMiddleware, (req, res) => {
  try {
    const customer = getCustomerById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    
    res.json({ success: true, customer });
  } catch (error) {
    console.error(`[${getIsraelTimestamp()}] Error getting customer:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/admin/customers', adminAuthMiddleware, (req, res) => {
  try {
    const timestamp = getIsraelTimestamp();
    console.log(`[${timestamp}] Received request to add/update customer`);
    console.log(`[${timestamp}] Request body: ${JSON.stringify(req.body, null, 2)}`);
    
    // Clean up request body - especially URLs that might have trailing quotes or semicolons
    const body = { ...req.body };
    if (body.spreadsheetUrl) {
      body.spreadsheetUrl = body.spreadsheetUrl.toString().replace(/["';,\s]+$/, '');
    }
    if (body.appScriptUrl) {
      body.appScriptUrl = body.appScriptUrl.toString().replace(/["';,\s]+$/, '');
    }
    
    console.log(`[${timestamp}] Cleaned request body: ${JSON.stringify(body, null, 2)}`);
    
    const { 
      name, 
      phone, 
      eventName, 
      eventDate, 
      spreadsheetUrl, 
      appScriptUrl, 
      secretKey,
      customerId // For updates
    } = body;
    
    // Validate required fields
    if (!name || !phone || !eventName || !eventDate || !appScriptUrl || !secretKey) {
      console.log(`[${timestamp}] Validation failed - missing fields:`);
      console.log(`name: ${!!name}, phone: ${!!phone}, eventName: ${!!eventName}, eventDate: ${!!eventDate}`);
      console.log(`appScriptUrl: ${!!appScriptUrl}, secretKey: ${!!secretKey}`);
      
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Update existing customer if ID provided
    if (customerId) {
      console.log(`[${timestamp}] Updating existing customer: ${customerId}`);
      const updatedCustomer = updateCustomer(customerId, {
        name,
        phone,
        eventName,
        eventDate,
        spreadsheetUrl
      });
      
      if (!updatedCustomer) {
        return res.status(404).json({ 
          success: false, 
          error: 'Customer not found' 
        });
      }
      
      // Update credentials if provided
      if (appScriptUrl && secretKey) {
        console.log(`[${timestamp}] Updating credentials for customer: ${customerId}`);
        try {
          storeCredentials(customerId, { appScriptUrl, secretKey });
        } catch (credError) {
          console.error(`[${timestamp}] Failed to store credentials: ${credError.message}`);
          return res.status(500).json({ 
            success: false, 
            error: `Customer updated but credentials failed: ${credError.message}` 
          });
        }
      }
      
      return res.json({ success: true, customer: updatedCustomer });
    }
    
    // Create new customer
    console.log(`[${timestamp}] Creating new customer: ${name}`);
    const newCustomer = addCustomer({
      name,
      phone,
      eventName,
      eventDate,
      spreadsheetUrl
    });
    
    console.log(`[${timestamp}] New customer created with ID: ${newCustomer.id}`);
    
    // Store API credentials separately
    console.log(`[${timestamp}] Storing credentials for new customer: ${newCustomer.id}`);
    const credentialsStored = storeCredentials(newCustomer.id, { appScriptUrl, secretKey });
    
    if (!credentialsStored) {
      console.error(`[${timestamp}] Failed to store credentials for customer: ${newCustomer.id}`);
      return res.json({ 
        success: true, 
        warning: "Customer created but API credentials may not be properly stored. Please check the logs.",
        customer: newCustomer
      });
    }
    
    console.log(`[${timestamp}] Customer and credentials successfully created`);
    res.json({ success: true, customer: newCustomer });
  } catch (error) {
    console.error(`[${getIsraelTimestamp()}] Error creating/updating customer:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Unknown error occurred while creating customer"
    });
  }
});

router.put('/api/admin/customers/:id/status', adminAuthMiddleware, (req, res) => {
  try {
    const { active } = req.body;
    
    if (active === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing active status' 
      });
    }
    
    const customerId = req.params.id;
    
    // If deactivating
    if (!active) {
      const success = deactivateCustomer(customerId);
      
      if (!success) {
        return res.status(404).json({ 
          success: false, 
          error: 'Customer not found' 
        });
      }
      
      return res.json({ success: true });
    }
    
    // If activating
    const updated = updateCustomer(customerId, { active: true });
    
    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        error: 'Customer not found' 
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error(`[${getIsraelTimestamp()}] Error updating customer status:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
