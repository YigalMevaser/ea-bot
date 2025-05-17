/**
 * Event-aware scheduling utilities for the RSVP bot
 * This module provides functions to send messages based on event proximity
 */

// Try to import date-fns if available, otherwise use fallback
let dateFns;
try {
  dateFns = await import('date-fns');
} catch (error) {
  console.warn('Warning: date-fns package not found, using fallback date calculations');
  dateFns = {
    // Basic fallback implementation for differenceInDays
    differenceInDays: (dateLeft, dateRight) => {
      const msPerDay = 1000 * 60 * 60 * 24;
      const utcLeft = Date.UTC(dateLeft.getFullYear(), dateLeft.getMonth(), dateLeft.getDate());
      const utcRight = Date.UTC(dateRight.getFullYear(), dateRight.getMonth(), dateRight.getDate());
      return Math.floor((utcLeft - utcRight) / msPerDay);
    },
    // Fallback for format if needed (simplified version)
    format: (date, format) => {
      return date.toISOString().split('T')[0]; // Just return YYYY-MM-DD
    }
  };
}

/**
 * Calculate days remaining until event date
 * @param {Date|string} eventDate - The event date (Date object or string in YYYY-MM-DD format)
 * @returns {number} Days remaining until event
 */
export function calculateDaysRemaining(eventDate) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    
    const eventDateObj = eventDate instanceof Date 
      ? eventDate 
      : new Date(eventDate);
    
    // Use date-fns or our fallback to calculate difference in days
    return dateFns.differenceInDays(eventDateObj, today);
  } catch (error) {
    console.error('Error calculating days remaining:', error);
    
    // Fallback implementation if something goes wrong
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const eventDateObj = eventDate instanceof Date 
        ? eventDate 
        : new Date(eventDate);
      
      // Manual calculation as last resort
      const msPerDay = 1000 * 60 * 60 * 24;
      const diff = eventDateObj.getTime() - today.getTime();
      return Math.floor(diff / msPerDay);
    } catch (fallbackError) {
      console.error('Fallback date calculation failed:', fallbackError);
      return 0; // Return 0 as a final fallback
    }
  }
}

/**
 * Determine if messages should be sent today based on event proximity
 * @param {Date|string} eventDate - The event date (Date object or string in YYYY-MM-DD format)
 * @returns {boolean} Whether messages should be sent today
 */
export function shouldSendMessagesToday(eventDate) {
  const daysRemaining = calculateDaysRemaining(eventDate);
  
  // Don't send messages if event has already occurred
  if (daysRemaining < 0) return false;
  
  // Set up the message sending schedule based on days remaining until event
  if (daysRemaining >= 28 && daysRemaining <= 30) {
    // Initial invitation (4 weeks before)
    return true;
  } else if (daysRemaining === 14) {
    // First reminder (2 weeks before)
    return true;
  } else if (daysRemaining === 7) {
    // Second reminder (1 week before)
    return true;
  } else if (daysRemaining >= 2 && daysRemaining <= 3) {
    // Final reminder (2-3 days before)
    return true;
  }
  
  return false;
}

/**
 * Filter the guest list based on event proximity
 * @param {Array} guests - Full list of guests
 * @param {Date|string} eventDate - Event date
 * @param {Set} contactedGuests - Set of guests already contacted (by phone)
 * @returns {Array} Filtered list of guests to message
 */
export function filterGuestsByEventProximity(guests, eventDate, contactedGuests) {
  const daysRemaining = calculateDaysRemaining(eventDate);
  
  // Don't send if event has passed
  if (daysRemaining < 0) return [];
  
  // Check if we should send messages today
  if (!shouldSendMessagesToday(eventDate)) return [];
  
  // Filter guests based on proximity to event
  if (daysRemaining >= 28 && daysRemaining <= 30) {
    // Initial invitation - send to all guests with pending status
    return guests.filter(guest => 
      !contactedGuests.has(guest.phone) && 
      (guest.status === 'Pending' || guest.status === '')
    );
  } else if (daysRemaining === 14) {
    // First reminder - send only to non-respondents
    return guests.filter(guest => 
      !contactedGuests.has(guest.phone) && 
      (guest.status === 'Pending' || guest.status === '')
    );
  } else if (daysRemaining === 7) {
    // Second reminder - more urgent, send to non-respondents
    return guests.filter(guest => 
      (guest.status === 'Pending' || guest.status === '')
    );
  } else if (daysRemaining >= 2 && daysRemaining <= 3) {
    // Final reminder - send to confirmed guests as courtesy and non-respondents
    return guests.filter(guest => 
      guest.status === 'Confirmed' || guest.status === 'Pending' || guest.status === ''
    );
  }
  
  return [];
}

/**
 * Get a custom message based on days remaining until event
 * @param {number} daysRemaining - Days until event
 * @param {Object} eventDetails - Event details with name, date, time, location, description
 * @param {string} guestName - Name of the guest
 * @returns {string} Custom message to send
 */
export function getMessageByProximity(daysRemaining, eventDetails, guestName) {
  // Base message structure is the same
  const baseMessage = `*${eventDetails.name} - הזמנה לאירוע*\n\nשלום ${guestName},\n\n`;
  const eventInfo = `📅 תאריך: ${eventDetails.date}\n⏰ שעה: ${eventDetails.time}\n📍 מיקום: ${eventDetails.location}\n\n${eventDetails.description}`;
  
  if (daysRemaining >= 28) {
    // Initial invitation
    return `${baseMessage}אתם מוזמנים ל${eventDetails.name}!\n\n${eventInfo}\n\nהאם תוכלו להגיע?`;
  } else if (daysRemaining === 14) {
    // First reminder
    return `${baseMessage}אנו מזכירים לכם את ההזמנה ל${eventDetails.name}.\n\n${eventInfo}\n\nנשמח לדעת האם תוכלו להגיע?`;
  } else if (daysRemaining === 7) {
    // Second reminder
    return `${baseMessage}בעוד שבוע יתקיים ${eventDetails.name}.\n\n${eventInfo}\n\nנשמח לקבל את תשובתכם בהקדם.`;
  } else if (daysRemaining <= 3) {
    // Final reminder
    return `${baseMessage}בעוד ${daysRemaining} ימים יתקיים ${eventDetails.name}.\n\n${eventInfo}\n\nזוהי תזכורת אחרונה. נשמח לראותכם!`;
  }
  
  // Default message
  return `${baseMessage}אתם מוזמנים ל${eventDetails.name}!\n\n${eventInfo}\n\nהאם תוכלו להגיע?`;
}
