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

# Copy package files
COPY package*.json ./

# Modify package.json to use baileys directly and ensure date-fns is included
RUN sed -i 's|"@nstar/baileys": ".*"|"baileys": "github:GataNina-Li/baileys"|g' package.json && \
    if ! grep -q '"date-fns":' package.json; then \
      sed -i 's|"dependencies": {|"dependencies": {\n        "date-fns": "^2.30.0",|' package.json; \
    fi

# Install dependencies with force to bypass peer dependency issues
RUN npm install --no-fund --production --omit=dev --force

# Copy app source and update imports if needed
COPY . .
RUN find . -type f -name "*.js" -exec sed -i 's|@nstar/baileys|baileys|g' {} \;

# Create persistent directories
RUN mkdir -p /app/session /app/logs /session

# Set environment variables
ENV NODE_ENV=production
ENV SESSION_PATH=/session
ENV PORT=8080

# Create volume mounts for persistence
VOLUME ["/session", "/app/logs"]

# Expose the port the app runs on
EXPOSE 3000

# Add Docker healthcheck
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node auto-restart.js || exit 1

# Make the health and monitor scripts executable
RUN chmod +x check-deps.sh

# Start the bot with proper entrypoint
ENTRYPOINT ["node", "start.js"]