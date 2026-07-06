# Единые команды монорепо «Жемчужина Алтая».
# Цели наполняются по мере прохождения плана (шаги 0.2+).

.PHONY: help up down ps backend-dev backend-build strapi-dev frontend-dev

help: ## Показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

up: ## Поднять весь стек (docker compose, с пересборкой)
	docker compose --env-file infra/compose/images.env -f infra/compose/docker-compose.yml up -d --build

down: ## Остановить стек
	docker compose --env-file infra/compose/images.env -f infra/compose/docker-compose.yml down

ps: ## Статус контейнеров стека
	docker compose --env-file infra/compose/images.env -f infra/compose/docker-compose.yml ps

backend-dev: ## Запустить backend в dev-режиме (нужен .env или переменные окружения)
	cd apps/backend && bun run start:dev

backend-build: ## Собрать backend
	cd apps/backend && bun run build

strapi-dev: ## Запустить Strapi в dev-режиме — этап 1
	@echo "TODO(этап 1): cd apps/strapi && bun run develop"

frontend-dev: ## Запустить витрину в dev-режиме
	cd apps/frontend && bun run dev
