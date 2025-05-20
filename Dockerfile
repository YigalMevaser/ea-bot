FROM --platform=linux/amd64 node:20-slim

# Install git, python, ffmpeg and build tools needed for native modules
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    ffmpeg \
    && ln -s /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Use build cache for npm install
# Use a build arg to bust cache when needed - docker build --build-arg CACHE_BUST=123
ARG CACHE_BUST=1
RUN echo "Cache bust: ${CACHE_BUST}"

# Modify package.json to use baileys directly and ensure date-fns is included
RUN sed -i 's|"@nstar/baileys": ".*"|"baileys": "github:GataNina-Li/baileys"|g' package.json && \
    if ! grep -q '"date-fns":' package.json; then \
      sed -i 's|"dependencies": {|"dependencies": {\n        "date-fns": "^2.30.0",|' package.json; \
    fi

# Install dependencies with optimizations
# 1. Use npm ci instead of npm install when possible
# 2. Use --no-audit to speed up installation
# 3. Create a .npmrc file to speed up file extraction
RUN echo "unsafe-perm=true\nloglevel=error\nfetch-timeout=60000\nfetch-retries=3" > .npmrc && \
    npm install --no-fund --production --omit=dev --force

# Create persistent directories first and set very permissive permissions
# This ensures any process can write to these directories on Railway
RUN mkdir -p /app/session /app/logs /app/data/images && \
    chmod -R 777 /app/session /app/logs /app/data

# Create a volume mount point for persistent storage
VOLUME ["/app/data/images"]

# Set environment variables
ENV NODE_ENV=production
ENV SESSION_PATH=/app/persistent/session
ENV PORT=8080
ENV DASHBOARD_PASSWORD=1234

# Copy app source and update imports if needed (separate step for better caching)
COPY . .

# Post-process files after copy (using find without unnecessary pipes)
RUN find . -type f -name "*.js" -exec sed -i 's|@nstar/baileys|baileys|g' {} \;

# Create a single volume mount for Railway persistence
VOLUME ["/app/persistent"]

# Expose the port the app runs on
EXPOSE 3000

# Add Docker healthcheck
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node health-check.js || exit 1

# We're not using a non-root user to avoid permission issues on Railway
# This simplifies deployment but note that running as root is less secure

# Make any scripts executable that need it 
RUN chmod +x *.sh 2>/dev/null || echo "No shell scripts to make executable"
RUN chmod +x init-credentials.js

# Create a startup wrapper script
RUN echo '#!/bin/bash\n\
echo "Checking for Railway single volume setup..."\n\
if [ -d "/app/persistent" ] || [ "$RAILWAY_VOLUME_MOUNT" = "true" ]; then\n\
  echo "Setting up single volume directory structure..."\n\
  bash /app/fix-railway-volume.sh\n\
  \n\
  # Ensure SESSION_PATH points to the persistent volume path\n\
  export SESSION_PATH=/app/persistent/session\n\
  echo "Using SESSION_PATH=$SESSION_PATH (single volume configuration)"\n\
else\n\
  echo "Using standard directory structure"\n\
  echo "Using SESSION_PATH=$SESSION_PATH (standard configuration)"\n\
fi\n\
\n\
echo "Restoring customer data from fixed backup if available..."\n\
bash /app/restore-customer-data.sh\n\
\n\
echo "Initializing credentials for all customers..."\n\
if [ -f "/app/persistent/data/customers.json" ] || [ -f "/app/data/customers.json" ]; then\n\
  # Check if environment variables for customer credentials are available\n\
  if [ "$AUTO_INIT_CREDENTIALS" = "true" ]; then\n\
    echo "Running auto-initialization of credentials for all customers..."\n\
    node /app/init-all-credentials.js\n\
  elif [ -n "$CUSTOMER_ID" ] && [ -n "$SECRET_KEY" ]; then\n\
    echo "Initializing credentials for single customer from environment variables..."\n\
    if [ -n "$APPS_SCRIPT_URL" ]; then\n\
      node /app/init-credentials.js "$CUSTOMER_ID" "$SECRET_KEY" "$APPS_SCRIPT_URL"\n\
    else\n\
      node /app/init-credentials.js "$CUSTOMER_ID" "$SECRET_KEY"\n\
    fi\n\
  else\n\
    echo "Skipping credential initialization. Set AUTO_INIT_CREDENTIALS=true to enable automatic initialization."\n\
  fi\n\
else\n\
  echo "WARNING: No customers.json file found. Skipping credential initialization."\n\
fi\n\
\n\
echo "Starting WhatsApp RSVP Bot..."\n\
node /app/start.js\n\
' > /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Start the bot with our custom entrypoint
ENTRYPOINT ["/app/docker-entrypoint.sh"]