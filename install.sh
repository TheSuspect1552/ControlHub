#!/bin/bash

# Скрипт завершит работу, если любая команда вернет ошибку
set -e

echo "=========================================="
echo "    Control Hub - Docker Setup Script     "
echo "=========================================="
echo ""

# 1. Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "[!] Ошибка: Docker не установлен. Пожалуйста, установите Docker сначала."
    exit 1
fi

# 2. Определение доступной версии Docker Compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "[!] Ошибка: Docker Compose (плагин или утилита) не найден."
    echo "    Установите его через: apt-get install docker-compose-plugin"
    exit 1
fi

echo "Настройка конфигурации сервера:"
echo "------------------------------------------"

# Удобный ввод: показываем дефолтные значения прямо в подсказке [inside]
read -p "Публичный порт [8000]: " PORT
PORT=${PORT:-8000}

read -p "Секретный токен агента [secure-company-token-123]: " AGENT_TOKEN
AGENT_TOKEN=${AGENT_TOKEN:-secure-company-token-123}

read -p "Имя администратора [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

# Безопасный ввод пароля: скрываем символы при вводе (-s)
echo -n "Пароль администратора [admin]: "
read -s ADMIN_PASS
echo "" # Перенос строки после скрытого ввода
ADMIN_PASS=${ADMIN_PASS:-admin}

echo ""
echo "Генерация файла .env..."

cat <<EOF > .env
PORT=$PORT
AGENT_TOKEN=$AGENT_TOKEN
ADMIN_USER=$ADMIN_USER
ADMIN_PASS=$ADMIN_PASS
EOF

echo "Файл .env успешно создан."
echo ""
echo "Запуск Docker контейнеров..."
echo "Это может занять несколько минут, так как компилируются среды Go и Node.js."
echo "------------------------------------------"

# Отключаем 'set -e' на время сборки, чтобы перехватить ошибку и красиво её обработать
set +e
$DOCKER_COMPOSE_CMD up -d --build

if [ $? -ne 0 ]; then
    echo ""
    echo "=========================================="
    echo "[!] КРИТИЧЕСКАЯ ОШИБКА: Сборка или запуск контейнеров сорвались."
    echo "    Проверьте логи выше, чтобы понять причину."
    echo "=========================================="
    exit 1
fi
set -e

# Получаем реальный IP-адрес сервера для удобства пользователя
SERVER_IP=$(hostname -I | awk '{print $1}')
[ -z "$SERVER_IP" ] && SERVER_IP="localhost"

echo ""
echo "=========================================="
echo " 🎉 Настройка успешно завершена!"
echo " Control Hub запущен и доступен по ссылкам:"
echo " Локально: http://localhost:$PORT"
echo " В сети:   http://$SERVER_IP:$PORT"
echo "=========================================="
