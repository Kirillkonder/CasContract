require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// Импорт маршрутов
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const minesRoutes = require('./routes/mines');
const transactionsRoutes = require('./routes/transactions');

// Использование маршрутов
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/mines', minesRoutes);
app.use('/api/transactions', transactionsRoutes);

// Health check для Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'Server is awake',
        timestamp: new Date().toISOString()
    });
});

// Keep-alive система
setInterval(() => {
    console.log('🔁 Keep-alive ping:', new Date().toLocaleTimeString());
}, 14 * 60 * 1000); // Каждые 14 минут

// Инициализация и запуск сервера
async function startServer() {
    try {
        const { initDatabase } = require('./config/database');
        await initDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🏦 Casino bank initialized`);
            console.log(`👑 Owner ID: ${process.env.OWNER_TELEGRAM_ID}`);
            console.log(`💣 Mines game ready`);
            console.log('🔄 Keep-alive service started (ping every 14 minutes)');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();