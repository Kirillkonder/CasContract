// Основная логика приложения
class CasinoApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.userBalance = 0;
        this.transactions = [];
        this.init();
    }

    init() {
        this.tg.expand();
        this.tg.ready();
        this.loadUserData();
        this.setupEventListeners();
    }

    loadUserData() {
        // Заглушка - в реальности здесь будет запрос к серверу
        this.userBalance = 100; // Начальный баланс
        this.transactions = [
            { type: 'deposit', amount: 50, date: new Date(), description: 'Бонус за регистрацию' },
            { type: 'deposit', amount: 50, date: new Date(), description: 'Первое пополнение' }
        ];
        
        this.updateUI();
    }

    updateUI() {
        // Обновляем баланс
        document.getElementById('balance').textContent = this.userBalance.toFixed(2);
        
        // Обновляем историю транзакций
        this.renderTransactions();
    }

    renderTransactions() {
        const container = document.getElementById('transactions');
        container.innerHTML = '';
        
        this.transactions.slice().reverse().forEach(transaction => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            
            const isPositive = transaction.type === 'deposit';
            const sign = isPositive ? '+' : '-';
            const amountClass = isPositive ? 'transaction-positive' : 'transaction-negative';
            
            item.innerHTML = `
                <span>${transaction.description}</span>
                <span class="transaction-amount ${amountClass}">${sign}${transaction.amount} TON</span>
            `;
            
            container.appendChild(item);
        });
    }

    processDeposit() {
        const amountInput = document.getElementById('deposit-amount');
        const amount = parseFloat(amountInput.value);
        
        if (!amount || amount <= 0) {
            alert('Пожалуйста, введите корректную сумму');
            return;
        }

        // Симуляция успешного депозита
        this.userBalance += amount;
        this.transactions.push({
            type: 'deposit',
            amount: amount,
            date: new Date(),
            description: 'Пополнение баланса'
        });
        
        this.updateUI();
        closeDepositModal();
        
        // Показываем уведомление
        this.tg.showPopup({
            title: "✅ Успешно!",
            message: `Баланс пополнен на ${amount} TON`,
            buttons: [{ type: "ok" }]
        });
    }

    setupEventListeners() {
        // Глобальные функции для вызова из HTML
        window.processDeposit = () => this.processDeposit();
        window.openDepositModal = openDepositModal;
        window.openWithdrawModal = openWithdrawModal;
        window.closeDepositModal = closeDepositModal;
    }
}

// Запуск приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new CasinoApp();
});