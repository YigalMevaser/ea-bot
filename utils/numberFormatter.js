/**
 * Phone number formatting utilities
 */

/**
 * Format a phone number consistently
 * @param {string} phone - The phone number to format
 * @returns {string} The formatted phone number
 */
export function formatPhoneNumber(phone) {
    console.log(`[numberFormatter] Formatting phone number: ${phone}`);
    
    if (!phone) {
        console.log('[numberFormatter] Phone number is empty or null');
        return null;
    }
    
    // Remove all non-numeric characters except +
    let cleaned = String(phone).replace(/[^\d+]/g, '');
    console.log(`[numberFormatter] After removing non-numeric chars: ${cleaned}`);
    
    // Remove + if it exists, we'll add it back later
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.substring(1);
        console.log(`[numberFormatter] Removed + prefix: ${cleaned}`);
    }
    
    // Handle empty or too short numbers
    if (cleaned.length < 9) {
        console.log(`[numberFormatter] Number too short: ${cleaned}`);
        return null;
    }
    
    // For Israeli numbers:
    if (cleaned.startsWith('972')) {
        // Already has country code
        console.log(`[numberFormatter] Already has 972 prefix: ${cleaned}`);
    } else if (cleaned.startsWith('0')) {
        // Convert Israeli format (0XX-XXX-XXXX) to international
        cleaned = '972' + cleaned.substring(1);
        console.log(`[numberFormatter] Converted 0 prefix to 972: ${cleaned}`);
    } else if (cleaned.length === 9) {
        // Assuming this is an Israeli number without prefix
        cleaned = '972' + cleaned;
        console.log(`[numberFormatter] Added 972 to 9-digit number: ${cleaned}`);
    } else if (cleaned.length === 10) {
        // If it starts with 05, assume it's an Israeli mobile number
        if (cleaned.startsWith('05')) {
            cleaned = '972' + cleaned.substring(1);
            console.log(`[numberFormatter] Converted Israeli mobile number: ${cleaned}`);
        } else {
            // Non-Israeli 10-digit number, preserve as is but add 972
            cleaned = '972' + cleaned;
            console.log(`[numberFormatter] Added 972 to 10-digit number: ${cleaned}`);
        }
    }
    
    // Add the + prefix
    cleaned = '+' + cleaned;
    console.log(`[numberFormatter] Added + prefix: ${cleaned}`);
    
    // Allow both 9 and 10 digit numbers after the +972 prefix
    if (!/^\+972\d{8,9}$/.test(cleaned)) {
        console.warn(`[numberFormatter] Invalid phone number format after cleaning: ${cleaned}`);
        return null;
    }
    
    console.log(`[numberFormatter] Final formatted number: ${cleaned}`);
    return cleaned;
}
