# infra/certs

Здесь хранятся ТОЛЬКО публичные корневые сертификаты УЦ (Минцифры / УЦ Эвотор),
которые добавляются в trust store Node (`NODE_EXTRA_CA_CERTS`) для запросов
к `api.evotor.ru` и `platform-api2.max.ru`.

**Приватные ключи и TLS-сертификаты домена сюда НЕ кладём** — они живут только
на сервере (`certbot` / Let's Encrypt) и запрещены в git через `.gitignore`
(`*.key`, `*.pem`).

Источник корневых сертификатов Минцифры: https://www.gosuslugi.ru/crt
