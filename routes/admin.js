const express = require('express');
const router = express.Router();
const { cryptoPayRequest } = require('../services/cryptoPay');
const { users, transactions, minesGames, logAdminAction, getCasinoBank, updateCasinoBank } = require('../config/database');
const { isAdmin } = require('../middleware/auth');

// API: Аутентификация админа
router.post('/login', async (req, res) => {
    const { telegramId, password } = req.body;

    if (password === process.env.ADMIN_PASSWORD && 
        parseInt(telegramId) === parseInt(process.env.OWNER_TELEGRAM_ID)) {
        
        logAdminAction('admin_login', telegramId);
        res.json({ success: true, isAdmin: true });
    } else {
        res.json({ success: false, isAdmin: false });
    }
});

// API: Получить данные админки
router.get('/dashboard/:telegramId', isAdmin, async (req, res) => {
    try {
        const bank = getCasinoBank();
        const totalUsers = users.count();
        const totalTransactions = transactions.count();
        const totalMinesGames = minesGames.count();

        res.json({
            bank_balance: bank.total_balance,
            total_users: totalUsers,
            total_transactions: totalTransactions,
            total_mines_games: totalMinesGames
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Вывод прибыли владельцу
router.post('/withdraw-profit', isAdmin, async (req, res) => {
    const { telegramId, amount } = req.body;

    try {
        const bank = getCasinoBank();
        
        if (bank.total_balance < amount) {
            return res.status(400).json({ error: 'Недостаточно средств в банке казино' });
        }

        const transfer = await cryptoPayRequest('transfer', {
            user_id: telegramId,
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `owner_withdraw_${Date.now()}`
        }, false);

        if (transfer.ok && transfer.result) {
            updateCasinoBank(-amount);
            
            logAdminAction('withdraw_profit', telegramId, { amount: amount });
            
            res.json({
                success: true,
                message: 'Profit withdrawn successfully',
                hash: transfer.result.hash,
                new_balance: bank.total_balance - amount
            });
        } else {
            res.status(500).json({ error: 'Withdrawal failed' });
        }
    } catch (error) {
        console.error('Withdraw profit error:', error);
        res.status(500).json({ error: 'Withdrawal error' });
    }
});

router.post('/add-demo-balance', isAdmin, async (req, res) => {
    const { telegramId, targetTelegramId, amount } = req.body;

    try {
        const targetUser = users.findOne({ telegram_id: parseInt(targetTelegramId) });
        if (!targetUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        users.update({
            ...targetUser,
            demo_balance: targetUser.demo_balance + amount
        });

        transactions.insert({
            user_id: targetUser.$loki,
            amount: amount,
            type: 'admin_demo_deposit',
            status: 'completed',
            demo_mode: true,
            created_at: new Date(),
            admin_telegram_id: telegramId
        });

        logAdminAction('add_demo_balance', telegramId, { 
            target_telegram_id: targetTelegramId, 
            amount: amount 
        });

        res.json({
            success: true,
            message: `Добавлено ${amount} тестовых TON пользователю ${targetTelegramId}`,
            new_demo_balance: targetUser.demo_balance + amount
        });
    } catch (error) {
        console.error('Add demo balance error:', error);
        res.status(500).json({ error: 'Ошибка пополнения баланса' });
    }
});

module.exports = router;