# EA-Bot Deployment Guide (No Encryption)

This guide will help you deploy the correct Apps Script code to both Google Sheets and set up the environment variables in Railway.

## Step 1: Deploy the Google Apps Scripts

### For Yigal & Shiran's Sheet

1. Open the Google Sheet at [https://docs.google.com/spreadsheets/d/1BKG19i5pkbAN9wgbOkrDbiXUO0t_dTXl4yLhvbUpe1o](https://docs.google.com/spreadsheets/d/1BKG19i5pkbAN9wgbOkrDbiXUO0t_dTXl4yLhvbUpe1o)

2. Go to Extensions → Apps Script

3. Replace all existing code with the content from `yigal-shiran-direct.js` or `yigal-shiran-auto-detect.js`

4. Make sure the script contains this exact line:
   ```javascript
   const expectedKey = "secretkey_cust_1747609067224_3033";
   ```

5. Click on Deploy → New deployment

6. Select "Web app" as the deployment type

7. Set:
   - Execute as: "Me"
   - Who has access: "Anyone"

8. Click Deploy and authorize the script

9. Copy the Web App URL shown after deployment - it should look like:
   ```
   https://script.google.com/macros/s/AKfycbztiVEgxprthHFE9tI4VVbXSRJWekTKhtl90m83WQEWMoNd-eED9thWX-oB6eKFMhAN/exec
   ```

### For Yasmin & Netanel's Sheet

1. Open the Google Sheet at [https://docs.google.com/spreadsheets/d/18oMHIR4y3IuSTQdoOBrpfScfqY28cgznpWRBBDi8HFw](https://docs.google.com/spreadsheets/d/18oMHIR4y3IuSTQdoOBrpfScfqY28cgznpWRBBDi8HFw)

2. Go to Extensions → Apps Script

3. Replace all existing code with the content from `clean-yasmin-script.js`

4. Make sure the script contains this exact line:
   ```javascript
   const expectedKey = "secretkey_cust_1747636321249_8261";
   ```

5. Click on Deploy → New deployment

6. Select "Web app" as the deployment type

7. Set:
   - Execute as: "Me"
   - Who has access: "Anyone"

8. Click Deploy and authorize the script

9. Copy the Web App URL shown after deployment

## Step 2: Update Your Credentials

1. Run the provided script to update credentials with raw values:
   ```bash
   node simple-creds-update.js
   ```

2. If the Web App URLs from your deployments are different from those in your credentials.json file, update them by editing the script or running:
   ```bash
   node update-credentials.js
   ```

## Step 3: Test the API Connections

Run the test script to verify connectivity:
```bash
node super-simple-test.js
```

Both APIs should return SUCCESS responses.

## Step 4: Set up Railway Environment Variables

Add these environment variables to your Railway project:

```
CUSTOMER_SECRET_cust_1747609067224=secretkey_cust_1747609067224_3033
CUSTOMER_URL_cust_1747609067224=https://script.google.com/macros/s/AKfycbztiVEgxprthHFE9tI4VVbXSRJWekTKhtl90m83WQEWMoNd-eED9thWX-oB6eKFMhAN/exec
CUSTOMER_SECRET_cust_1747636321249=secretkey_cust_1747636321249_8261
CUSTOMER_URL_cust_1747636321249=https://script.google.com/macros/s/AKfycbwzUXDhzvz9NDt_7M0qDm64Lutcd7ATH879LoALBEc__e6hUtkLa_BfJZcCp3DHd0nfbg/exec
```

Replace the URLs with the actual URLs from your deployments if they're different.

## Step 5: Deploy to Railway

After setting up the environment variables, deploy your application to Railway.
