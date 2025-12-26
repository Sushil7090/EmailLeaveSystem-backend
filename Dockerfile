# 1. Use Node Alpine Image (lightweight)
FROM node:18-alpine

# 2. Create app folder
WORKDIR /app

# 3. Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --production

# 4. Copy all project files
COPY . .

# 5. Expose port your app runs on
EXPOSE 5001

# 6. Start server using production entry file
CMD ["node", "app.js"]

