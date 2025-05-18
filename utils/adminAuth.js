/**
 * Admin Authentication Module
 * This handles authentication for the super admin of the multi-tenant system
 */

import crypto from 'crypto';
import { getIsraelTimestamp } from './timeUtils.js';

// Store admin token in memory
let adminTokens = {};

// Default admin credentials (should be moved to .env)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 
                           crypto.createHash('sha256').update('admin1234').digest('hex');

/**
 * Generate a secure random token
 * @returns {string} Random token
 * @private
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a password with sha256
 * @param {string} password - Password to hash
 * @returns {string} Hashed password
 * @private
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Authenticate admin user
 * @param {string} username - Admin username
 * @param {string} password - Admin password
 * @returns {Object} Authentication result with token if successful
 */
export function authenticateAdmin(username, password) {
  const timestamp = getIsraelTimestamp();
  
  if (username !== ADMIN_USERNAME) {
    console.log(`[${timestamp}] Failed admin login attempt: Invalid username '${username}'`);
    return { success: false, error: 'Invalid credentials' };
  }
  
  const hashedPassword = hashPassword(password);
  if (hashedPassword !== ADMIN_PASSWORD_HASH) {
    console.log(`[${timestamp}] Failed admin login attempt: Invalid password for '${username}'`);
    return { success: false, error: 'Invalid credentials' };
  }
  
  // Generate session token
  const token = generateToken();
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  
  adminTokens[token] = {
    username,
    expiresAt
  };
  
  console.log(`[${timestamp}] Admin login successful: '${username}'`);
  return {
    success: true,
    token,
    expiresAt
  };
}

/**
 * Validate an admin token
 * @param {string} token - Admin session token
 * @returns {boolean} Whether the token is valid
 */
export function validateAdminToken(token) {
  // Clean up expired tokens periodically
  cleanupExpiredTokens();
  
  if (!adminTokens[token]) {
    return false;
  }
  
  // Check if token is expired
  if (adminTokens[token].expiresAt < Date.now()) {
    delete adminTokens[token];
    return false;
  }
  
  return true;
}

/**
 * Logout admin by invalidating token
 * @param {string} token - Admin session token
 * @returns {boolean} Success status
 */
export function logoutAdmin(token) {
  if (adminTokens[token]) {
    delete adminTokens[token];
    return true;
  }
  return false;
}

/**
 * Remove all expired tokens
 * @private
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  
  Object.keys(adminTokens).forEach(token => {
    if (adminTokens[token].expiresAt < now) {
      delete adminTokens[token];
    }
  });
}

/**
 * Express middleware to check admin authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function adminAuthMiddleware(req, res, next) {
  // Check for admin token in cookies
  const token = req.cookies?.admin_token;
  
  if (!token || !validateAdminToken(token)) {
    return res.redirect('/admin/login');
  }
  
  next();
}
