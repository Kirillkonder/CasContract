const express = require('express');
const router = express.Router();
const { getUsers, getTransactions } = require('../config/database');
const { cryptoPayRequest } = require('../services/cryptoPayService');
const { updateCasinoBank } = require('../services/casinoService');
const { validateTelegramId, generateRandomId } = require('../utils/helpers');

// Создать инвойс для депозита
router.post('/create-invoice', async (req, res) => {
    const { telegramId, amount, demoMode } = req.body;
    
    if (!validateTelegramId(telegramId)) {
        return res.status(400).json({ error: 'Invalid Telegram ID' });
    }

    try {
        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount,
            description: `Deposit for user ${telegramId}`,
            hidden_message: `💰 Deposit ${amount} TON`,
            payload: generateRandomId(),
            paid_btn_name: 'viewItem',
            paid_btn_url: 'https://t.me/toncasinobot',
            allow_comments: false
        }, demoMode);

        // Сохраняем транзакцию как ожидающую
        const transactions = getTransactions();
        transactions.insert({
            user_id: telegramId,
            amount: amount,
            type: 'deposit',
            status: 'pending',
            invoice_id: invoice.result.invoice_id,
            demo_mode: demoMode,
            created_at: new Date()
        });

        res.json({
            success: true,
            invoice_url: invoice.result.pay_url,
            invoice_id: invoice.result.invoice_id
        });
    } catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// Запросить вывод средств
router.post('/withdraw', async (req, res) => {
    const { telegramId, amount, walletAddress, demoMode } = req.body;
    
    if (demoMode) {
        return res.status(400).json({ error: 'Cannot withdraw in demo mode' });
    }

    if (!validateTelegramId(telegramId)) {
        return res.status(400).json({ error: 'Invalid Telegram ID' });
    }

    const users = getUsers();
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (user.main_balance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }

    try {
        // Создаем вывод через Crypto Pay
        const withdrawal = await cryptoPayRequest('createWithdrawal', {
            asset: 'TON',
            amount: amount,
            address: walletAddress,
            comment: `Withdrawal for user ${telegramId}`
        }, false);

        // Снимаем средства с баланса пользователя
        users.update({
            ...user,
            main_balance: user.main_balance - amount
        });

        // Обновляем банк казино
        updateCasinoBank(amount);

        // Сохраняем транзакцию
        const transactions = getTransactions();
        transactions.insert({
            user_id: user.$loki,
            amount: amount,
            type: 'withdrawal',
            status: 'pending',
            withdrawal_id: withdrawal.result.withdrawal_id,
            wallet_address: walletAddress,
            demo_mode: false,
            created_at: new Date()
        });

        res.json({
            success: true,
            withdrawal_id: withdrawal.result.withdrawal_id,
            new_balance: user.main_balance - amount
        });
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
});

// Проверить статус инвойса
router.get('/check-invoice/:invoiceId', async (req, res) => {
    const { invoiceId } = req.params;
    
    try {
        const invoices = await cryptoPayRequest('getInvoices', {
            invoice_ids: invoiceId
        });

        const invoice = invoices.result.items[0];
        
        if (invoice.status === 'paid') {
            // Обновляем транзакцию и баланс пользователя
            const transactions = getTransactions();
            const transaction = transactions.findOne({ invoice_id: invoiceId });
            
            if (transaction && transaction.status === 'pending') {
                const users = getUsers();
                const user = users.get(transaction.user_id);
                
                if (user) {
                    const balanceField = transaction.demo_mode ? 'demo_balance' : 'main_balance';
                    users.update({
                        ...user,
                        [balanceField]: user[balanceField] + transaction.amount
                    });

                    // Обновляем банк казино если это реальный депозит
                    if (!transaction.demo_mode) {
                        updateCasinoBank(transaction.amount);
                    }

                    transactions.update({
                        ...transaction,
                        status: 'completed',
                        updated_at: new Date()
                    });
                }
            }
        }

        res.json({
            status: invoice.status,
            paid: invoice.status === 'paid'
        });
    } catch (error) {
        console.error('Check invoice error:', error);
        res.status(500).json({ error: 'Failed to check invoice' });
    }
});

module.exports = router;