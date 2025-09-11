const express = require('express');
const router = express.Router();
const { cryptoPayRequest } = require('../cryptoPay');
const { getUsers, getTransactions, getCasinoBank, updateCasinoBank, logAdminAction } = require('../database');

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

router.get('/dashboard/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const bank = getCasinoBank();
        const totalUsers = getUsers().count();
        const totalTransactions = getTransactions().count();

        res.json({
            bank_balance: bank.total_balance,
            total_users: totalUsers,
            total_transactions: totalTransactions
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/withdraw-profit', async (req, res) => {
    const { telegramId, amount } = req.body;

    if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

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

router.post('/add-demo-balance', async (req, res) => {
    const { telegramId, targetTelegramId, amount } = req.body;

    if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const users = getUsers();
        const targetUser = users.findOne({ telegram_id: parseInt(targetTelegramId) });
        if (!targetUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        users.update({
            ...targetUser,
            demo_balance: targetUser.demo_balance + amount
        });

        const transactions = getTransactions();
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