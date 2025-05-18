#!/bin/bash
# fix-data-directory.sh
# Script to diagnose and fix data directory issues in the WhatsApp RSVP Bot

echo "WhatsApp RSVP Bot - Data Directory Fix Utility"
echo "=============================================="

# Determine the bot's root directory
BOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${BOT_DIR}/data"
CUSTOMERS_FILE="${DATA_DIR}/customers.json"
CREDENTIALS_FILE="${DATA_DIR}/credentials.json"

echo "Bot directory: ${BOT_DIR}"
echo "Data directory: ${DATA_DIR}"

# Check if data directory exists
if [ ! -d "${DATA_DIR}" ]; then
    echo "❌ Data directory does not exist. Creating it now..."
    mkdir -p "${DATA_DIR}"
    if [ $? -eq 0 ]; then
        echo "✅ Data directory created successfully."
    else
        echo "❌ Failed to create data directory. Check permissions."
        exit 1
    fi
else
    echo "✅ Data directory exists."
fi

# Fix data directory permissions
echo "Setting data directory permissions to 0777..."
chmod -R 0777 "${DATA_DIR}"
if [ $? -eq 0 ]; then
    echo "✅ Data directory permissions set."
else
    echo "❌ Failed to set data directory permissions. You may need sudo access."
    echo "Try running: sudo chmod -R 0777 ${DATA_DIR}"
fi

# Check if customers file exists
if [ ! -f "${CUSTOMERS_FILE}" ]; then
    echo "❌ Customers file does not exist. Creating empty file..."
    echo "[]" > "${CUSTOMERS_FILE}"
    if [ $? -eq 0 ]; then
        echo "✅ Customers file created."
    else
        echo "❌ Failed to create customers file."
    fi
else
    echo "✅ Customers file exists."
    
    # Check if it's valid JSON
    if ! jq . "${CUSTOMERS_FILE}" >/dev/null 2>&1; then
        echo "❌ Customers file is not valid JSON. Creating backup and fixing..."
        cp "${CUSTOMERS_FILE}" "${CUSTOMERS_FILE}.bak-$(date +%s)"
        echo "[]" > "${CUSTOMERS_FILE}"
        echo "✅ Customers file reset (backup created)."
    else
        echo "✅ Customers file contains valid JSON."
    fi
    
    # Set permissions
    chmod 0666 "${CUSTOMERS_FILE}"
    echo "✅ Customers file permissions set to 0666."
fi

# Check if credentials file exists
if [ ! -f "${CREDENTIALS_FILE}" ]; then
    echo "❌ Credentials file does not exist. Creating empty file..."
    echo "{}" > "${CREDENTIALS_FILE}"
    if [ $? -eq 0 ]; then
        echo "✅ Credentials file created."
    else
        echo "❌ Failed to create credentials file."
    fi
else
    echo "✅ Credentials file exists."
    
    # Check if it's valid JSON
    if ! jq . "${CREDENTIALS_FILE}" >/dev/null 2>&1; then
        echo "❌ Credentials file is not valid JSON. Creating backup and fixing..."
        cp "${CREDENTIALS_FILE}" "${CREDENTIALS_FILE}.bak-$(date +%s)"
        echo "{}" > "${CREDENTIALS_FILE}"
        echo "✅ Credentials file reset (backup created)."
    else
        echo "✅ Credentials file contains valid JSON."
    fi
    
    # Set permissions
    chmod 0666 "${CREDENTIALS_FILE}"
    echo "✅ Credentials file permissions set to 0666."
fi

# Check if jq is available for more detailed JSON analysis
if command -v jq >/dev/null 2>&1; then
    echo -e "\nAnalyzing customer data:"
    CUSTOMER_COUNT=$(jq '. | length' "${CUSTOMERS_FILE}")
    echo "Total customers in file: ${CUSTOMER_COUNT}"
    
    if [ "${CUSTOMER_COUNT}" -gt 0 ]; then
        echo -e "\nFirst customer details:"
        jq '.[0]' "${CUSTOMERS_FILE}"
        
        echo -e "\nActive customers:"
        jq '[.[] | select(.active == true)] | length' "${CUSTOMERS_FILE}"
    fi
    
    echo -e "\nAnalyzing credentials data:"
    CRED_COUNT=$(jq 'keys | length' "${CREDENTIALS_FILE}")
    echo "Total credential entries: ${CRED_COUNT}"
    
    if [ "${CRED_COUNT}" -gt 0 ]; then
        echo "Credential customer IDs:"
        jq 'keys' "${CREDENTIALS_FILE}"
    fi
else
    echo -e "\nInstall 'jq' for more detailed JSON analysis:"
    echo "  - Ubuntu/Debian: sudo apt-get install jq"
    echo "  - CentOS/RHEL: sudo yum install jq"
    echo "  - macOS: brew install jq"
fi

echo -e "\n✅ Diagnosis and repair complete."
echo "If you're still experiencing issues, check the application logs or run !diagnose from WhatsApp."
