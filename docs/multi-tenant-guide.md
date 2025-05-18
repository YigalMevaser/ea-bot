# Multi-Tenant WhatsApp RSVP Bot Setup Guide

This guide explains how to convert your WhatsApp RSVP Bot to support multiple customers and events in a single instance, which helps reduce hosting costs.

## Overview

The multi-tenant version allows you to:

1. Serve multiple customers with different events from a single deployment
2. Maintain separate dashboards for each customer
3. Use separate Google Sheets for each event
4. Track all customers from a central admin dashboard
5. Minimize Railway.com resource usage

## Steps to Implement

### 1. Install New Modules

```bash
cd /Users/yigalm/MyProjects/github/ea-bot
mkdir -p data
npm install --save express-fileupload jsonwebtoken
```

### 2. Update Your .env File

Add the following lines to your .env file:

```
# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4

# Multi-tenant configuration
MAX_ACTIVE_CUSTOMERS=5
# ENCRYPTION_KEY must be exactly 32 characters for AES-256 encryption
ENCRYPTION_KEY=32CharacterSecureEncryptionKey123
```

Note: The default password hash is for "1234". You should change this in production.

### 3. Integrate New Routes

Edit your `index.js` file to add the new admin and customer dashboard routes.

Add these imports at the top:

```javascript
import adminRoutes from './routes/adminRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
```

Then add the route registrations:

```javascript
// Add multi-tenant routes
app.use(adminRoutes);
app.use(dashboardRoutes);
```

### 4. Update the Dockerfile

Your .dockerignore file should be updated to keep the customer data secure:

```
node_modules
npm-debug.log
whatsapp-qr.png
.env
local_session
session
logs
.git
.gitignore
# Keep data directory for customer information
```

### 5. Testing the Multi-Tenant Setup

1. Start your service
2. Visit `/admin/login` and login with username `admin` and password `1234`
3. Add your first customer with all event details
4. Test the dashboard at `/dashboard/[customer-id]`

## Migrating Your Existing Event

To migrate your current event as the first customer:

1. Log in to the admin dashboard
2. Click "Add New Customer" and enter your current event details:
   - Customer Name: Yasmin and Netanel
   - Phone Number: +972526901876
   - Event Name: Yasmin and Netanel Wedding
   - Event Date: 2025-06-01
   - Google Sheets URL: (your spreadsheet URL)
   - Apps Script URL: https://script.google.com/macros/s/AKfycbxb9mGb5WsKt-h_3JcPJDC9Oz7m_Ec3_FXF-P622i6Gh4Py6b9U_7KJ83nX7auW9Hx2-w/exec
   - Secret Key: yourActualSecretKeyHere123
3. After saving, you can access that event's dashboard at the provided URL

## Cost Optimization

With this setup on Railway.com:

1. A single instance can handle multiple customers
2. Memory usage is minimized by sharing core components
3. The $5 monthly credit should support up to 5 concurrent customers
4. Inactive customers can be disabled to save resources

## Admin Commands

You can run these commands in WhatsApp as an admin:

- `!listcustomers` - Show all active customers
- `!addcustomer [name] [phone] [event-name] [yyyy-mm-dd]` - Quick add customer
- `!deactivate [customer-id]` - Disable a customer

These commands help you manage customers directly from WhatsApp.

## Security Considerations

1. Each customer has their own authentication and can only see their own data
2. API keys are stored encrypted in the data directory 
3. Admin access is protected with a password
4. All authentication attempts are logged

## Backup Recommendations

Regularly backup your `data` directory as it contains all customer information:

```bash
# On your server
mkdir -p /backup
cp -r /app/data/ /backup/data-$(date +"%Y-%m-%d")/
```

This ensures you don't lose customer data even if the container is restarted.

## Conclusion

This multi-tenant approach allows you to maximize your Railway.com credits while serving multiple customers. By running a single instance instead of one per customer, you significantly reduce resource consumption.

For questions or support, please reach out to the bot developer.
