const express = require('express');
const axios = require('axios');
const ical = require('ical');
require('dotenv').config();

const app = express();
app.use(express.json());

async function getBusyDates() {
  if (process.env.ICAL_URL) {
    try {
      const response = await axios.get(process.env.ICAL_URL);
      const data = ical.parseICS(response.data);
      const busyDates = new Set();
      const today = new Date();
      today.setHours(0,0,0,0);
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

      for (let k in data) {
        if (data[k].type === 'VEVENT') {
          const start = new Date(data[k].start);
          const end = new Date(data[k].end);
          for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
            const current = new Date(d);
            if (current >= today && current <= thirtyDaysLater) {
              busyDates.add(current.toISOString().slice(0,10));
            }
          }
        }
      }
      return Array.from(busyDates).sort();
    } catch (e) {
      console.error('Ошибка iCal:', e);
      return [];
    }
  } else {
    return [];
  }
}

app.post('/callback', async (req, res) => {
  const { type, secret, object } = req.body;

  if (secret !== process.env.SECRET_KEY) {
    return res.status(403).send('Invalid secret');
  }

  if (type === 'confirmation') {
    return res.send(process.env.CONFIRMATION_CODE || '');
  }

  if (type === 'message_new') {
    const userId = object.message.from_id;
    const text = object.message.text || '';
    const sendMessage = async (message) => {
      await axios.post('https://api.vk.com/method/messages.send', {
        user_id: userId,
        message: message,
        random_id: Math.floor(Math.random() * 1000000),
        access_token: process.env.VK_TOKEN,
        v: '5.131'
      });
    };

    if (text.toLowerCase() === 'даты' || text.toLowerCase() === 'свободные даты' || text.toLowerCase() === 'занятость') {
      const busy = await getBusyDates();
      if (busy.length === 0) {
        await sendMessage('Пока нет данных о занятости. Попробуйте позже.');
      } else {
        let responseText = '🎬 *Кинозал 4K: занятость на 30 дней*\n\n';
        const today = new Date();
        for (let i = 0; i < 30; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().slice(0,10);
          const isBusy = busy.includes(dateStr);
          const day = d.getDate().toString().padStart(2,'0');
          const month = (d.getMonth()+1).toString().padStart(2,'0');
          responseText += `${isBusy ? '❌' : '✅'} ${day}.${month}\n`;
        }
        responseText += '\nЧтобы забронировать, напишите "Хочу [дата]" и я передам хозяину.';
        await sendMessage(responseText);
      }
    }
    else if (text.toLowerCase().startsWith('хочу')) {
      await sendMessage('Спасибо! Я передал запрос хозяину, он скоро свяжется с вами.');
      console.log(`Заявка от ${userId}: ${text}`);
    }
    else {
      await sendMessage('Привет! Я бот Кинозала 4K. Напишите "Даты" для проверки занятости, или "Хочу [дата]" для брони.');
    }
  }

  res.send('ok');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Бот запущен');
});