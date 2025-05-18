/**
 * Utility functions f// Format a date as DD.MM.YYYY (Israel format)
export function formatIsraeliDate(date) {
  // Convert string to date if needed
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  
  // Add UTC+3 hours to get Israel time
  const israelDate = new Date(dateObj.getTime() + (3 * 60 * 60 * 1000));
  
  // Format as DD.MM.YYYY
  const day = israelDate.getUTCDate().toString().padStart(2, '0');
  const month = (israelDate.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = israelDate.getUTCFullYear();
  
  return `${day}.${month}.${year}`;
}

/**
 * Calculate days remaining between today and a target date
 * @param {string} dateStr - Target date in DD.MM.YYYY format
 * @returns {number|string} Number of days remaining or error message
 */
export function calculateDaysRemaining(dateStr) {
  try {
    if (!dateStr) return "לא צוין";
    
    console.log("Calculating days remaining for:", dateStr);
    
    // Parse DD.MM.YYYY format (common in Israel format)
    const parts = dateStr.split('.');
    
    if (parts.length !== 3) {
      console.warn("Invalid date format, expected DD.MM.YYYY:", dateStr);
      return "לא צוין";
    }
    
    // Parse date components
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed in JS
    const year = parseInt(parts[2], 10);
    
    // Create date object for target date (without time component)
    const targetDate = new Date(year, month, day);
    console.log("Target date object:", targetDate.toString());
    
    // Validate the date is valid
    if (isNaN(targetDate.getTime())) {
      console.warn("Invalid date created from:", dateStr);
      return "לא צוין";
    }
    
    // Create today date at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log("Today (midnight):", today.toString());
    
    // Calculate difference in days
    const diffTimeMs = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTimeMs / (1000 * 60 * 60 * 24));
    
    console.log("Difference in days:", diffDays);
    return diffDays;
  } catch (error) {
    console.error("Error calculating days remaining:", error);
    return "לא צוין";
  }
}g in Israel timezone
 */

/**
 * Gets the current timestamp in Israel timezone (UTC+3)
 * @returns {string} Formatted timestamp in ISO format with UTC+3 timezone
 */
export function getIsraelTimestamp() {
  const date = new Date();
  return new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
}

/**
 * Convert any date to Israel timezone (UTC+3) timestamp
 * @param {Date} date - Date object to convert
 * @returns {string} Formatted timestamp in ISO format with UTC+3 timezone
 */
export function toIsraelTimestamp(date) {
  return new Date(date.getTime() + (3 * 60 * 60 * 1000)).toISOString().replace('Z', ' +03:00');
}

/**
 * Format a date as DD.MM.YYYY (Israel format)
 * @param {Date|string} date - Date object or date string
 * @returns {string} Date formatted as DD.MM.YYYY
 */
export function formatIsraeliDate(date) {
  // Convert string to date if needed
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  
  // Add UTC+3 hours to get Israel time
  const israelDate = new Date(dateObj.getTime() + (3 * 60 * 60 * 1000));
  
  // Format as DD.MM.YYYY
  const day = israelDate.getUTCDate().toString().padStart(2, '0');
  const month = (israelDate.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = israelDate.getUTCFullYear();
  
  return `${day}.${month}.${year}`;
}
