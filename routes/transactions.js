const express = require('express');
const router = express.Router();
const { cryptoPayRequest } = require('../services/cryptoPay');
const { users, transactions, getCasinoBank, updateCasinoBank } = require('../config/database');

// API: Получить историю транзакций
router.get('/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    try {
        const user = users.findOne({ telegram_id: telegramId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userTransactions = transactions.chain()
            .find({ user_id: user.$loki })
            .simplesort('created_at', true)
            .data();

        res.json({
            success: true,
            transactions: userTransactions
        });
    } catch (error) {
        console.error('Transactions error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Создать депозит
router.post('/create-deposit', async (req, res) => {
    const { telegramId, amount, demoMode } = req.body;
    
    if (!amount || amount < 1) {
        return res.status(400).json({ error: 'Минимальный депозит: 1 TON' });
    }

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + amount
            });

            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'demo_deposit',
                status: 'completed',
                demo_mode: true,
                created_at: new Date()
            });

            return res.json({
                success: true,
                invoice_url: null,
                demo_mode: true,
                new_balance: user.demo_balance + amount
            });
        }

        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId}`,
            hidden_message: '💰 Casino Deposit',
            payload: `deposit_${telegramId}_${Date.now()}`,
            allow_comments: false,
            allow_anonymous: false,
            expires_in: 3600
        }, false);

        if (invoice.ok && invoice.result) {
            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'pending',
                invoice_id: invoice.result.invoice_id,
                payload: invoice.result.payload,
                demo_mode: false,
                created_at: new Date()
            });

            res.json({
                success: true,
                invoice_url: invoice.result.pay_url,
                demo_mode: false
            });
        } else {
            res.status(500).json({ error: 'Failed to create invoice' });
        }
    } catch (error) {
        console.error('Create deposit error:', error);
        res.status(500).json({ error: 'Payment system error' });
    }
});

// API: Проверить статус депозита
router.post('/check-deposit', async (req, res) => {
    const { telegramId, invoiceId } = req.body;

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const transaction = transactions.findOne({ 
            invoice_id: invoiceId,
            user_id: user.$loki
        });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        if (transaction.status === 'completed') {
            return res.json({
                success: true,
                status: 'completed',
                amount: transaction.amount
            });
        }

        const invoiceStatus = await cryptoPayRequest('getInvoices', {
            invoice_ids: invoiceId
        }, false);

        if (invoiceStatus.ok && invoiceStatus.result.items.length > 0) {
            const invoice = invoiceStatus.result.items[0];
            
            if (invoice.status === 'paid') {
                // Обновляем баланс пользователя
                users.update({
                    ...user,
                    main_balance: user.main_balance + parseFloat(invoice.amount)
                });

                // Обновляем статус транзакции
                transactions.update({
                    ...transaction,
                    status: 'completed',
                    paid_at: new Date()
                });

                res.json({
                    success: true,
                    status: 'completed',
                    amount: invoice.amount
                });
            } else {
                res.json({
                    success: true,
                    status: invoice.status,
                    amount: transaction.amount
                });
            }
        } else {
            res.status(500).json({ error: 'Failed to check invoice status' });
        }
    } catch (error) {
        console.error('Check deposit error:', error);
        res.status(500).json({ error: 'Payment system error' });
    }
});

// API: Создать вывод средств
router.post('/create-withdrawal', async (req, res) => {
    const { telegramId, amount, address, demoMode } = req.body;

    if (!amount || amount < 5) {
        return res.status(400).json({ error: 'Минимальный вывод: 5 TON' });
    }

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentBalance = demoMode ? user.demo_balance : user.main_balance;
        
        if (currentBalance < amount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        if (demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance - amount
            });

            transactions.insert({
                user_id: user.$loki,
                amount: -amount,
                type: 'demo_withdrawal',
                status: 'completed',
                demo_mode: true,
                address: address,
                created_at: new Date()
            });

            return res.json({
                success: true,
                demo_mode: true,
                new_balance: user.demo_balance - amount
            });
        }

        // Для реального вывода проверяем адрес
        if (!address || !address.startsWith('UQ') && !address.startsWith('EQ')) {
            return res.status(400).json({ error: 'Неверный адрес TON' });
        }

        // Проверяем комиссию 5%
        const casinoFee = amount * 0.05;
        const userAmount = amount - casinoFee;

        // Обновляем банк казино
        updateCasinoBank(casinoFee);

        // Создаем вывод через Crypto Pay
        const transfer = await cryptoPayRequest('transfer', {
            user_id: telegramId,
            asset: 'TON',
            amount: userAmount.toString(),
            spend_id: `withdrawal_${telegramId}_${Date.now()}`
        }, false);

        if (transfer.ok && transfer.result) {
            // Обновляем баланс пользователя
            users.update({
                ...user,
                main_balance: user.main_balance - amount
            });

            transactions.insert({
                user_id: user.$loki,
                amount: -amount,
                type: 'withdrawal',
                status: 'completed',
                demo_mode: false,
                address: address,
                casino_fee: casinoFee,
                user_received: userAmount,
                transfer_hash: transfer.result.hash,
                created_at: new Date()
            });

            res.json({
                success: true,
                demo_mode: false,
                transfer_hash: transfer.result.hash,
                amount_received: userAmount,
                casino_fee: casinoFee,
                new_balance: user.main_balance - amount
            });
        } else {
            res.status(500).json({ error: 'Withdrawal failed' });
        }
    } catch (error) {
        console.error('Create withdrawal error:', error);
        res.status(500).json({ error: 'Payment system error' });
    }
});

module.exports = router;