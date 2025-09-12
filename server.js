require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// Инициализация базы данных
const { initDatabase } = require('./config/database');

// Импорт роутов
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const minesRoutes = require('./routes/minesRoutes');
const rocketRoutes = require('./routes/rocketRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

// Использование роутов
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/mines', minesRoutes);
app.use('/api/rocket', rocketRoutes);
app.use('/api', paymentRoutes);

// WebSocket сервер для ракетки
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

// Инициализация сервисов
const { startRocketGame, broadcastRocketUpdate, rocketGame } = require('./services/rocketGameService');

// WebSocket обработчик
wss.on('connection', function connection(ws) {
    console.log('Rocket game client connected');
    
    // Отправляем текущее состояние игры при подключении
    ws.send(JSON.stringify({
        type: 'rocket_update',
        game: rocketGame
    }));

    ws.on('close', () => {
        console.log('Rocket game client disconnected');
    });
});

// Крон задача для проверки инвойсов каждую минуту
cron.schedule('* * * * *', async () => {
    try {
        const { checkPendingInvoices } = require('./services/paymentService');
        await checkPendingInvoices();
    } catch (error) {
        console.error('Cron job error:', error);
    }
});

// Запуск сервера
async function startServer() {
    await initDatabase();
    startRocketGame(); // Запускаем игру ракетка
    console.log(`TON Casino Server started on port ${PORT}`);
}

startServer();

module.exports = { app, wss };