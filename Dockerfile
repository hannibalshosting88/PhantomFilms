FROM node:18-alpine

WORKDIR /app

# Set up the app directory structure
RUN mkdir -p public/media public/thumbnails

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the server.js file
COPY server.js ./

# Copy the public directory
COPY public ./public

# Set appropriate permissions for upload directories
RUN chmod -R 777 public/media public/thumbnails

# Define the exposed port
EXPOSE 3000

# Set the command to run the application
CMD ["node", "server.js"]