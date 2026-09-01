# MISURA backend — Django + PostgreSQL.
#
# One image for dev and prod; docker-compose picks the command (runserver
# with hot reload for dev, gunicorn for prod) — see docker-compose.yml.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# psycopg2-binary needs libpq at runtime; build-essential + libpq-dev cover
# building it (and anything else) from source too, on any host arch.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
# Default (production-leaning) command; the dev compose service overrides
# this with `manage.py runserver` for hot reload.
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
