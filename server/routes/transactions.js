const express = require('express');
const router = express.Router();
const { cryptoPayRequest } = require('../cryptoPay');
const { getUsers, getTransactions, getCasinoBank, updateCasinoBank } = require('../database');

router.post('/create-deposit', async (req, res) => {
    const { telegramId, amount, demoMode } = req.body;
    
    if (!amount || amount < 1) {
        return res.status(400).json({ error: 'Минимальный депозит: 1 TON' });
    }

    try {
        const users = getUsers();
        const transactions = getTransactions();
        
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (demoMode) {
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
                demo: true,
                message: 'Demo deposit successful',
                new_balance: user.demo_balance + amount
            });
        }

        const botUsername = process.env.BOT_USERNAME.replace('@', '');
        
        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId}`,
            paid_btn_name: 'viewItem',
            paid_btn_url: `https://t.me/${botUsername}`,
            payload: `deposit_${telegramId}_${Date.now()}`
        }, false);

        if (invoice.ok && invoice.result) {
            const transaction = transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'pending',
                demo_mode: false,
                crypto_pay_invoice_id: invoice.result.invoice_id,
                created_at: new Date()
            });

            res.json({
                success: true,
                demo: false,
                invoiceUrl: invoice.result.pay_url,
                invoiceId: invoice.result.invoice_id,
                transactionId: transaction.$loki
            });
        } else {
            res.status(500).json({ error: 'Ошибка при создании инвойса' });
        }
    } catch (error) {
        console.error('Crypto Pay error:', error);
        res.status(500).json({ error: 'Ошибка Crypto Pay' });
    }
});

router.get('/invoice-status/:invoiceId', async (req, res) => {
    const invoiceId = req.params.invoiceId;

    try {
        const response = await cryptoPayRequest('getInvoices', {
            invoice_ids: invoiceId
        }, false);

        if (response.ok && response.result && response.result.items.length > 0) {
            const invoice = response.result.items[0];
            
            if (invoice.status === 'paid') {
                const transactions = getTransactions();
                const users = getUsers();
                
                const transaction = transactions.findOne({ crypto_pay_invoice_id: parseInt(invoiceId) });
                if (transaction && transaction.status === 'pending') {
                    const user = users.get(transaction.user_id);
                    users.update({
                        ...user,
                        main_balance: user.main_balance + transaction.amount
                    });
                    
                    transactions.update({
                        ...transaction,
                        status: 'completed'
                    });
                }
            }

            res.json({ status: invoice.status });
        } else {
            res.status(404).json({ error: 'Инвойс не найден' });
        }
    } catch (error) {
        console.error('Invoice status error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/withdraw', async (req, res) => {
    const { telegramId, amount, address, demoMode } = req.body;

    if (!amount || amount < 1 || !address) {
        return res.status(400).json({ error: 'Неверная сумма или адрес' });
    }

    if (address.length < 48) {
        return res.status(400).json({ error: 'Неверный формат адреса TON' });
    }

    try {
        const users = getUsers();
        const transactions = getTransactions();
        
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
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
                type: 'withdraw',
                status: 'completed',
                demo_mode: true,
                address: address,
                created_at: new Date()
            });

            return res.json({
                success: true,
                demo: true,
                message: 'Demo withdrawal successful',
                new_balance: user.demo_balance - amount
            });
        }

        const transfer = await cryptoPayRequest('transfer', {
            user_id: telegramId,
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `withdraw_${telegramId}_${Date.now()}`
        }, false);

        if (transfer.ok && transfer.result) {
            users.update({
                ...user,
                main_balance: user.main_balance - amount
            });

            transactions.insert({
                user_id: user.$loki,
                amount: -amount,
                type: 'withdraw',
                status: 'completed',
                demo_mode: false,
                address: address,
                crypto_pay_transfer_id: transfer.result.transfer_id,
                created_at: new Date()
            });

            res.json({
                success: true,
                demo: false,
                message: 'Withdrawal successful',
                hash: transfer.result.hash,
                new_balance: user.main_balance - amount
            });
        } else {
            res.status(500).json({ error: 'Ошибка при выводе средств' });
        }
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Ошибка при выводе средств' });
    }
});

router.post('/mines-win', async (req, res) => {
    const { telegramId, amount, multiplier, demoMode } = req.body;

    try {
        const users = getUsers();
        const transactions = getTransactions();
        const bank = getCasinoBank();
        
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const winAmount = amount * multiplier;
        const casinoProfit = amount * 0.01;

        if (demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + winAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: user.main_balance + winAmount
            });
            updateCasinoBank(casinoProfit);
        }

        transactions.insert({
            user_id: user.$loki,
            amount: winAmount,
            type: 'mines_win',
            status: 'completed',
            demo_mode: demoMode,
            bet_amount: amount,
            multiplier: multiplier,
            win_amount: winAmount,
            created_at: new Date()
        });

        const currentBalance = demoMode ? user.demo_balance + winAmount : user.main_balance + winAmount;

        res.json({
            success: true,
            win_amount: winAmount,
            new_balance: currentBalance,
            casino_profit: casinoProfit
        });
    } catch (error) {
        console.error('Mines win error:', error);
        res.status(500).json({ error: 'Ошибка при обработке выигрыша' });
    }
});

module.exports = router;