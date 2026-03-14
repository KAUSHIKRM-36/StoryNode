# Use Node 20
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose the port your app will run on
EXPOSE 3001

# Start the app
CMD ["npm", "start"]