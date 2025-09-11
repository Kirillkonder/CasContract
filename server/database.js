const Loki = require('lokijs');
const path = require('path');

let db;
let users, transactions, casinoBank, adminLogs, minesGames;

function initDatabase() {
    return new Promise((resolve) => {
        const dbPath = process.env.NODE_ENV === 'production' ? 
            path.join('/tmp', 'ton-casino.db') : 
            'ton-casino.db';

        db = new Loki(dbPath, {
            autoload: true,
            autoloadCallback: () => {
                users = db.getCollection('users');
                transactions = db.getCollection('transactions');
                casinoBank = db.getCollection('casino_bank');
                adminLogs = db.getCollection('admin_logs');
                minesGames = db.getCollection('mines_games');
                
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
                    casinoBank.insert({
                        total_balance: 0,
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

                if (!minesGames) {
                    minesGames = db.addCollection('mines_games', {
                        indices: ['user_id', 'created_at', 'demo_mode']
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

function getCasinoBank() {
    return casinoBank.findOne({});
}

function updateCasinoBank(amount) {
    const bank = getCasinoBank();
    casinoBank.update({
        ...bank,
        total_balance: bank.total_balance + amount,
        updated_at: new Date()
    });
}

function logAdminAction(action, telegramId, details = {}) {
    adminLogs.insert({
        action: action,
        telegram_id: telegramId,
        details: details,
        created_at: new Date()
    });
}

module.exports = {
    initDatabase,
    getCasinoBank,
    updateCasinoBank,
    logAdminAction,
    getUsers: () => users,
    getTransactions: () => transactions,
    getAdminLogs: () => adminLogs,
    getMinesGames: () => minesGames
};