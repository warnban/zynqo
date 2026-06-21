# Пошаговый деплoy zynqo — от нуля до публичного сайта

Домен: **zynqo.ru** · GitHub: **https://github.com/warnban/zynqo.git**

---

## Обзор (5 этапов)

1. Залить код на GitHub  
2. Подключиться к VPS и установить Docker  
3. Получить ключи (AI Tunnel, JWT, SMTP) и создать `.env`  
4. Настроить DNS  
5. Запустить приложение с HTTPS  

---

## Этап 1. GitHub

### 1.1 На вашем компьютере (Windows)

Откройте PowerShell в папке проекта `C:\aneuro`:

```powershell
cd C:\aneuro
git init
git add .
git commit -m "Initial zynqo release"
git branch -M main
git remote add origin https://github.com/warnban/zynqo.git
git push -u origin main
```

> Если репозиторий на GitHub уже не пустой — сначала `git pull origin main --rebase`, затем push.

Файл `server/.env` **не попадёт в git** (в `.gitignore`) — секреты только на сервере.

---

## Этап 2. VPS — первичная настройка

Подключитесь по SSH (логин/пароль или ключ из панели хостинга):

```bash
ssh root@ВАШ_IP_СЕРВЕРА
```

### 2.1 Обновление и базовые пакеты

```bash
apt update && apt upgrade -y
apt install -y git curl nano ufw
```

### 2.2 Файрвол

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Порт **8787** наружу не открываем — снаружи только 80/443 через Caddy.

### 2.3 Docker

```bash
curl -fsSL https://get.docker.com | sh
docker compose version
```

---

## Этап 3. Клонирование и `.env`

### 3.1 Клонировать репозиторий

```bash
cd /opt
git clone https://github.com/warnban/zynqo.git
cd zynqo
```

### 3.2 Создать файл конфигурации

```bash
cp deploy/env.production.example server/.env
nano server/.env
```

Заполните **все** поля ниже. Пример готового файла — в конце этого документа.

---

## Этап 4. Секреты и ключи (подробно)

### 4.1 JWT_SECRET — секрет для сессий

**На сервере** выполните:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Скопируйте длинную строку (96 символов) в `.env`:

```env
JWT_SECRET=вставьте_сюда_сгенерированную_строку
```

> Никому не показывайте. При смене секрета все пользователи разлогинятся.

---

### 4.2 AI Tunnel — API ключ и URL

