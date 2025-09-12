const path = require('path');
const Loki = require('lokijs');

let db;
let users, transactions, casinoBank, adminLogs, minesGames, rocketGames, rocketBets;

// Для Render сохраняем базу данных в памяти
const dbPath = process.env.NODE_ENV === 'production' ? 
    path.join('/tmp', 'ton-casino.db') : 
    'ton-casino.db';

function initDatabase() {
    return new Promise((resolve) => {
        db = new Loki(dbPath, {
            autoload: true,
            autoloadCallback: () => {
                users = db.getCollection('users');
                transactions = db.getCollection('transactions');
                casinoBank = db.getCollection('casino_bank');
                adminLogs = db.getCollection('admin_logs');
                minesGames = db.getCollection('mines_games');
                rocketGames = db.getCollection('rocket_games');
                rocketBets = db.getCollection('rocket_bets');

                if (!users) {
                    users = db.addCollection('users', { 
                        unique: ['telegram_id'],
                        indices: ['telegram_id']
                    });
                    
                    // Создаем администратора по умолчанию
                    users.insert({
                        telegram_id: parseInt(process.env.OWNER_TELEGRAM_ID) || 842428912,
                        main_balance: 0,
                        demo_balance: 1000,
                        created_at: new Date(),
                        demo_mode: false,
                        is_admin: true
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

                if (!rocketGames) {
                    rocketGames = db.addCollection('rocket_games', {
                        indices: ['created_at', 'crashed_at']
                    });
                }

                if (!rocketBets) {
                    rocketBets = db.addCollection('rocket_bets', {
                        indices: ['game_id', 'user_id', 'created_at']
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

module.exports = {
    initDatabase,
    getDb: () => db,
    getUsers: () => users,
    getTransactions: () => transactions,
    getCasinoBank: () => casinoBank,
    getAdminLogs: () => adminLogs,
    getMinesGames: () => minesGames,
    getRocketGames: () => rocketGames,
    getRocketBets: () => rocketBets
};