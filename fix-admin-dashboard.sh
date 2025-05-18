#!/bin/bash
# Script to fix the admin dashboard HTML file

echo "Fixing Admin Dashboard issues..."

# Backup the original file
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
BACKUP_PATH="/Users/yigalm/MyProjects/github/ea-bot/public/admin-dashboard.bak.${TIMESTAMP}.html"
ORIGINAL_PATH="/Users/yigalm/MyProjects/github/ea-bot/public/admin-dashboard.html"
FIXED_PATH="/Users/yigalm/MyProjects/github/ea-bot/public/admin-dashboard-fixed.html"

# Check if fixed file exists
if [ ! -f "$FIXED_PATH" ]; then
  echo "ERROR: Fixed admin dashboard file not found at $FIXED_PATH"
  exit 1
fi

# Create backup
echo "Creating backup of original admin-dashboard.html at $BACKUP_PATH"
cp "$ORIGINAL_PATH" "$BACKUP_PATH"

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to create backup"
  exit 1
fi

# Replace with fixed version
echo "Replacing admin-dashboard.html with fixed version"
cp "$FIXED_PATH" "$ORIGINAL_PATH"

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to replace admin dashboard"
  exit 1
fi

echo "✅ Admin dashboard fixed successfully!"
echo "Original backup saved at: $BACKUP_PATH"
echo "You should now restart the application to apply the changes"
