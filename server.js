
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

// Для Render сохраняем базу данных в памяти
const dbPath = process.env.NODE_ENV === 'production' ? 
    path.join('/tmp', 'ton-casino.db') : 
    'ton-casino.db';

// LokiJS база данных
let db;
let users, transactions, casinoBank, adminLogs;

function initDatabase() {
    return new Promise((resolve) => {
        db = new Loki(dbPath, {
            autoload: true,
            autoloadCallback: () => {
                users = db.getCollection('users');
                transactions = db.getCollection('transactions');
                casinoBank = db.getCollection('casino_bank');
                adminLogs = db.getCollection('admin_logs');
                
                if (!users) {
                    users = db.addCollection('users', { 
                        unique: ['telegram_id'],
                        indices: ['telegram_id']
                    });
                }
                
                if (!transactions) {
                    transactions = db.addCollection('transactions', {
                        indices: ['user_id', 'created_at', 'demo_mode']
                    });
                }

                if (!casinoBank) {
                    casinoBank = db.addCollection('casino_bank');
                    // Инициализируем банк казино
                    casinoBank.insert({
                        total_balance: 10000,
                        owner_telegram_id: process.env.OWNER_TELEGRAM_ID || 842428912,
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                }

                if (!adminLogs) {
                    adminLogs = db.addCollection('admin_logs', {
                        indices: ['created_at']
                    });
                }
                
                console.log('LokiJS database initialized');
                resolve(true);
            },
            autosave: true,
            autosaveInterval: 4000
        });
    });
}

// Функция для работы с Crypto Pay API
async function cryptoPayRequest(method, data = {}, demoMode = false) {
    try {
        const CRYPTO_PAY_API = demoMode ? 
            'https://testnet-pay.crypt.bot/api' : 
            'https://pay.crypt.bot/api';
            
        const CRYPTO_PAY_TOKEN = demoMode ?
            process.env.CRYPTO_PAY_TESTNET_TOKEN :
            process.env.CRYPTO_PAY_MAINNET_TOKEN;

        const response = await axios.post(`${CRYPTO_PAY_API}/${method}`, data, {
            headers: {
                'Crypto-Pay-API-Token': CRYPTO_PAY_TOKEN,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        return response.data;
    } catch (error) {
        console.error('Crypto Pay API error:', error.response?.data || error.message);
        throw error;
    }
}

// Функция логирования админских действий
function logAdminAction(action, telegramId, details = {}) {
    adminLogs.insert({
        action: action,
        telegram_id: telegramId,
        details: details,
        created_at: new Date()
    });
}

// Получить банк казино
function getCasinoBank() {
    return casinoBank.findOne({});
}

// Обновить банк казино
function updateCasinoBank(amount) {
    const bank = getCasinoBank();
    casinoBank.update({
        ...bank,
        total_balance: bank.total_balance + amount,
        updated_at: new Date()
    });
}

// API: Аутентификация админа
app.post('/api/admin/login', async (req, res) => {
    const { telegramId, password } = req.body;

    if (password === process.env.ADMIN_PASSWORD && 
        parseInt(telegramId) === parseInt(process.env.OWNER_TELEGRAM_ID)) {
        
        logAdminAction('admin_login', telegramId);
        res.json({ success: true, isAdmin: true });
    } else {
        res.json({ success: false, isAdmin: false });
    }
});

// API: Получить данные админки
app.get('/api/admin/dashboard/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const bank = getCasinoBank();
        const totalUsers = users.count();
        const totalTransactions = transactions.count();
        const recentTransactions = transactions.chain().simplesort('created_at', true).limit(10).data();

        res.json({
            bank_balance: bank.total_balance,
            total_users: totalUsers,
            total_transactions: totalTransactions,
            recent_transactions: recentTransactions
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Вывод прибыли владельцу
app.post('/api/admin/withdraw-profit', async (req, res) => {
    const { telegramId, amount } = req.body;

    if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const bank = getCasinoBank();
        
        if (bank.total_balance < amount) {
            return res.status(400).json({ error: 'Insufficient casino balance' });
        }

        // Выводим через Crypto Pay
        const transfer = await cryptoPayRequest('transfer', {
            user_id: telegramId,
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `owner_withdraw_${Date.now()}`
        }, false);

        if (transfer.ok && transfer.result) {
            updateCasinoBank(-amount);
            
            logAdminAction('withdraw_profit', telegramId, { amount: amount });
            
            res.json({
                success: true,
                message: 'Profit withdrawn successfully',
                hash: transfer.result.hash,
                new_balance: bank.total_balance - amount
            });
        } else {
            res.status(500).json({ error: 'Withdrawal failed' });
        }
    } catch (error) {
        console.error('Withdraw profit error:', error);
        res.status(500).json({ error: 'Withdrawal error' });
    }
});

// API: Получить данные пользователя
app.get('/api/user/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    try {
        let user = users.findOne({ telegram_id: telegramId });
        
        if (!user) {
            user = users.insert({
                telegram_id: telegramId,
                main_balance: 0,
                demo_balance: 1000,
                created_at: new Date(),
                demo_mode: false
            });
            
            res.json({ 
                balance: 0,
                demo_balance: 1000,
                main_balance: 0,
                demo_mode: false
            });
        } else {
            const currentBalance = user.demo_mode ? user.demo_balance : user.main_balance;
            res.json({ 
                balance: currentBalance,
                demo_balance: user.demo_balance,
                main_balance: user.main_balance,
                demo_mode: user.demo_mode
            });
        }
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// API: Переключить режим демо/реальный
app.post('/api/toggle-mode', async (req, res) => {
    const { telegramId } = req.body;

    try {
        let user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newDemoMode = !user.demo_mode;
        
        users.update({
            ...user,
            demo_mode: newDemoMode
        });

        const currentBalance = newDemoMode ? user.demo_balance : user.main_balance;

        res.json({ 
            success: true, 
            demo_mode: newDemoMode,
            balance: currentBalance,
            demo_balance: user.demo_balance,
            main_balance: user.main_balance
        });
    } catch (error) {
        console.error('Toggle mode error:', error);
        res.status(500).json({ error: 'Toggle mode error' });
    }
});

// API: Играть в казино (упрощенная рулетка)
app.post('/api/play/roulette', async (req, res) => {
    const { telegramId, betAmount, betType, demoMode } = req.body;
    
    if (!betAmount || betAmount < 1) {
        return res.status(400).json({ error: 'Minimum bet is 1 TON' });
    }

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentBalance = demoMode ? user.demo_balance : user.main_balance;
        if (currentBalance < betAmount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Генерируем случайное число (0-36)
        const result = Math.floor(Math.random() * 37);
        let win = false;
        let winAmount = 0;

        // Простая логика рулетки
        if (betType === 'red' && result !== 0 && result % 2 === 1) {
            win = true;
            winAmount = betAmount * 2; // 2x за красное
        } else if (betType === 'black' && result !== 0 && result % 2 === 0) {
            win = true;
            winAmount = betAmount * 2; // 2x за черное
        } else if (betType === 'number' && result === parseInt(req.body.number)) {
            win = true;
            winAmount = betAmount * 36; // 36x за число
        }

        if (demoMode) {
            // Демо-режим
            if (win) {
                users.update({
                    ...user,
                    demo_balance: user.demo_balance + winAmount
                });
            } else {
                users.update({
                    ...user,
                    demo_balance: user.demo_balance - betAmount
                });
            }
        } else {
            // Реальный режим
            const bank = getCasinoBank();
            
            if (win) {
                // Игрок выиграл - выплачиваем из банка казино
                if (bank.total_balance < winAmount) {
                    return res.status(400).json({ error: 'Casino insufficient funds' });
                }
                
                users.update({
                    ...user,
                    main_balance: user.main_balance + winAmount
                });
                
                updateCasinoBank(-winAmount);
            } else {
                // Игрок проиграл - деньги идут в банк казино
                users.update({
                    ...user,
                    main_balance: user.main_balance - betAmount
                });
                
                updateCasinoBank(betAmount);
            }
        }

        // Сохраняем транзакцию
        transactions.insert({
            user_id: user.$loki,
            amount: win ? winAmount : -betAmount,
            type: win ? 'win' : 'bet',
            game: 'roulette',
            result: result,
            bet_type: betType,
            status: 'completed',
            demo_mode: demoMode,
            created_at: new Date()
        });

        res.json({
            success: true,
            win: win,
            result: result,
            amount: win ? winAmount : -betAmount,
            new_balance: demoMode ? 
                (win ? user.demo_balance + winAmount : user.demo_balance - betAmount) :
                (win ? user.main_balance + winAmount : user.main_balance - betAmount)
        });

    } catch (error) {
        console.error('Roulette error:', error);
        res.status(500).json({ error: 'Game error' });
    }
});

// API: Создать депозит
app.post('/api/create-deposit', async (req, res) => {
    const { telegramId, amount, demoMode } = req.body;
    
    if (!amount || amount < 1) {
        return res.status(400).json({ error: 'Minimum deposit is 1 TON' });
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
            transactions.insert({
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
                invoiceId: invoice.result.invoice_id
            });
        } else {
            res.status(500).json({ error: 'Failed to create invoice' });
        }
    } catch (error) {
        console.error('Crypto Pay error:', error);
        res.status(500).json({ error: 'Crypto Pay error' });
    }
});

// API: Запрос на вывод
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, address, demoMode } = req.body;

    if (!amount || amount < 1 || !address) {
        return res.status(400).json({ error: 'Invalid amount or address' });
    }

    if (!address.startsWith('UQ') || address.length < 48) {
        return res.status(400).json({ error: 'Invalid TON address format' });
    }

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        const currentBalance = demoMode ? user.demo_balance : user.main_balance;
        if (currentBalance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        if (demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance - amount
            });

            transactions.insert({
                user_id: user.$loki,
                amount: amount,
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

        // В реальном режиме проверяем банк казино
        const bank = getCasinoBank();
        if (bank.total_balance < amount) {
            return res.status(400).json({ error: 'Casino insufficient funds' });
        }

        const transfer = await cryptoPayRequest('transfer', {
            user_id: parseInt(telegramId),
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `withdraw_${telegramId}_${Date.now()}`
        }, false);

        if (transfer.ok && transfer.result) {
            users.update({
                ...user,
                main_balance: user.main_balance - amount
            });

            updateCasinoBank(-amount);

            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'withdraw',
                status: 'completed',
                demo_mode: false,
                address: address,
                hash: transfer.result.hash,
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
            res.status(500).json({ error: 'Withdrawal failed' });
        }
    } catch (error) {
        console.error('Crypto Pay error:', error);
        res.status(500).json({ error: 'Crypto Pay error' });
    }
});

// Остальные API остаются без изменений...

// Health check для Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Инициализация и запуск сервера
async function startServer() {
    try {
        await initDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🏦 Casino bank initialized`);
            console.log(`👑 Owner ID: ${process.env.OWNER_TELEGRAM_ID}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();