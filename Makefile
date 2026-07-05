# Единые команды монорепо «Жемчужина Алтая».
# Цели наполняются по мере прохождения плана (шаги 0.2+).

.PHONY: help up down backend-dev strapi-dev frontend-dev submodule-init

help: ## Показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

submodule-init: ## Инициализировать сабмодуль фронтенда
	git submodule update --init --recursive

up: ## Поднять весь стек (docker compose) — появится на шаге 0.5
	@echo "TODO(0.5): docker compose -f infra/compose/docker-compose.yml up -d"

down: ## Остановить стек
	@echo "TODO(0.5): docker compose -f infra/compose/docker-compose.yml down"

backend-dev: ## Запустить backend в dev-режиме — появится на шаге 0.2
	@echo "TODO(0.2): cd apps/backend && bun run start:dev"

strapi-dev: ## Запустить Strapi в dev-режиме — этап 1
	@echo "TODO(этап 1): cd apps/strapi && bun run develop"

frontend-dev: ## Запустить витрину в dev-режиме
	cd apps/frontend && bun run dev
