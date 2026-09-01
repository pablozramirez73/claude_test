FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# libpq per psycopg, il resto serve a Pillow/ReportLab per i font e le immagini.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN python manage.py collectstatic --noinput || true

EXPOSE 8000

# ASGI: servono le WebSocket per gli aggiornamenti di stato del report.
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
