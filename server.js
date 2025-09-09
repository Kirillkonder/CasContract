require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
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
let db;

function initDatabase() {
    const dbPath = process.env.NODE_ENV === 'production' 
        ? '/app/data/ton-casino.db' 
        : path.join(__dirname, 'ton-casino.db');
    
    try {
        db = new Database(dbPath);
        
        // Создаем таблицы
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER UNIQUE,
                balance REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS transactions (
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
            );

            CREATE TABLE IF NOT EXISTS crypto_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id TEXT UNIQUE,
                user_id INTEGER,
                amount REAL,
                status TEXT,
                hash TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
        `);
        
        console.log('Database initialized successfully at:', dbPath);
        return true;
    } catch (error) {
        console.error('Database initialization error:', error);
        return false;
    }
}

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

    try {
        // Проверяем существование пользователя
        const userStmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
        let user = userStmt.get(telegramId);
        
        if (!user) {
            // Создаем нового пользователя
            const insertStmt = db.prepare('INSERT INTO users (telegram_id, balance) VALUES (?, 0)');
            const result = insertStmt.run(telegramId);
            
            res.json({ 
                balance: 0
            });
        } else {
            res.json({ 
                balance: user.balance
            });
        }
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
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
            paid_btn_url: `https://t.me/${process.env.BOT_USERNAME}`,
            payload: `deposit_${telegramId}_${Date.now()}`
        });

        if (invoice.ok && invoice.result) {
            // Сохраняем транзакцию в БД
            const insertStmt = db.prepare(`
                INSERT INTO transactions (user_id, amount, type, status, crypto_pay_invoice_id) 
                VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, 'deposit', 'pending', ?)
            `);
            
            insertStmt.run(telegramId, amount, invoice.result.invoice_id);

            res.json({
                success: true,
                invoiceUrl: invoice.result.pay_url,
                invoiceId: invoice.result.invoice_id
            });
        } else {
            console.error('Failed to create invoice:', invoice);
            res.status(500).json({ error: 'Failed to create invoice' });
        }
    } catch (error) {
        console.error('Crypto Pay error:', error);
        res.status(500).json({ error: 'Crypto Pay error' });
    }
});

// API: Запрос на вывод
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, address } = req.body;

    if (!amount || amount < 1 || !address) {
        return res.status(400).json({ error: 'Invalid amount or address' });
    }

    if (!address.startsWith('UQ') || address.length < 48) {
        return res.status(400).json({ error: 'Invalid TON address format' });
    }

    try {
        // Проверяем баланс
        const userStmt = db.prepare('SELECT id, balance FROM users WHERE telegram_id = ?');
        const user = userStmt.get(telegramId);
        
        if (!user || user.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Создаем вывод через Crypto Pay
        const transfer = await cryptoPayRequest('transfer', {
            user_id: parseInt(telegramId),
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `withdraw_${telegramId}_${Date.now()}`
        });

        if (transfer.ok && transfer.result) {
            // Обновляем баланс
            const updateStmt = db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ?');
            updateStmt.run(amount, telegramId);

            // Создаем транзакцию на вывод
            const insertStmt = db.prepare(`
                INSERT INTO transactions (user_id, amount, type, status, address, hash) 
                VALUES (?, ?, 'withdraw', 'completed', ?, ?)
            `);
            
            insertStmt.run(user.id, amount, address, transfer.result.hash);

            res.json({
                success: true,
                message: 'Withdrawal successful',
                hash: transfer.result.hash
            });
        } else {
            console.error('Withdrawal failed:', transfer);
            res.status(500).json({ error: 'Withdrawal failed' });
        }
    } catch (error) {
        console.error('Crypto Pay error:', error);
        res.status(500).json({ error: 'Crypto Pay error' });
    }
});

// API: Получить историю транзакций
app.get('/api/transactions/:telegramId', async (req, res) => {
    const telegramId = req.params.telegramId;

    try {
        const stmt = db.prepare(`
            SELECT t.* FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE u.telegram_id = ?
            ORDER BY t.created_at DESC LIMIT 10
        `);
        
        const transactions = stmt.all(telegramId);
        res.json({ transactions: transactions || [] });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
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
        console.error('Crypto Pay error:', error);
        res.status(500).json({ error: 'Crypto Pay error' });
    }
});

// Проверка оплаченных инвойсов (каждую минуту)
cron.schedule('* * * * *', async () => {
    try {
        const stmt = db.prepare(`
            SELECT t.*, u.telegram_id 
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE t.type = 'deposit' AND t.status = 'pending' AND t.crypto_pay_invoice_id IS NOT NULL
        `);
        
        const transactions = stmt.all();

        for (const transaction of transactions) {
            try {
                const invoices = await cryptoPayRequest('getInvoices', {
                    invoice_ids: transaction.crypto_pay_invoice_id
                });

                if (invoices.ok && invoices.result.items.length > 0) {
                    const invoice = invoices.result.items[0];
                    
                    if (invoice.status === 'paid') {
                        // Обновляем баланс
                        const updateBalanceStmt = db.prepare(`
                            UPDATE users SET balance = balance + ? WHERE id = ?
                        `);
                        updateBalanceStmt.run(transaction.amount, transaction.user_id);

                        // Обновляем статус транзакции
                        const updateTransactionStmt = db.prepare(`
                            UPDATE transactions SET status = 'completed', hash = ? WHERE id = ?
                        `);
                        updateTransactionStmt.run(invoice.hash, transaction.id);

                        console.log(`Deposit completed for transaction ${transaction.id}`);
                    }
                }
            } catch (error) {
                console.error('Error checking invoice:', error);
            }
        }
    } catch (error) {
        console.error('Cron job error:', error);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    if (db) {
        db.close();
        console.log('Database connection closed');
    }
    process.exit(0);
});

// Инициализация и запуск сервера
async function startServer() {
    try {
        if (!initDatabase()) {
            throw new Error('Failed to initialize database');
        }
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`💳 Crypto Pay integration enabled`);
            console.log(`🌐 Server is ready for Telegram Mini Apps`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();