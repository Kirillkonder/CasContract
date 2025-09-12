const express = require('express');
const router = express.Router();
const { 
    getCollections, 
    cryptoPayRequest, 
    logAdminAction, 
    getCasinoBank, 
    updateCasinoBank 
} = require('../server');

router.post('/login', async (req, res) => {
    const { telegramId, password } = req.body;
    const { users } = getCollections();

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
    const { users, transactions, minesGames, rocketGames } = getCollections();

    if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const bank = getCasinoBank();
        const totalUsers = users.count();
        const totalTransactions = transactions.count();
        const totalMinesGames = minesGames.count();
        const totalRocketGames = rocketGames.count();

        res.json({
            bank_balance: bank.total_balance,
            total_users: totalUsers,
            total_transactions: totalTransactions,
            total_mines_games: totalMinesGames,
            total_rocket_games: totalRocketGames
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/withdraw-profit', async (req, res) => {
    const { telegramId, amount } = req.body;
    const { getCasinoBank, updateCasinoBank } = getCollections();

    if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const bank = getCasinoBank();
        
        if (bank.total_balance < amount) {
            return res.json({ success: false, error: 'Insufficient funds' });
        }

        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount,
            description: 'Casino profit withdrawal'
        }, false);

        if (invoice.ok) {
            updateCasinoBank(-amount);
            logAdminAction('profit_withdrawal', telegramId, { amount });
            res.json({ success: true, invoice_url: invoice.result.pay_url });
        } else {
            res.json({ success: false, error: invoice.error });
        }
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/users/:telegramId', async (req, res) => {
    const adminTelegramId = parseInt(req.params.telegramId);
    const { users } = getCollections();

    if (adminTelegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const allUsers = users.find();
        res.json(allUsers.map(user => ({
            telegram_id: user.telegram_id,
            main_balance: user.main_balance,
            demo_balance: user.demo_balance,
            created_at: user.created_at,
            demo_mode: user.demo_mode
        })));
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/update-balance/:telegramId', async (req, res) => {
    const adminTelegramId = parseInt(req.params.telegramId);
    const { targetTelegramId, amount, balanceType } = req.body;
    const { users, transactions, updateCasinoBank } = getCollections();

    if (adminTelegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const user = users.findOne({ telegram_id: parseInt(targetTelegramId) });
        if (!user) {
            return res.json({ success: false, error: 'User not found' });
        }

        const balanceField = balanceType === 'main' ? 'main_balance' : 'demo_balance';
        const oldBalance = user[balanceField];
        const newBalance = oldBalance + parseFloat(amount);

        users.update({
            ...user,
            [balanceField]: newBalance
        });

        if (balanceType === 'main') {
            updateCasinoBank(parseFloat(amount));
        }

        transactions.insert({
            user_id: user.$loki,
            amount: parseFloat(amount),
            type: 'admin_adjustment',
            status: 'completed',
            demo_mode: balanceType === 'demo',
            created_at: new Date()
        });

        logAdminAction('balance_update', adminTelegramId, { 
            target: targetTelegramId, 
            amount, 
            balanceType 
        });

        res.json({ success: true, new_balance: newBalance });
    } catch (error) {
        console.error('Update balance error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;