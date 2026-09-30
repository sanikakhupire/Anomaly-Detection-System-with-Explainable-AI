FROM node:20-alpine

WORKDIR /app

# Install curl for container health check
RUN apk add --no-cache curl

# Install dependencies first for optimal layer caching
COPY package*.json ./
RUN npm install --only=production

# Copy application source
COPY . .

# Create uploads directory if not present
RUN mkdir -p uploads

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["node", "src/server.js"]
