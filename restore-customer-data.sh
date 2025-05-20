#!/bin/bash
# restore-customer-data.sh - Script to restore customer data from fixed-customers.json

echo "Restoring customer data from fixed-customers.json..."

DATA_DIR="/app/persistent/data"
FIXED_FILE="$DATA_DIR/fixed-customers.json"
CUSTOMERS_FILE="$DATA_DIR/customers.json"

# Check if fixed-customers.json exists
if [ -f "$FIXED_FILE" ]; then
  echo "Found fixed-customers.json, checking if restoration is needed..."
  
  # Check if customers.json exists and has valid content
  if [ ! -f "$CUSTOMERS_FILE" ] || [ ! -s "$CUSTOMERS_FILE" ] || [ "$(cat $CUSTOMERS_FILE)" == "[]" ] || [ "$(cat $CUSTOMERS_FILE)" == "{}" ]; then
    echo "Customers file is missing or empty, restoring from fixed data..."
    cp "$FIXED_FILE" "$CUSTOMERS_FILE"
    chmod 666 "$CUSTOMERS_FILE"
    echo "✅ Customers data restored successfully!"
  else
    echo "Existing customers.json found and appears valid, skipping restoration"
  fi
else
  echo "⚠️ Warning: fixed-customers.json not found at $FIXED_FILE"
  
  # Create an empty customers.json if it doesn't exist
  if [ ! -f "$CUSTOMERS_FILE" ]; then
    echo "[] > $CUSTOMERS_FILE"
    chmod 666 "$CUSTOMERS_FILE"
    echo "Created empty customers.json file"
  fi
fi

# Verify the customers.json file
echo "Verifying customers.json file..."
if [ -f "$CUSTOMERS_FILE" ]; then
  FILE_SIZE=$(stat -c%s "$CUSTOMERS_FILE" 2>/dev/null || stat -f%z "$CUSTOMERS_FILE")
  echo "Customers file size: $FILE_SIZE bytes"
  
  # Print the first 100 characters for debugging
  PREVIEW=$(head -c 100 "$CUSTOMERS_FILE")
  echo "File preview: $PREVIEW..."
else
  echo "⚠️ Warning: customers.json still missing after restoration attempt"
fi
