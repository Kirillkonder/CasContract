const express = require('express');
const router = express.Router();
const { getCollections, cryptoPayRequest } = require('../utils/db');

router.post('/create-invoice', async (req, res) => {
    const { telegramId, amount, demoMode } = req.body;
    const { users, transactions } = getCollections();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (demoMode) {
            // Для демо-режима сразу начисляем баланс
            users.update({
                ...user,
                demo_balance: user.demo_balance + amount
            });
            
            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'completed',
                demo_mode: true,
                created_at: new Date()
            });
            
            return res.json({
                success: true,
                demo_mode: true,
                message: 'Demo deposit successful'
            });
        }

        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount,
            description: 'Casino deposit'
        }, demoMode);

        if (invoice.ok) {
            const transaction = transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'pending',
                demo_mode: demoMode,
                invoice_id: invoice.result.invoice_id,
                created_at: new Date()
            });

            res.json({
                success: true,
                invoice_url: invoice.result.pay_url,
                invoice_id: invoice.result.invoice_id
            });
        } else {
            res.json({ success: false, error: invoice.error });
        }
    } catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/withdraw', async (req, res) => {
    const { telegramId, amount, address, demoMode } = req.body;
    const { users, transactions, updateCasinoBank } = getCollections();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (demoMode) {
            return res.json({ success: false, error: 'Cannot withdraw in demo mode' });
        }

        if (user.main_balance < amount) {
            return res.json({ success: false, error: 'Insufficient balance' });
        }

        const transfer = await cryptoPayRequest('transfer', {
            asset: 'TON',
            amount: amount,
            spend_id: `withdraw_${telegramId}_${Date.now()}`,
            comment: 'Casino withdrawal',
            user_id: telegramId
        }, demoMode);

        if (transfer.ok) {
            // Обновляем баланс пользователя
            users.update({
                ...user,
                main_balance: user.main_balance - amount
            });

            updateCasinoBank(-amount);

            // Создаем транзакцию
            transactions.insert({
                user_id: user.$loki,
                amount: -amount,
                type: 'withdrawal',
                status: 'completed',
                demo_mode: demoMode,
                address: address,
                created_at: new Date()
            });

            res.json({ success: true });
        } else {
            res.json({ success: false, error: transfer.error });
        }
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;