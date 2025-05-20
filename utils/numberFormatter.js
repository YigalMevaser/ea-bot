/**
 * Phone number formatting utilities
 */

/**
 * Format a phone number consistently
 * @param {string} phone - The phone number to format
 * @returns {string} The formatted phone number
 */
export function formatPhoneNumber(phone) {
  // Remove any non-numeric characters
  let cleaned = String(phone).replace(/\D/g, '');
  
  // For Israeli numbers
  if (cleaned.startsWith('972')) {
    // Already has country code
    cleaned = cleaned;
  } else if (cleaned.startsWith('0')) {
    // Convert Israeli format (0XX-XXX-XXXX) to international
    cleaned = '972' + cleaned.substring(1);
  } 
  
  // Add the + if missing
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
}
