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
RUN mkdir -p /app/session /app/logs /app/data && \
    chmod -R 777 /app/session /app/logs /app/data

# Set environment variables
ENV NODE_ENV=production
ENV SESSION_PATH=/app/session
ENV PORT=8080
ENV DASHBOARD_PASSWORD=1234

# Copy app source and update imports if needed (separate step for better caching)
COPY . .

# Post-process files after copy (using find without unnecessary pipes)
RUN find . -type f -name "*.js" -exec sed -i 's|@nstar/baileys|baileys|g' {} \;

# Create volume mounts for persistence (including data directory for multi-tenant)
VOLUME ["/app/session", "/app/logs", "/app/data"]

# Expose the port the app runs on
EXPOSE 3000

# Add Docker healthcheck
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node health-check.js || exit 1

# Make the health and monitor scripts executable
RUN chmod +x check-deps.sh

# We're not using a non-root user to avoid permission issues on Railway
# This simplifies deployment but note that running as root is less secure

# Start the bot with proper entrypoint
ENTRYPOINT ["node", "start.js"]