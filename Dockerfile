FROM node:18-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Create necessary directories
RUN mkdir -p public/media

# Copy the application files
COPY public ./public
COPY server.js ./server.js

# Create media directory with proper permissions
RUN chmod -R 777 public/media

# Expose the port your app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "server.js"]