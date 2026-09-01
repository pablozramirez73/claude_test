#!/bin/sh
# Waits for Postgres, applies migrations, then execs whatever CMD (or
# docker-compose `command:` override) was given — gunicorn for prod,
# `manage.py runserver` for dev.
set -e

host="${POSTGRES_HOST:-db}"
port="${POSTGRES_PORT_INTERNAL:-5432}"

echo "Waiting for Postgres at ${host}:${port}..."
until python -c "import socket; socket.create_connection(('${host}', ${port}), timeout=2).close()" 2>/dev/null; do
  sleep 1
done
echo "Postgres is up."

python manage.py migrate --noinput

exec "$@"
