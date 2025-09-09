
require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const Loki = require('lokijs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// Crypto Pay API - для Render используем флаг из переменных окружения
const CRYPTO_PAY_API = process.env.DEMO_MODE === 'true' ? 
    'https://testnet-pay.crypt.bot/api' : 
    'https://pay.crypt.bot/api';
    
const CRYPTO_PAY_TOKEN = process.env.DEMO_MODE === 'true' ?
    process.env.CRYPTO_PAY_TESTNET_TOKEN :
    process.env.CRYPTO_PAY_MAINNET_TOKEN;

// Для Render сохраняем базу данных в памяти (tmp файлы очищаются при перезапуске)
const dbPath = process.env.NODE_ENV === 'production' ? 
    path.join('/tmp', 'ton-casino.db') : 
    'ton-casino.db';

// LokiJS база данных
let db;
let users, transactions;

function initDatabase() {
    return new Promise((resolve) => {
        db = new Loki(dbPath, {
            autoload: true,
            autoloadCallback: () => {
                users = db.getCollection('users');
                transactions = db.getCollection('transactions');
                
                if (!users) {
                    users = db.addCollection('users', { 
                        unique: ['telegram_id'],
                        indices: ['telegram_id']
                    });
                }
                
                if (!transactions) {
                    transactions = db.addCollection('transactions', {
                        indices: ['user_id', 'created_at']
                    });
                }
                
                console.log('LokiJS database initialized');
                console.log('Demo mode:', process.env.DEMO_MODE === 'true' ? 'ENABLED' : 'DISABLED');
                console.log('Database path:', dbPath);
                resolve(true);
            },
            autosave: true,
            autosaveInterval: 4000
        });
    });
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
    const telegramId = parseInt(req.params.telegramId);

    try {
        let user = users.findOne({ telegram_id: telegramId });
        
        if (!user) {
            // Создаем нового пользователя
            user = users.insert({
                telegram_id: telegramId,
                balance: process.env.DEMO_MODE === 'true' ? 1000 : 0,
                demo_balance: process.env.DEMO_MODE === 'true' ? 1000 : 0,
                main_balance: 0,
                created_at: new Date()
            });
            
            res.json({ 
                balance: process.env.DEMO_MODE === 'true' ? 1000 : 0,
                demo_mode: process.env.DEMO_MODE === 'true',
                demo_balance: process.env.DEMO_MODE === 'true' ? 1000 : 0,
                main_balance: 0
            });
        } else {
            res.json({ 
                balance: process.env.DEMO_MODE === 'true' ? user.demo_balance : user.main_balance,
                demo_mode: process.env.DEMO_MODE === 'true',
                demo_balance: user.demo_balance,
                main_balance: user.main_balance
            });
        }
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// API: Переключить режим демо/реальный
app.post('/api/toggle-demo-mode', async (req, res) => {
    const { telegramId, demoMode } = req.body;

    try {
        let user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Для Render переключение режима делаем через переменные окружения
        // Пользовательский интерфейс будет показывать актуальный режим
        res.json({ 
            success: true, 
            demo_mode: process.env.DEMO_MODE === 'true',
            balance: process.env.DEMO_MODE === 'true' ? user.demo_balance : user.main_balance
        });
    } catch (error) {
        console.error('Toggle demo mode error:', error);
        res.status(500).json({ error: 'Toggle demo mode error' });
    }
});

// API: Создать депозит через Crypto Pay
app.post('/api/create-deposit', async (req, res) => {
    const { telegramId, amount } = req.body;
    
    if (!amount || amount < 1) {
        return res.status(400).json({ error: 'Minimum deposit is 1 TON' });
    }

    try {
        // В демо-режиме имитируем успешный депозит
        if (process.env.DEMO_MODE === 'true') {
            const user = users.findOne({ telegram_id: parseInt(telegramId) });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Обновляем демо-баланс
            users.update({
                ...user,
                demo_balance: user.demo_balance + amount
            });

            // Сохраняем транзакцию
            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'completed',
                demo: true,
                created_at: new Date()
            });

            return res.json({
                success: true,
                demo: true,
                message: 'Demo deposit successful'
            });
        }

        // Реальный режим - создаем инвойс в Crypto Pay
        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId}`,
            paid_btn_name: 'viewItem',
            paid_btn_url: `https://t.me/${process.env.BOT_USERNAME}`,
            payload: `deposit_${telegramId}_${Date.now()}`
        });

        if (invoice.ok && invoice.result) {
            // Находим пользователя
            let user = users.findOne({ telegram_id: parseInt(telegramId) });
            if (!user) {
                user = users.insert({
                    telegram_id: parseInt(telegramId),
                    balance: 0,
                    demo_balance: 0,
                    main_balance: 0,
                    created_at: new Date()
                });
            }

            // Сохраняем транзакцию
            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'pending',
                demo: false,
                crypto_pay_invoice_id: invoice.result.invoice_id,
                created_at: new Date()
            });

            res.json({
                success: true,
                demo: false,
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
        // Находим пользователя
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Проверяем баланс в зависимости от режима
        const currentBalance = process.env.DEMO_MODE === 'true' ? user.demo_balance : user.main_balance;
        if (currentBalance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // В демо-режиме имитируем вывод
        if (process.env.DEMO_MODE === 'true') {
            users.update({
                ...user,
                demo_balance: user.demo_balance - amount
            });

            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'withdraw',
                status: 'completed',
                demo: true,
                address: address,
                created_at: new Date()
            });

            return res.json({
                success: true,
                demo: true,
                message: 'Demo withdrawal successful'
            });
        }

        // Реальный режим - создаем вывод через Crypto Pay
        const transfer = await cryptoPayRequest('transfer', {
            user_id: parseInt(telegramId),
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `withdraw_${telegramId}_${Date.now()}`
        });

        if (transfer.ok && transfer.result) {
            // Обновляем баланс
            users.update({
                ...user,
                main_balance: user.main_balance - amount
            });

            // Сохраняем транзакцию
            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'withdraw',
                status: 'completed',
                demo: false,
                address: address,
                hash: transfer.result.hash,
                created_at: new Date()
            });

            res.json({
                success: true,
                demo: false,
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
    const telegramId = parseInt(req.params.telegramId);

    try {
        const user = users.findOne({ telegram_id: telegramId });
        if (!user) {
            return res.json({ transactions: [] });
        }

        const userTransactions = transactions
            .chain()
            .find({ user_id: user.$loki })
            .simplesort('created_at', true)
            .limit(10)
            .data();

        res.json({ transactions: userTransactions });
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
        const pendingTransactions = transactions
            .chain()
            .find({ 
                type: 'deposit', 
                status: 'pending',
                demo: false,
                crypto_pay_invoice_id: { '$ne': null }
            })
            .data();

        for (const transaction of pendingTransactions) {
            try {
                const invoices = await cryptoPayRequest('getInvoices', {
                    invoice_ids: transaction.crypto_pay_invoice_id
                });

                if (invoices.ok && invoices.result.items.length > 0) {
                    const invoice = invoices.result.items[0];
                    
                    if (invoice.status === 'paid') {
                        // Находим пользователя
                        const user = users.get(transaction.user_id);
                        if (user) {
                            // Обновляем баланс
                            users.update({
                                ...user,
                                main_balance: user.main_balance + transaction.amount
                            });

                            // Обновляем статус транзакции
                            transactions.update({
                                ...transaction,
                                status: 'completed',
                                hash: invoice.hash
                            });

                            console.log(`Deposit completed for transaction ${transaction.$loki}`);
                        }
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

// Health check для Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
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
        await initDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`💳 Crypto Pay integration enabled`);
            console.log(`🌐 Server is ready for Telegram Mini Apps`);
            console.log(`🔧 Demo mode: ${process.env.DEMO_MODE === 'true' ? 'ENABLED' : 'DISABLED'}`);
            console.log(`🌐 API: ${CRYPTO_PAY_API}`);
            console.log(`📊 Database: ${dbPath}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();