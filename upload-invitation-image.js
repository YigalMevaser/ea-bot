/**
 * Module for handling customer-specific invitation image uploads
 * Supports uploading, processing, and storing invitation images per customer
 */

import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { adminAuthMiddleware } from './utils/adminAuth.js';
import { getCustomerById } from './utils/customerManager.js';
import { getIsraelTimestamp } from './utils/timeUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

const router = express.Router();

/**
 * POST /api/admin/customers/:customerId/invitation-image
 * Upload and process a customer-specific invitation image
 */
router.post('/api/admin/customers/:customerId/invitation-image', 
  adminAuthMiddleware,
  upload.single('image'),
  async (req, res) => {
    try {
      const { customerId } = req.params;
      
      // Verify customer exists
      const customer = await getCustomerById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
      }

      // Ensure images directory exists
      const imagesDir = path.join(__dirname, 'data', 'images');
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      // Process and optimize the image
      const processedImage = await sharp(req.file.buffer)
        .resize(1200, 1600, { // Standard size for invitation images
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ // Convert to JPEG format
          quality: 85,
          progressive: true
        })
        .toBuffer();

      // Save the processed image
      const imagePath = path.join(imagesDir, `${customerId}.jpeg`);
      fs.writeFileSync(imagePath, processedImage);

      res.json({
        message: 'Invitation image uploaded successfully',
        timestamp: getIsraelTimestamp()
      });

    } catch (error) {
      console.error('Error uploading invitation image:', error);
      res.status(500).json({ 
        error: 'Failed to upload invitation image',
        details: error.message 
      });
    }
  }
);

// GET endpoint to serve invitation images
router.get('/api/admin/customers/:customerId/invitation-image', 
  adminAuthMiddleware,
  async (req, res) => {
    try {
      const { customerId } = req.params;
      
      // Verify customer exists
      const customer = await getCustomerById(customerId);
      if (!customer) {
        return res.status(404).send('Customer not found');
      }

      // Try to load customer-specific image
      const imagesDir = path.join(__dirname, 'data', 'images');
      const imagePath = path.join(imagesDir, `${customerId}.jpeg`);
      
      if (fs.existsSync(imagePath)) {
        // Set proper content type
        res.setHeader('Content-Type', 'image/jpeg');
        // Set cache control headers
        res.setHeader('Cache-Control', 'no-cache');
        // Stream the file
        fs.createReadStream(imagePath).pipe(res);
      } else {
        res.status(404).send('Image not found');
      }
    } catch (error) {
      console.error('Error serving invitation image:', error);
      res.status(500).send('Failed to serve image');
    }
  }
);

// DELETE endpoint to remove invitation image
router.delete('/api/admin/customers/:customerId/invitation-image', 
  adminAuthMiddleware,
  async (req, res) => {
    try {
      const { customerId } = req.params;
      
      // Verify customer exists
      const customer = await getCustomerById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      const imagesDir = path.join(__dirname, 'data', 'images');
      const imagePath = path.join(imagesDir, `${customerId}.jpeg`);
      
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        res.json({ message: 'Invitation image deleted successfully' });
      } else {
        res.status(404).json({ error: 'No image found' });
      }
    } catch (error) {
      console.error('Error deleting invitation image:', error);
      res.status(500).json({ 
        error: 'Failed to delete invitation image',
        details: error.message 
      });
    }
  }
);

export default router;