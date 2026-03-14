FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "app.js"]
```

Save it.

## **Step 4: Create .dockerignore**

In your project root, create a file named `.dockerignore`

Copy-paste this:
```
node_modules
npm-debug.log
.git
.env
.env.local
.DS_Store