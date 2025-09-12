const express = require('express');
const router = express.Router();
const { getUsers, getTransactions, getCasinoBank, getAdminLogs } = require('../config/database');
const { getCasinoBankBalance, updateCasinoBank, addAdminLog } = require('../services/casinoService');
const { validateTelegramId } = require('../utils/helpers');

// Получить статистику казино
router.get('/stats', (req, res) => {
    const users = getUsers();
    const transactions = getTransactions();
    const adminLogs = getAdminLogs();

    const totalUsers = users.count();
    const totalTransactions = transactions.count();
    const totalDeposits = transactions.find({ type: 'deposit' }).reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = transactions.find({ type: 'withdrawal' }).reduce((sum, t) => sum + t.amount, 0);
    const casinoBalance = getCasinoBankBalance();

    res.json({
        totalUsers,
        totalTransactions,
        totalDeposits,
        totalWithdrawals,
        casinoBalance,
        recentLogs: adminLogs.chain().simplesort('created_at', true).limit(10).data()
    });
});

// Управление пользователями
router.get('/users', (req, res) => {
    const users = getUsers();
    res.json(users.data());
});

// Изменить баланс пользователя
router.post('/user/balance', (req, res) => {
    const { telegramId, amount, isDemo } = req.body;
    
    if (!validateTelegramId(telegramId)) {
        return res.status(400).json({ error: 'Invalid Telegram ID' });
    }

    const users = getUsers();
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const balanceField = isDemo ? 'demo_balance' : 'main_balance';
    const oldBalance = user[balanceField];
    const newBalance = oldBalance + parseFloat(amount);

    if (newBalance < 0) {
        return res.status(400).json({ error: 'Balance cannot be negative' });
    }

    users.update({
        ...user,
        [balanceField]: newBalance
    });

    // Обновляем банк казино если это реальный баланс
    if (!isDemo) {
        updateCasinoBank(-parseFloat(amount));
    }

    addAdminLog('balance_adjustment', {
        telegramId,
        amount,
        isDemo,
        oldBalance,
        newBalance
    }, req.query.adminId);

    res.json({ 
        success: true, 
        newBalance,
        message: `Balance updated successfully`
    });
});

module.exports = router;