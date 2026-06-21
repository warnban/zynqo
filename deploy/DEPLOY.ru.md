# Деплой zynqo

Пошаговая инструкция для VPS. Стек: **Node 22 + Express + SQLite + React (статика)**.  
Генерации идут через **AI Tunnel** — GPU на вашем сервере **не нужен**.

---

## Быстрый старт (Docker)

### 1. Сервер

Ubuntu 22.04/24.04, Docker и Docker Compose v2:

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Код и конфиг

```bash
git clone <repo> zynqo && cd zynqo
cp deploy/env.production.example server/.env
nano server/.env   # заполните JWT_SECRET, AITUNNEL_API_KEY, SMTP, ADMIN_PASSWORD
```

Сгенерируйте секрет:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Запуск

**Только приложение** (порт 8787, для теста за nginx/Caddy на хосте):

```bash
docker compose up -d --build
```

**С HTTPS через Caddy** (Let's Encrypt автоматически):

```bash
# В server/.env: DOMAIN=zynqo.ru, APP_URL=https://zynqo.ru
docker compose --profile https up -d --build
```

Проверка:

```bash
curl http://127.0.0.1:8787/api/health
```

### 4. DNS

| Запись | Значение |
|--------|----------|
| `A` | IP вашего VPS |
| `A` `www` | IP вашего VPS (или CNAME на `@`) |

---

## Без Docker (systemd)

```bash
pnpm install && pnpm build
cd server && npm ci --omit=dev
cp ../deploy/env.production.example .env   # отредактируйте
NODE_ENV=production SERVE_STATIC=true node index.js
```

Пример unit `/etc/systemd/system/zynqo.service`:

```ini
[Unit]
Description=zynqo
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/zynqo/server
Environment=NODE_ENV=production
Environment=SERVE_STATIC=true
Environment=STATIC_DIR=/opt/zynqo/dist
Environment=DATA_DIR=/var/lib/zynqo
EnvironmentFile=/opt/zynqo/server/.env
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/lib/zynqo
sudo systemctl enable --now zynqo
```

---

## Обязательный чеклист prod `.env`

| Переменная | Зачем |
|------------|--------|
| `JWT_SECRET` | Подпись сессий (длинная случайная строка) |
| `APP_URL` | `https://zynqo.ru` — редиректы VK, CORS |
| `AITUNNEL_API_KEY` | Реальные генерации |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Первый админ (сменить дефолт!) |
| `SMTP_*` | Коды подтверждения e-mail |
| `VK_REDIRECT_URI` | `https://zynqo.ru/api/auth/vk/callback` |

---

## Бэкапы SQLite

Docker (данные в volume `zynqo_data`):

```bash
docker compose exec zynqo sh -c 'sqlite3 /app/data/zynqo.db ".backup /app/data/backup.db"'
docker compose cp zynqo:/app/data/backup.db ./backups/
```

Cron (ежедневно в 3:00):

```cron
0 3 * * * cd /opt/zynqo && ./deploy/backup.sh /backups/zynqo-$(date +\%Y\%m\%d).db
```

Храните копии **вне** сервера (S3, другой VPS).

---

## Рекомендации по серверам

zynqo — **лёгкий API-прокси**: запросы к AI Tunnel, SQLite, статика React.  
Тяжёлые вычисления (нейросети) — **на стороне AI Tunnel**, не на вашем VPS.

### Старт / закрытая бета (до ~50–100 активных в день)

| Параметр | Минимум |
|----------|---------|
| CPU | **2 vCPU** |
| RAM | **2 GB** |
| Диск | **25–40 GB NVMe SSD** |
| Сеть | **100 Mbit/s**, безлимит или от 1 TB/мес |
| ОС | Ubuntu 22.04/24.04 LTS |

**Примерные тарифы:** Timeweb Cloud ~400–700 ₽/мес, Selectel ~800–1200 ₽/мес, VK Cloud / Yandex Cloud от ~1500 ₽/мес.

### Публичный запуск (100–500 пользователей в день)

| Параметр | Рекомендация |
|----------|--------------|
| CPU | **2–4 vCPU** |
| RAM | **4 GB** |
| Диск | **40–60 GB NVMe** |
| БД | SQLite ещё ок; следите за размером `zynqo.db` |

### Рост (500+ DAU, много видео-очередей)

| Параметр | Рекомендация |
|----------|--------------|
| CPU | **4 vCPU** |
| RAM | **8 GB** |
| БД | **PostgreSQL** (managed) вместо SQLite |
| Очередь | **Redis** для async-видео (если добавите BullMQ) |
| CDN | Cloudflare перед статикой (опционально) |

### Чего НЕ нужно на старте

- GPU / выделенный сервер
- Kubernetes
- Отдельный сервер БД (пока SQLite + volume)
- Redis (пока видео polling в одном процессе)

### Где арендовать (РФ)

| Провайдер | Плюсы |
|-----------|--------|
| **Timeweb Cloud** | Простой UI, недорого, подходит для MVP |
| **Selectel** | Стабильность, хорошая сеть |
| **VK Cloud** | Если нужна экосистема VK |
| **Yandex Cloud** | Managed PostgreSQL/S3 на будущее |

Для соответствия 152-ФЗ позже уточните у провайдера **размещение данных в РФ** и политику обработки ПДн.

### SMTP (отдельно от VPS)

Почта для кодов регистрации — не с VPS:

- **Yandex 360 / Mail.ru для бизнеса** — `smtp.yandex.ru:465`
- **SendPulse, UniSender** — транзакционная почта
- Настройте SPF, DKIM, DMARC для домена `zynqo.ru`

---

## Мониторинг

- Health: `GET /api/health` → `{ ok: true }`
- Логи: `docker compose logs -f zynqo`
- Алерт если health не 200 (UptimeRobot, бесплатно)

---

## Обновление

```bash
git pull
docker compose up -d --build
```

База в volume — **не пересоздаётся** при пересборке образа.
