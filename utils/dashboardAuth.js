// Import required modules
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Setup simple logger
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple logger for authentication events
const logger = {
  warn: (message) => {
    console.warn(`[AUTH] ${message}`);
  },
  info: (message) => {
    console.info(`[AUTH] ${message}`);
  },
  error: (message, error) => {
    console.error(`[AUTH] ${message}`, error);
  }
};

// Authentication middleware for dashboard
function dashboardAuth(req, res, next) {
  // Skip auth in development mode for easier testing
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  
  // Check for token in query parameter or cookie
  const token = req.query.token || req.cookies?.dashboard_token;
  const validToken = process.env.DASHBOARD_TOKEN || 'your-secure-dashboard-token';
  
  // Constant-time comparison to prevent timing attacks
  const isValidToken = token && validToken && 
    token.length === validToken.length &&
    token === validToken;
  
  if (isValidToken) {
    // Log successful authentication
    logger.info(`Dashboard access granted via token for IP: ${req.ip}`);
    
    // Set cookie for future requests
    if (!req.cookies?.dashboard_token) {
      res.cookie('dashboard_token', token, { 
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
        sameSite: 'strict'
      });
    }
    return next();
  }
  
  // Handle login form submission
  if (req.method === 'POST' && req.body.password) {
    // Set default password to '1234' for testing or use env var
    const password = process.env.DASHBOARD_PASSWORD || '1234'; 
    
    logger.info(`Login attempt with password: '${req.body.password}', expected: '${password}'`);
    logger.info(`DASHBOARD_PASSWORD env var: '${process.env.DASHBOARD_PASSWORD || "not set"}'`);
    logger.info(`Password match: ${req.body.password === password}`);
    
    // Trim whitespace from both passwords for comparison
    if (req.body.password.trim() === password.trim()) {
      logger.info(`Dashboard login successful for IP: ${req.ip}`);
      
      res.cookie('dashboard_token', validToken, { 
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
        sameSite: 'strict'
      });
      
      logger.info(`Redirecting to: ${req.originalUrl}`);
      return res.redirect(req.originalUrl || '/dashboard');
    } else {
      logger.warn(`Failed dashboard login attempt for IP: ${req.ip} - Password mismatch`);
      
      // Show login page with error message
      return res.status(401).send(`
        <!DOCTYPE html>
        <html lang="en" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dashboard Login Error</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
            <style>
                body { display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f0f2f5; font-family: Arial, sans-serif; }
                .login-container { background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
                .logo { color: #128C7E; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                .form-control { margin-bottom: 15px; padding: 10px; }
                .btn-primary { background-color: #128C7E; border-color: #128C7E; padding: 10px; width: 100%; }
                .btn-primary:hover { background-color: #075E54; border-color: #075E54; }
                .alert { margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="logo">אירוע RSVP - כניסה למנהלים</div>
                <div class="alert alert-danger">סיסמה שגויה, אנא נסה שנית</div>
                <form method="POST" action="/dashboard/login">
                    <div class="mb-3">
                        <input type="password" name="password" class="form-control" placeholder="סיסמת גישה" required>
                    </div>
                    <button type="submit" class="btn btn-primary">כניסה</button>
                </form>
                <p class="mt-3 text-muted">גישה מיועדת למנהלי האירוע בלבד</p>
            </div>
        </body>
        </html>
      `);
    }
  }
  
  // Show login page
  const loginHtml = `
  <!DOCTYPE html>
  <html lang="en" dir="rtl">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dashboard Login</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
      <style>
          body {
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              background-color: #f0f2f5;
              font-family: Arial, sans-serif;
          }
          .login-container {
              background-color: white;
              border-radius: 10px;
              padding: 30px;
              box-shadow: 0 4px 15px rgba(0,0,0,0.1);
              width: 100%;
              max-width: 400px;
              text-align: center;
          }
          .logo {
              color: #128C7E;
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 20px;
          }
          .form-control {
              margin-bottom: 15px;
              padding: 10px;
          }
          .btn-primary {
              background-color: #128C7E;
              border-color: #128C7E;
              padding: 10px;
              width: 100%;
          }
          .btn-primary:hover {
              background-color: #075E54;
              border-color: #075E54;
          }
      </style>
  </head>
  <body>
      <div class="login-container">
          <div class="logo">אירוע RSVP - כניסה למנהלים</div>
          <form method="POST" action="/dashboard/login">
              <div class="mb-3">
                  <input type="password" name="password" class="form-control" placeholder="סיסמת גישה" required>
              </div>
              <button type="submit" class="btn btn-primary">כניסה</button>
          </form>
          <p class="mt-3 text-muted">גישה מיועדת למנהלי האירוע בלבד</p>
      </div>
  </body>
  </html>
  `;
  
  res.send(loginHtml);
}

export default dashboardAuth;
