// Вспомогательные функции
function formatAmount(amount) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function generateRandomId() {
    return Math.random().toString(36).substr(2, 9);
}

function validateTelegramId(telegramId) {
    return /^\d+$/.test(telegramId) && telegramId.length >= 5;
}

function calculateRake(amount, percentage = 0.05) {
    return amount * percentage;
}

module.exports = {
    formatAmount,
    generateRandomId,
    validateTelegramId,
    calculateRake
};