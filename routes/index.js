const express = require('express');
const router = express.Router();

// Подключаем все роуты
router.use('/admin', require('./admin'));
router.use('/user', require('./user'));
router.use('/mines', require('./mines'));
router.use('/rocket', require('./rocket'));
router.use('/payment', require('./payment'));

// Дополнительные API endpoints из старого test.js
const { getCollections, cryptoPayRequest, updateCasinoBank } = require('../utils/db');

// API: Создать инвойс для депозита
router.post('/create-invoice', async (req, res) => {
    const { telegramId, amount, demoMode } = req.body;
    const { users, transactions } = getCollections();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId}`,
            hidden_message: `Deposit ${amount} TON`,
            payload: JSON.stringify({
                telegram_id: telegramId,
                demo_mode: demoMode,
                amount: amount
            }),
            paid_btn_name: 'callback',
            paid_btn_url: 'https://t.me/your_bot',
            allow_comments: false
        }, demoMode);

        if (invoice.ok && invoice.result) {
            // Сохраняем транзакцию как ожидающую
            transactions.insert({
                user_id: user.$loki,
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
        } else {
            res.status(500).json({ error: 'Failed to create invoice' });
        }
    } catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Проверить статус инвойса
router.post('/check-invoice', async (req, res) => {
    const { invoiceId, demoMode } = req.body;
    const { transactions, users } = getCollections();

    try {
        const invoice = await cryptoPayRequest('getInvoices', {
            invoice_ids: invoiceId
        }, demoMode);

        if (invoice.ok && invoice.result.items.length > 0) {
            const invoiceData = invoice.result.items[0];
            
            if (invoiceData.status === 'paid') {
                // Находим транзакцию и обновляем баланс
                const transaction = transactions.findOne({ invoice_id: invoiceId });
                
                if (transaction && transaction.status === 'pending') {
                    const user = users.get(transaction.user_id);
                    
                    if (demoMode) {
                        users.update({
                            ...user,
                            demo_balance: user.demo_balance + transaction.amount
                        });
                    } else {
                        users.update({
                            ...user,
                            main_balance: user.main_balance + transaction.amount
                        });
                        updateCasinoBank(transaction.amount);
                    }

                    // Обновляем статус транзакции
                    transactions.update({
                        ...transaction,
                        status: 'completed',
                        updated_at: new Date()
                    });

                    res.json({ 
                        success: true, 
                        status: 'paid',
                        amount: transaction.amount
                    });
                } else {
                    res.json({ success: false, status: 'not_found' });
                }
            } else {
                res.json({ success: true, status: invoiceData.status });
            }
        } else {
            res.json({ success: false, status: 'not_found' });
        }
    } catch (error) {
        console.error('Check invoice error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;