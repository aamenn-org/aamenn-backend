#!/bin/sh
set -e

echo "Running database migrations..."
node dist/src/database/run-migrations.js

echo "Seeding admin user (skips if already exists)..."
npx ts-node -r tsconfig-paths/register src/database/seeds/seed-admin.ts || echo "⚠️ Admin seed failed (non-critical if admin already exists)"

echo "Starting application..."
exec node dist/src/main
