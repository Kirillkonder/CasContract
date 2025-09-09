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

// Режим работы: testnet или mainnet
const IS_TESTNET = process.env.TESTNET_MODE === 'true';

// Crypto Pay API endpoints
const CRYPTO_PAY_API = IS_TESTNET 
    ? 'https://testnet-pay.crypt.bot/api'
    : 'https://pay.crypt.bot/api';

const CRYPTO_PAY_TOKEN = IS_TESTNET
    ? process.env.CRYPTO_PAY_TESTNET_TOKEN
    : process.env.CRYPTO_PAY_MAINNET_TOKEN;

// LokiJS база данных
let db;
let users, transactions;

function initDatabase() {
    return new Promise((resolve) => {
        const dbName = IS_TESTNET ? 'ton-casino-testnet.db' : 'ton-casino.db';
        
        db = new Loki(dbName, {
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
                
                console.log(`LokiJS database initialized in ${IS_TESTNET ? 'TESTNET' : 'MAINNET'} mode`);
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
                balance: 0,
                created_at: new Date()
            });
            
            res.json({ 
                balance: 0,
                network: IS_TESTNET ? 'TESTNET' : 'MAINNET'
            });
        } else {
            res.json({ 
                balance: user.balance,
                network: IS_TESTNET ? 'TESTNET' : 'MAINNET'
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
    
    const minAmount = IS_TESTNET ? 0.01 : 0.1;
    
    if (!amount || amount < minAmount) {
        return res.status(400).json({ 
            error: `Minimum deposit is ${minAmount} TON ${IS_TESTNET ? '(TESTNET)' : ''}`
        });
    }

    try {
        // Создаем инвойс в Crypto Pay
        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId} ${IS_TESTNET ? '(TESTNET)' : ''}`,
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
                    created_at: new Date()
                });
            }

            // Сохраняем транзакцию
            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'pending',
                crypto_pay_invoice_id: invoice.result.invoice_id,
                network: IS_TESTNET ? 'testnet' : 'mainnet',
                created_at: new Date()
            });

            res.json({
                success: true,
                invoiceUrl: invoice.result.pay_url,
                invoiceId: invoice.result.invoice_id,
                network: IS_TESTNET ? 'TESTNET' : 'MAINNET'
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

    const minAmount = IS_TESTNET ? 0.01 : 0.1;
    
    if (!amount || amount < minAmount || !address) {
        return res.status(400).json({ 
            error: `Invalid amount (min ${minAmount} TON) or address ${IS_TESTNET ? '(TESTNET)' : ''}`
        });
    }

    if (!address.startsWith('UQ') || address.length < 48) {
        return res.status(400).json({ error: 'Invalid TON address format' });
    }

    try {
        // Находим пользователя
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user || user.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // В testnet режиме имитируем вывод
        if (IS_TESTNET) {
            // Имитация успешного вывода в testnet
            users.update({
                ...user,
                balance: user.balance - amount
            });

            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'withdraw',
                status: 'completed',
                address: address,
                hash: `testnet_tx_${Date.now()}`,
                network: 'testnet',
                created_at: new Date()
            });

            return res.json({
                success: true,
                message: 'Test withdrawal successful (TESTNET MODE)',
                hash: `testnet_tx_${Date.now()}`,
                network: 'TESTNET'
            });
        }

        // Реальный вывод в mainnet
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
                balance: user.balance - amount
            });

            // Сохраняем транзакцию
            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'withdraw',
                status: 'completed',
                address: address,
                hash: transfer.result.hash,
                network: 'mainnet',
                created_at: new Date()
            });

            res.json({
                success: true,
                message: 'Withdrawal successful',
                hash: transfer.result.hash,
                network: 'MAINNET'
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

        res.json({ 
            transactions: userTransactions,
            network: IS_TESTNET ? 'TESTNET' : 'MAINNET'
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// API: Переключение режима (только для админа)
app.post('/api/admin/toggle-mode', async (req, res) => {
    const { password } = req.body;
    
    if (password === process.env.ADMIN_PASSWORD) {
        // Здесь можно добавить логику переключения режимов
        // Пока просто возвращаем текущий статус
        res.json({
            success: true,
            currentMode: IS_TESTNET ? 'TESTNET' : 'MAINNET',
            message: 'Server restart required to change mode'
        });
    } else {
        res.status(401).json({ error: 'Unauthorized' });
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
            res.json({ 
                status: invoice.status,
                network: IS_TESTNET ? 'TESTNET' : 'MAINNET'
            });
        } else {
            res.status(404).json({ error: 'Invoice not found' });
        }
    } catch (error) {
        console.error('Crypto Pay error:', error);
        res.status(500).json({ error: 'Crypto Pay error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        network: IS_TESTNET ? 'TESTNET' : 'MAINNET',
        version: '2.0'
    });
});

// Проверка оплаченных инвойсов (каждую минуту)
cron.schedule('* * * * *', async () => {
    try {
        const pendingTransactions = transactions
            .chain()
            .find({ 
                type: 'deposit', 
                status: 'pending',
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
                                balance: user.balance + transaction.amount
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
            console.log(`💳 Crypto Pay integration: ${IS_TESTNET ? 'TESTNET' : 'MAINNET'}`);
            console.log(`🌐 Server is ready for Telegram Mini Apps`);
            console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();