#!/bin/sh
set -e

echo "Running database migrations..."
node dist/src/database/run-migrations.js

echo "Seeding admin user (skips if already exists)..."
node dist/src/database/seeds/seed-admin.js || echo "Admin seed skipped or failed (non-critical)"

echo "Starting application..."
exec node dist/src/main
