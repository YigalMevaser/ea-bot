#!/usr/bin/env bash
# Check and fix dependencies for Event RSVP Bot

echo "Checking Event RSVP Bot dependencies..."

# Check if .env file exists
if [ ! -f .env ]; then
  echo "❌ Missing .env file. Please create one using .env.example as a template."
  exit 1
fi

# Check if EVENT_DATE is set in .env
if ! grep -q "EVENT_DATE=" .env; then
  echo "⚠️  EVENT_DATE is not set in .env file."
  read -p "Would you like to add it now? [Y/n] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    read -p "Enter event date (YYYY-MM-DD format): " event_date
    echo "EVENT_DATE=$event_date" >> .env
    echo "✅ Added EVENT_DATE to .env"
  else
    echo "⚠️  EVENT_DATE not set. Using fallback date (30 days from now)."
  fi
fi

# Check if date-fns is installed
if ! npm list date-fns | grep -q date-fns; then
  echo "⚠️  date-fns package is not installed."
  read -p "Would you like to install it now? [Y/n] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    npm install date-fns@^2.30.0
    echo "✅ Installed date-fns package"
  else
    echo "⚠️  date-fns not installed. Using fallback date calculations."
  fi
fi

# Check other key dependencies
echo "Checking other key dependencies..."
npm list @nstar/baileys dotenv node-cron express > /dev/null
if [ $? -ne 0 ]; then
  echo "⚠️  Some dependencies may be missing. Running full npm install..."
  npm install
fi

echo "✅ Dependency check complete."
echo "Run 'npm start' to start the bot."
