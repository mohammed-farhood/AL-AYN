# Use Node.js 18 (stable)
FROM node:18

# Set working directory to /app
WORKDIR /app

# Copy package.json and package-lock.json from the backend folder
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the backend files
COPY backend/ .

# Hugging Face requires app to listen on port 7860
EXPOSE 7860

# Start the application
CMD ["node", "server.js"]
