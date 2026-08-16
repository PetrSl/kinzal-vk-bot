const express = require('express');
const axios = require('axios');
const ical = require('ical');
require('dotenv').config();

const app = express();
app.use(express.json());

// Простой ответ на корневой путь, чтобы проверять живость сервиса
app.get('/', (req, res) => res.send('KinZal VK Bot is running'));

// Функция получения занятых дат из iCal
async function getBusyDates() {
  if (!process.env.ICAL_URL) {
    return [];
  }
  try {
    const response = await axios.get(process.env.ICAL_URL);
    const data = ical.parseICS(response.data);
    const busyDates = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    for (let k in data) {
      if (data[k].type === 'VEVENT') {
        const start = new Date(data[k].start);
        const end = new Date(data[k].end);
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
          const current = new Date(d);
          if (current >= today && current <= thirtyDaysLater) {
            busyDates.add(current.toISOString().slice(0, 10));
          }
        }
      }
    }
    return Array.from(busyDates).sort();
  } catch (e) {
    console.error('Ошибка iCal:', e.message);
    return [];
  }
}

// Функция отправки сообщения пользователю VK
async function sendVkMessage(userId, message) {
  try {
    const response = await axios.post('https://api.vk.com/method/messages.send', {
      user_id: userId,
      message: message,
      random_id: Math.floor(Math.random() * 1000000),
      access_token: process.env.VK_TOKEN,
      v: '5.131'
    });
    console.log('VK API ответ:', JSON.stringify(response.data));
  } catch (error) {
    console.error('Ошибка отправки VK:', error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

// Обработчик Callback API
app.post('/callback', (req, res) => {
  const { type, secret, object } = req.body;

  // Проверка секретного ключа
  if (secret !== process.env.SECRET_KEY) {
    console.error('Неверный секретный ключ');
    return res.status(403).send('Invalid secret');
  }

  // Подтверждение адреса
  if (type === 'confirmation') {
    return res.send(process.env.CONFIRMATION_CODE || '');
  }

  // Если это новое сообщение — сразу отвечаем "ok", а обработку делаем асинхронно
  if (type === 'message_new') {
    res.send('ok'); // VK получит ответ сразу, не дожидаясь длительной обработки

    const message = object.message;
    if (!message) return;

    const userId = message.from_id;
    const text = (message.text || '').toLowerCase();

    // Обрабатываем команды
    if (text === 'даты' || text === 'свободные даты' || text === 'занятость') {
      getBusyDates().then(busy => {
        if (busy.length === 0) {
          return sendVkMessage(userId, 'Пока нет данных о занятости. Попробуйте позже.');
        } else {
          let responseText = '🎬 *Кинозал 4K: занятость на 30 дней*\n\n';
          const today = new Date();
          for (let i = 0; i < 30; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().slice(0, 10);
            const isBusy = busy.includes(dateStr);
            const day = d.getDate().toString().padStart(2, '0');
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            responseText += `${isBusy ? '❌' : '✅'} ${day}.${month}\n`;
          }
          responseText += '\nЧтобы забронировать, напишите "Хочу [дата]" и я передам хозяину.';
          return sendVkMessage(userId, responseText);
        }
      }).catch(err => console.error('Ошибка обработки команды "даты":', err));
    }
    else if (text.startsWith('хочу')) {
      sendVkMessage(userId, 'Спасибо! Я передал запрос хозяину, он скоро свяжется с вами.');
      console.log(`Заявка от ${userId}: ${text}`);
    }
    else {
      sendVkMessage(userId, 'Привет! Я бот Кинозала 4K. Напишите "Даты" для проверки занятости, или "Хочу [дата]" для брони.');
    }
    return;
  }

  // Для остальных событий отвечаем "ok"
  res.send('ok');
});

// Запуск сервера
app.listen(process.env.PORT || 3000, () => {
  console.log('Бот запущен');
});
