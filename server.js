require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// Crypto Pay API
const CRYPTO_PAY_API = 'https://pay.crypt.bot/api';
const CRYPTO_PAY_TOKEN = process.env.CRYPTO_PAY_TOKEN;

// База данных
const db = new sqlite3.Database('ton-casino.db');

// Создаем таблицы
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER UNIQUE,
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount REAL,
        type TEXT,
        status TEXT,
        hash TEXT,
        crypto_pay_invoice_id TEXT,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS crypto_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id TEXT UNIQUE,
        user_id INTEGER,
        amount REAL,
        status TEXT,
        hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

// Функция для работы с Crypto Pay API
async function cryptoPayRequest(method, data = {}) {
    try {
        const response = await axios.post(`${CRYPTO_PAY_API}/${method}`, data, {
            headers: {
                'Crypto-Pay-API-Token': CRYPTO_PAY_TOKEN
            }
        });
        return response.data;
    } catch (error) {
        console.error('Crypto Pay API error:', error.response?.data || error.message);
        throw error;
    }
}

// API: Получить данные пользователя
app.get('/api/user/:telegramId', async (req, res) => {
    const telegramId = req.params.telegramId;

    db.get(
        `SELECT * FROM users WHERE telegram_id = ?`,
        [telegramId],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!user) {
                // Создаем нового пользователя если не существует
                db.run(
                    `INSERT INTO users (telegram_id, balance) VALUES (?, 0)`,
                    [telegramId],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: 'Failed to create user' });
                        }
                        res.json({ 
                            balance: 0
                        });
                    }
                );
            } else {
                res.json({ 
                    balance: user.balance
                });
            }
        }
    );
});

// API: Создать депозит через Crypto Pay
app.post('/api/create-deposit', async (req, res) => {
    const { telegramId, amount } = req.body;
    
    if (!amount || amount < 1) {
        return res.status(400).json({ error: 'Minimum deposit is 1 TON' });
    }

    try {
        // Создаем инвойс в Crypto Pay
        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId}`,
            paid_btn_name: 'viewItem',
            paid_btn_url: `https://t.me/${process.env.BOT_USERNAME}`, // Замените на username вашего бота
            payload: `deposit_${telegramId}`
        });

        if (invoice.ok && invoice.result) {
            // Сохраняем транзакцию в БД
            db.run(
                `INSERT INTO transactions (user_id, amount, type, status, crypto_pay_invoice_id) 
                 VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, 'deposit', 'pending', ?)`,
                [telegramId, amount, invoice.result.invoice_id],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }

                    res.json({
                        success: true,
                        invoiceUrl: invoice.result.pay_url,
                        invoiceId: invoice.result.invoice_id
                    });
                }
            );
        } else {
            res.status(500).json({ error: 'Failed to create invoice' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Crypto Pay error' });
    }
});

// API: Запрос на вывод
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, address } = req.body;

    if (!amount || amount < 1 || !address) {
        return res.status(400).json({ error: 'Invalid amount or address' });
    }

    // Проверяем баланс
    db.get(
        `SELECT balance FROM users WHERE telegram_id = ?`,
        [telegramId],
        async (err, user) => {
            if (err || !user || user.balance < amount) {
                return res.status(400).json({ error: 'Insufficient balance' });
            }

            try {
                // Создаем вывод через Crypto Pay
                const transfer = await cryptoPayRequest('transfer', {
                    user_id: parseInt(telegramId),
                    asset: 'TON',
                    amount: amount.toString(),
                    spend_id: `withdraw_${telegramId}_${Date.now()}`
                });

                if (transfer.ok && transfer.result) {
                    // Обновляем баланс
                    db.run(
                        `UPDATE users SET balance = balance - ? WHERE telegram_id = ?`,
                        [amount, telegramId],
                        function(err) {
                            if (err) {
                                return res.status(500).json({ error: 'Database error' });
                            }

                            // Создаем транзакцию на вывод
                            db.run(
                                `INSERT INTO transactions (user_id, amount, type, status, address, hash) 
                                 VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, 'withdraw', 'completed', ?, ?)`,
                                [telegramId, amount, address, transfer.result.hash],
                                function(err) {
                                    if (err) {
                                        return res.status(500).json({ error: 'Database error' });
                                    }

                                    res.json({
                                        success: true,
                                        message: 'Withdrawal successful',
                                        hash: transfer.result.hash
                                    });
                                }
                            );
                        }
                    );
                } else {
                    res.status(500).json({ error: 'Withdrawal failed' });
                }
            } catch (error) {
                res.status(500).json({ error: 'Crypto Pay error' });
            }
        }
    );
});

// API: Получить историю транзакций
app.get('/api/transactions/:telegramId', async (req, res) => {
    const telegramId = req.params.telegramId;

    db.all(
        `SELECT * FROM transactions 
         WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
         ORDER BY created_at DESC LIMIT 10`,
        [telegramId],
        (err, transactions) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ transactions: transactions || [] });
        }
    );
});

// API: Проверить статус инвойса
app.get('/api/invoice-status/:invoiceId', async (req, res) => {
    const invoiceId = req.params.invoiceId;

    try {
        const invoices = await cryptoPayRequest('getInvoices', {
            invoice_ids: invoiceId
        });

        if (invoices.ok && invoices.result.items.length > 0) {
            const invoice = invoices.result.items[0];
            res.json({ status: invoice.status });
        } else {
            res.status(404).json({ error: 'Invoice not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Crypto Pay error' });
    }
});

// Проверка оплаченных инвойсов (каждую минуту)
cron.schedule('* * * * *', async () => {
    try {
        // Получаем pending инвойсы
        db.all(
            `SELECT * FROM transactions 
             WHERE type = 'deposit' AND status = 'pending' AND crypto_pay_invoice_id IS NOT NULL`,
            async (err, transactions) => {
                if (err) return;

                for (const transaction of transactions) {
                    try {
                        const invoices = await cryptoPayRequest('getInvoices', {
                            invoice_ids: transaction.crypto_pay_invoice_id
                        });

                        if (invoices.ok && invoices.result.items.length > 0) {
                            const invoice = invoices.result.items[0];
                            
                            if (invoice.status === 'paid') {
                                // Обновляем баланс и статус транзакции
                                db.run(
                                    `UPDATE users SET balance = balance + ? WHERE id = ?`,
                                    [transaction.amount, transaction.user_id]
                                );

                                db.run(
                                    `UPDATE transactions SET status = 'completed', hash = ? WHERE id = ?`,
                                    [invoice.hash, transaction.id]
                                );

                                console.log(`Deposit completed for transaction ${transaction.id}`);
                            }
                        }
                    } catch (error) {
                        console.error('Error checking invoice:', error);
                    }
                }
            }
        );
    } catch (error) {
        console.error('Cron job error:', error);
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`💳 Crypto Pay integration enabled`);
});