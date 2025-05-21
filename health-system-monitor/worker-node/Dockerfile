# Base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY src ./src

# Build TypeScript code
RUN npm run build

# Prune development dependencies
RUN npm prune --production

# Expose port (will be overridden by PORT env var at runtime)
EXPOSE 3000


# Health check using the /check endpoint
# HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
#   CMD wget -qO- http://localhost:${PORT:-3000}/check || exit 1

# Start the application
CMD ["node", "build/index.js"]