const express = require('express');
const router = express.Router();
const { getUsers, getTransactions } = require('../config/database');
const { validateTelegramId } = require('../utils/helpers');

// Получить информацию о пользователе
router.get('/:telegramId', (req, res) => {
    const { telegramId } = req.params;
    
    if (!validateTelegramId(telegramId)) {
        return res.status(400).json({ error: 'Invalid Telegram ID' });
    }

    const users = getUsers();
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({
        telegram_id: user.telegram_id,
        main_balance: user.main_balance,
        demo_balance: user.demo_balance,
        demo_mode: user.demo_mode,
        created_at: user.created_at
    });
});

// Создать нового пользователя
router.post('/create', (req, res) => {
    const { telegramId } = req.body;
    
    if (!validateTelegramId(telegramId)) {
        return res.status(400).json({ error: 'Invalid Telegram ID' });
    }

    const users = getUsers();
    const existingUser = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (existingUser) {
        return res.status(409).json({ error: 'User already exists' });
    }

    const newUser = users.insert({
        telegram_id: parseInt(telegramId),
        main_balance: 0,
        demo_balance: 1000,
        created_at: new Date(),
        demo_mode: false
    });

    res.json({
        success: true,
        user: {
            telegram_id: newUser.telegram_id,
            main_balance: newUser.main_balance,
            demo_balance: newUser.demo_balance
        }
    });
});

// Переключить демо режим
router.post('/toggle-demo', (req, res) => {
    const { telegramId } = req.body;
    
    if (!validateTelegramId(telegramId)) {
        return res.status(400).json({ error: 'Invalid Telegram ID' });
    }

    const users = getUsers();
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    users.update({
        ...user,
        demo_mode: !user.demo_mode
    });

    res.json({
        success: true,
        demo_mode: !user.demo_mode,
        message: `Demo mode ${!user.demo_mode ? 'enabled' : 'disabled'}`
    });
});

module.exports = router;