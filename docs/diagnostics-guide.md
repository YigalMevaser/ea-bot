# WhatsApp RSVP Bot Diagnostic Tools

This document explains the diagnostic features available in the WhatsApp RSVP Bot to help troubleshoot issues related to data persistence and customer display.

## Common Issues Addressed

1. **Customers not showing in admin dashboard** - When customers are added but don't appear in the admin dashboard
2. **Data persistence issues** - When data seems to disappear after restart or between sessions
3. **Permission problems** - When the bot has difficulty accessing or modifying data files
4. **JSON file corruption** - When data files become corrupted or invalid

## Diagnostic Tools Available

### 1. WhatsApp `!diagnose` Command

The `!diagnose` command provides comprehensive system health information directly through WhatsApp.

**Usage:**
1. Send `!diagnose` from an admin WhatsApp number to the bot
2. The bot will analyze:
   - File system status
   - Data directory permissions
   - Customer data validity
   - Credential file validity
   - Write access to data directory
   - Active customers count

**Automatic Fixes:**
The command will automatically attempt to fix:
- Data directory permissions
- Customers.json file permissions
- Credentials.json file permissions

### 2. `fix-data-directory.sh` Script

This script helps server administrators diagnose and fix data directory issues from the command line.

**Usage:**
```bash
./fix-data-directory.sh
```

**Features:**
- Creates missing directories and files
- Sets proper permissions (0777 for directories, 0666 for files)
- Validates JSON files and creates backups if corrupted
- Provides detailed analysis of customer and credential data
- Works without affecting the running application

### 3. Enhanced Error Logging

We've improved error logging throughout the application to provide more context when issues occur:
- More detailed error messages in log files
- File permission information
- JSON parsing validation
- Customer data loading status

## Prevention

To prevent data issues in the future:

1. **Always check permissions** after upgrading or restarting
2. **Regularly back up** the `/data` directory
3. **Validate container volumes** are correctly mounted if using Docker
4. **Use the `!diagnose` command** periodically to verify system health

## Contact Support

If you continue to experience issues after using these diagnostic tools, please contact the bot developer with:
1. The full diagnostic report from `!diagnose`
2. Recent log files from the `/logs` directory
3. Steps to reproduce the issue
