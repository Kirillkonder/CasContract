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

// Конфигурация сетей
const NETWORKS = {
    testnet: {
        apiUrl: 'https://testnet-pay.crypt.bot/api',
        name: 'TON Testnet',
        minDeposit: 0.01,
        minWithdraw: 0.01
    },
    mainnet: {
        apiUrl: 'https://pay.crypt.bot/api',
        name: 'TON Mainnet',
        minDeposit: 0.1,
        minWithdraw: 0.1
    }
};

// Текущая сеть (по умолчанию из .env)
let currentNetwork = process.env.DEFAULT_NETWORK || 'testnet';
let CRYPTO_PAY_TOKEN = process.env.CRYPTO_PAY_TOKEN;

// LokiJS база данных
let db;
let users, transactions, settings;

function initDatabase() {
    return new Promise((resolve) => {
        db = new Loki('ton-casino.db', {
            autoload: true,
            autoloadCallback: () => {
                users = db.getCollection('users');
                transactions = db.getCollection('transactions');
                settings = db.getCollection('settings');
                
                if (!users) {
                    users = db.addCollection('users', { 
                        unique: ['telegram_id'],
                        indices: ['telegram_id']
                    });
                }
                
                if (!transactions) {
                    transactions = db.addCollection('transactions', {
                        indices: ['user_id', 'created_at', 'network']
                    });
                }

                if (!settings) {
                    settings = db.addCollection('settings');
                    // Сохраняем настройки по умолчанию
                    settings.insert({
                        key: 'network',
                        value: currentNetwork,
                        updated_at: new Date()
                    });
                } else {
                    // Загружаем сохраненную сеть
                    const networkSetting = settings.findOne({ key: 'network' });
                    if (networkSetting) {
                        currentNetwork = networkSetting.value;
                    }
                }
                
                console.log(`✅ Database initialized. Current network: ${currentNetwork}`);
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
        const networkConfig = NETWORKS[currentNetwork];
        const response = await axios.post(`${networkConfig.apiUrl}/${method}`, data, {
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
            user = users.insert({
                telegram_id: telegramId,
                balance: 0,
                created_at: new Date()
            });
        }

        res.json({ 
            balance: user.balance,
            network: currentNetwork,
            networkName: NETWORKS[currentNetwork].name,
            minDeposit: NETWORKS[currentNetwork].minDeposit
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// API: Создать депозит
app.post('/api/create-deposit', async (req, res) => {
    const { telegramId, amount } = req.body;
    const networkConfig = NETWORKS[currentNetwork];
    
    if (!amount || amount < networkConfig.minDeposit) {
        return res.status(400).json({ 
            error: `Minimum deposit is ${networkConfig.minDeposit} TON (${networkConfig.name})`
        });
    }

    try {
        // В testnet режиме имитируем успешный депозит
        if (currentNetwork === 'testnet') {
            let user = users.findOne({ telegram_id: parseInt(telegramId) });
            if (!user) {
                user = users.insert({
                    telegram_id: parseInt(telegramId),
                    balance: 0,
                    created_at: new Date()
                });
            }

            users.update({ ...user, balance: user.balance + amount });

            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'completed',
                network: 'testnet',
                hash: `testnet_deposit_${Date.now()}`,
                created_at: new Date()
            });

            return res.json({
                success: true,
                message: 'Test deposit successful (TESTNET MODE)',
                amount: amount,
                network: 'TESTNET'
            });
        }

        // Реальный депозит для mainnet
        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId}`,
            paid_btn_name: 'viewItem',
            paid_btn_url: `https://t.me/${process.env.BOT_USERNAME}`,
            payload: `deposit_${telegramId}_${Date.now()}`
        });

        if (invoice.ok && invoice.result) {
            let user = users.findOne({ telegram_id: parseInt(telegramId) });
            if (!user) {
                user = users.insert({
                    telegram_id: parseInt(telegramId),
                    balance: 0,
                    created_at: new Date()
                });
            }

            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'pending',
                crypto_pay_invoice_id: invoice.result.invoice_id,
                network: 'mainnet',
                created_at: new Date()
            });

            res.json({
                success: true,
                invoiceUrl: invoice.result.pay_url,
                invoiceId: invoice.result.invoice_id,
                network: 'MAINNET'
            });
        } else {
            res.status(500).json({ error: 'Failed to create invoice' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Запрос на вывод
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, address } = req.body;
    const networkConfig = NETWORKS[currentNetwork];

    if (!amount || amount < networkConfig.minWithdraw || !address) {
        return res.status(400).json({ 
            error: `Minimum withdrawal is ${networkConfig.minWithdraw} TON (${networkConfig.name})`
        });
    }

    if (!address.startsWith('UQ') || address.length < 48) {
        return res.status(400).json({ error: 'Invalid TON address format' });
    }

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user || user.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // В testnet режиме имитируем вывод
        if (currentNetwork === 'testnet') {
            users.update({ ...user, balance: user.balance - amount });

            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'withdraw',
                status: 'completed',
                address: address,
                hash: `testnet_withdraw_${Date.now()}`,
                network: 'testnet',
                created_at: new Date()
            });

            return res.json({
                success: true,
                message: 'Test withdrawal successful (TESTNET MODE)',
                hash: `testnet_withdraw_${Date.now()}`,
                network: 'TESTNET'
            });
        }

        // Реальный вывод для mainnet
        const transfer = await cryptoPayRequest('transfer', {
            user_id: parseInt(telegramId),
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `withdraw_${telegramId}_${Date.now()}`
        });

        if (transfer.ok && transfer.result) {
            users.update({ ...user, balance: user.balance - amount });

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
            res.status(500).json({ error: 'Withdrawal failed' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Переключение сети (админ)
app.post('/api/admin/switch-network', async (req, res) => {
    const { network, password } = req.body;
    
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!NETWORKS[network]) {
        return res.status(400).json({ error: 'Invalid network' });
    }

    // Сохраняем настройки сети
    let networkSetting = settings.findOne({ key: 'network' });
    if (networkSetting) {
        settings.update({ ...networkSetting, value: network, updated_at: new Date() });
    } else {
        settings.insert({ key: 'network', value: network, updated_at: new Date() });
    }

    currentNetwork = network;

    res.json({
        success: true,
        message: `Network switched to ${NETWORKS[network].name}`,
        network: network,
        networkName: NETWORKS[network].name
    });
});

// API: Получить текущую сеть
app.get('/api/network', (req, res) => {
    res.json({
        network: currentNetwork,
        networkName: NETWORKS[currentNetwork].name,
        minDeposit: NETWORKS[currentNetwork].minDeposit,
        minWithdraw: NETWORKS[currentNetwork].minWithdraw
    });
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
            network: currentNetwork
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        network: currentNetwork,
        networkName: NETWORKS[currentNetwork].name,
        timestamp: new Date().toISOString()
    });
});

// Запуск сервера
async function startServer() {
    try {
        await initDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🌐 Current network: ${NETWORKS[currentNetwork].name}`);
            console.log(`💳 Crypto Pay: ${NETWORKS[currentNetwork].apiUrl}`);
            console.log(`🔧 Admin password: ${process.env.ADMIN_PASSWORD ? 'SET' : 'NOT SET'}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();