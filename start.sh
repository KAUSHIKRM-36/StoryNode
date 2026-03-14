#!/bin/sh

# Exit on any error
set -e

echo "Starting StoryNode Blogging Platform..."

# If we're waiting for database (in Docker), use wait-on
if [ "$DOCKER_ENV" = "true" ] || [ "$MYSQL_HOST" != "localhost" ]; then
  echo "Waiting for MySQL to be ready..."
  npx wait-on tcp://$MYSQL_HOST:3306 --timeout 30000 || true
  sleep 2
fi

echo "Starting Node.js application..."
exec node app.js
