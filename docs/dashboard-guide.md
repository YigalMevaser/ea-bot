![Dashboard](https://i.ibb.co/K9b16bK/event-dashboard-mockup.png)

## Dashboard Overview

The guest dashboard provides you with a comprehensive view of your event's RSVP status in real-time. Key features include:

1. **Event Summary**
   - Event name, date, time, and location
   - Days remaining until the event
   - Event description

2. **RSVP Statistics**
   - Total invited guests
   - Number of confirmed attendees
   - Number of declined invitations
   - Number of pending responses
   - Expected total attendees (counting +1s)
   - Response rate percentage

3. **Guest Management**
   - Complete guest list with RSVP status
   - Search functionality to find specific guests
   - Filter by status (confirmed, declined, pending, maybe)
   - Last contacted timestamp for each guest
   - Notes field for special requirements or comments

## Using the Dashboard

The dashboard is automatically available at `/dashboard` on your bot's server. It's designed to be intuitive and requires no special training to use:

- **Real-time Updates**: Data refreshes automatically every minute
- **Manual Refresh**: Click the "Refresh Data" button to update immediately
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Search & Filter**: Quickly find guests or view specific groups (e.g., only those who confirmed)

### Authentication

1. Navigate to `/dashboard` on your bot's server (example: `https://your-bot-url.up.railway.app/dashboard`)
2. Enter the dashboard password when prompted (default is `admin` unless changed in your environment variables)
3. Once authenticated, you'll remain logged in for 24 hours or until you click the "Logout" button

### Configuration

Set these environment variables to configure your dashboard:

```
DASHBOARD_PASSWORD=your-secure-password
DASHBOARD_TOKEN=your-secure-token
```

For best security practices:
- Use a strong password
- Change the default credentials in production
- Access the dashboard over HTTPS whenever possible

This dashboard helps you keep track of your event's attendance without needing to access the Google Sheet directly, providing a more visual and interactive experience.
