const express = require('express');
const router = express.Router();
const { getUsers } = require('../config/database');

// API: Получить данные пользователя
router.get('/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    try {
        const users = getUsers();
        let user = users.findOne({ telegram_id: telegramId });
        
        if (!user) {
            user = users.insert({
                telegram_id: telegramId,
                main_balance: 0,
                demo_balance: 1000,
                created_at: new Date(),
                demo_mode: false
            });
            
            res.json({ 
                balance: 0,
                demo_balance: 1000,
                main_balance: 0,
                demo_mode: false
            });
        } else {
            const currentBalance = user.demo_mode ? user.demo_balance : user.main_balance;
            res.json({ 
                balance: currentBalance,
                demo_balance: user.demo_balance,
                main_balance: user.main_balance,
                demo_mode: user.demo_mode
            });
        }
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// API: Переключить режим демо/реальный
router.post('/toggle-mode', async (req, res) => {
    const { telegramId } = req.body;

    try {
        const users = getUsers();
        let user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newDemoMode = !user.demo_mode;
        
        users.update({
            ...user,
            demo_mode: newDemoMode
        });

        const currentBalance = newDemoMode ? user.demo_balance : user.main_balance;

        res.json({ 
            success: true, 
            demo_mode: newDemoMode,
            balance: currentBalance,
            demo_balance: user.demo_balance,
            main_balance: user.main_balance
        });
    } catch (error) {
        console.error('Toggle mode error:', error);
        res.status(500).json({ error: 'Toggle mode error' });
    }
});

module.exports = router;