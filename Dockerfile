# Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all dependencies
RUN npm install

# Copy source code
COPY client/ ./client/
COPY server/ ./server/
COPY database/ ./database/

# Build client and server
RUN npm run build

# Copy client build to server's public folder
RUN mkdir -p server/dist/public && cp -r client/dist/* server/dist/public/

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Copy server build and production dependencies
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package.json ./
COPY --from=build /app/database/migrations ./migrations

# Install production dependencies only
RUN npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "dist/index.js"]
