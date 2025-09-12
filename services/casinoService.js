const { getCasinoBank, getAdminLogs } = require('../config/database');

// Получить банк казино
function getCasinoBankBalance() {
    const casinoBank = getCasinoBank();
    const bank = casinoBank.findOne({});
    return bank ? bank.total_balance : 0;
}

// Обновить банк казино
function updateCasinoBank(amount) {
    const casinoBank = getCasinoBank();
    const bank = casinoBank.findOne({});
    
    if (bank) {
        casinoBank.update({
            ...bank,
            total_balance: bank.total_balance + amount,
            updated_at: new Date()
        });
    }
}

// Добавить запись в лог администратора
function addAdminLog(action, details, telegramId) {
    const adminLogs = getAdminLogs();
    adminLogs.insert({
        action,
        details,
        telegram_id: telegramId,
        created_at: new Date()
    });
}

module.exports = {
    getCasinoBankBalance,
    updateCasinoBank,
    addAdminLog
};