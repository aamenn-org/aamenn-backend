# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

COPY package*.json ./
# Install production deps + ts-node for running seed scripts
RUN npm install --omit=dev && \
    npm install ts-node typescript tsconfig-paths && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/scripts/start.sh ./scripts/start.sh

# Make start script executable
RUN chmod +x ./scripts/start.sh && chown nestjs:nodejs ./scripts/start.sh

USER nestjs

EXPOSE 3000

CMD ["./scripts/start.sh"]
