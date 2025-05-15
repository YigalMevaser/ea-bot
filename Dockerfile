FROM --platform=linux/amd64 node:18-slim
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
RUN npm install --no-fund --no-audit || (cat /root/.npm/_logs/*-debug-0.log && exit 1)

# Bundle app source
COPY . .

# Create persistent session directory that Railway will mount to
RUN mkdir -p /app/session

# Set environment variable
ENV NODE_ENV=production

# Start the bot
CMD ["npm", "start"]