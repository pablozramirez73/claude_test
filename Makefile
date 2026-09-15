.PHONY: help install migrate run worker bot test lint build tma-dev

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

install:  ## Installa le dipendenze di backend e Mini App
	cd backend && pip install -r requirements-dev.txt
	cd frontend_tma && npm install && npm run fetch:models

migrate:  ## Applica le migrazioni
	cd backend && python manage.py migrate

run:  ## Avvia l'API in ASGI (WebSocket incluse)
	cd backend && daphne -b 0.0.0.0 -p 7000 config.asgi:application

worker:  ## Avvia il worker Celery
	cd backend && celery -A config worker -l info

bot:  ## Avvia il bot Telegram in polling
	cd backend && python manage.py run_bot

test:  ## Esegue la suite di test del backend
	cd backend && pytest

lint:  ## Lint di backend e Mini App
	cd backend && ruff check .
	cd frontend_tma && npm run lint

tma-dev:  ## Server di sviluppo della Mini App
	cd frontend_tma && npm run dev

build:  ## Build di produzione della Mini App
	cd frontend_tma && npm run build