По [документации AI Tunnel](https://aitunnel.ru):

| Параметр | Значение |
|----------|----------|
| **Base URL** | `https://api.aitunnel.ru/v1` |
| **API Key** | из личного кабинета |
| **Авторизация** | заголовок `Authorization: Bearer <ключ>` |

**Как получить ключ:**

1. Зарегистрируйтесь на [aitunnel.ru](https://aitunnel.ru)  
2. Войдите в **панель**  
3. Пополните баланс (от 399 ₽)  
4. Раздел **API-ключи** → **Создать ключ**  
5. Задайте лимит бюджета (рекомендуется для prod)  
6. Скопируйте ключ **один раз** — он больше не показывается полностью  

**В `.env`:**

```env
AITUNNEL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
AITUNNEL_BASE_URL=https://api.aitunnel.ru/v1
```

> `AITUNNEL_BASE_URL` менять **не нужно** — это официальный адрес из документации.  
> Меняют только если AI Tunnel явно укажет другой endpoint.

Проверка ключа с сервера (опционально):

```bash
curl -s https://api.aitunnel.ru/v1/models \
  -H "Authorization: Bearer ВАШ_AITUNNEL_API_KEY" | head -c 200
```

Должен вернуться JSON со списком моделей, не ошибка 401.

---

### 4.3 APP_URL и CORS

Если сайт на **https://zynqo.ru**:

```env
APP_URL=https://zynqo.ru
CORS_ORIGINS=https://zynqo.ru,https://www.zynqo.ru
```

Нужно для VK-редиректов и CORS в production.

---

### 4.4 Администратор

```env
ADMIN_EMAIL=admin@zynqo.ru
ADMIN_PASSWORD=ПридумайтеСложныйПароль123!
```

Создаётся **при первом запуске**, если такого e-mail ещё нет в БД.

---

### 4.5 SMTP — коды на почту при регистрации

Пример для **Yandex 360 / почты на домене**:

```env
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@zynqo.ru
SMTP_PASS=пароль_приложения_или_ящика
SMTP_FROM=noreply@zynqo.ru
```

Без SMTP коды регистрации пишутся **только в логи контейнера** (не для prod).

---

### 4.6 VK ID (опционально)

```env
VK_CLIENT_ID=12345678
VK_REDIRECT_URI=https://zynqo.ru/api/auth/vk/callback
```

В [id.vk.com](https://id.vk.com) → приложение → Redirect URI **точно** как выше.

---

### 4.7 Caddy (HTTPS)

```env
DOMAIN=zynqo.ru
ACME_EMAIL=support@zynqo.ru
```

---

## Этап 5. DNS

В панели регистратора домена **zynqo.ru**:

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `@` | IP вашего VPS |
| A | `www` | IP вашего VPS |

Подождите 5–30 минут (иногда до 24 ч).

Проверка:

```bash
dig +short zynqo.ru
```

Должен показать IP сервера.

---

## Этап 6. Запуск

```bash
cd /opt/zynqo
docker compose --profile https up -d --build
```

Первый запуск: сборка 2–5 минут.

### Проверки

```bash
# Статус контейнеров
docker compose ps

# Логи
docker compose logs -f zynqo

# Health
curl -s http://127.0.0.1:8787/api/health
```

В браузере: **https://zynqo.ru**

---

## Этап 7. После запуска

1. Откройте https://zynqo.ru → **Войти** → admin@zynqo.ru  
2. Проверьте регистрацию с кодом на почту  
3. Сделайте тестовую генерацию (чат или фото)  
4. В админке проверьте баланс и логи  

### Бэкап БД (раз в день)

```bash
crontab -e
```

Добавьте:

```cron
0 3 * * * docker compose -f /opt/zynqo/docker-compose.yml exec -T zynqo sh -c 'sqlite3 /app/data/zynqo.db ".backup /app/data/backup.db"' && cp /var/lib/docker/volumes/zynqo_zynqo_data/_data/backup.db /root/backups/zynqo-$(date +\%Y\%m\%d).db 2>/dev/null || true
```

Проще: вручную раз в неделю:

```bash
docker compose exec zynqo sh -c 'sqlite3 /app/data/zynqo.db ".backup /app/data/backup.db"'
docker compose cp zynqo:/app/data/backup.db ~/zynqo-backup.db
```

---

## Обновление версии

```bash
cd /opt/zynqo
git pull
docker compose --profile https up -d --build
```

База в Docker volume **сохраняется**.

---

## Пример полного `server/.env`

```env
NODE_ENV=production
PORT=8787
HOST=0.0.0.0

APP_URL=https://zynqo.ru
CORS_ORIGINS=https://zynqo.ru,https://www.zynqo.ru

JWT_SECRET=a1b2c3d4e5f6...96_символов_из_node_crypto

AITUNNEL_API_KEY=sk-ваш_ключ_из_панели_aitunnel
AITUNNEL_BASE_URL=https://api.aitunnel.ru/v1

ADMIN_EMAIL=admin@zynqo.ru
ADMIN_PASSWORD=SuperSecureAdmin2026!

SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@zynqo.ru
SMTP_PASS=app_password_here
SMTP_FROM=noreply@zynqo.ru

VK_CLIENT_ID=
VK_REDIRECT_URI=https://zynqo.ru/api/auth/vk/callback
VK_SERVICE_TOKEN=
VK_SCOPE=email phone

DOMAIN=zynqo.ru
ACME_EMAIL=support@zynqo.ru
```

---

## Частые проблемы

| Симптом | Решение |
|---------|---------|
| Сайт не открывается | DNS, `docker compose ps`, порты 80/443 |
| 502 от Caddy | `docker compose logs zynqo`, дождаться healthcheck |
| Демо-ответы в чате | Нет или неверный `AITUNNEL_API_KEY` |
| Код регистрации не приходит | SMTP, SPF/DKIM, смотреть спам |
| VK не работает | `APP_URL`, `VK_REDIRECT_URI` = https://zynqo.ru/... |
| 401 от AI Tunnel | Ключ неверный или баланс AI Tunnel = 0 |

---

## Минимальные требования к VPS

- **2 vCPU, 2 GB RAM, 25 GB SSD**, Ubuntu 22.04/24.04  
- GPU **не нужен** — модели на стороне AI Tunnel  
