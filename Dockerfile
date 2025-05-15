FROM --platform=linux/amd64 node:24-slim
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

# Install app dependencies with better error handling
COPY package*.json ./
# Modify package.json to use public npm package instead of private GitHub repo
RUN sed -i 's|"git+ssh://git@github.com/GataNina-Li/baileys.git"|"@nstar/baileys@latest"|g' package.json \
    && cat package.json
#RUN npm install --no-fund --no-audit || (cat /root/.npm/_logs/*-debug-0.log && exit 1)

# Bundle app source
COPY . .

# Create persistent session directory that Railway will mount to
RUN mkdir -p /app/session

# Set environment variables
ENV NODE_ENV=production

# Create volume mounts for persistence
VOLUME ["/app/session", "/app/logs"]

# Expose the port the app runs on
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]