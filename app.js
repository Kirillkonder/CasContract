
class TonCasinoApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.userData = null;
        this.demoMode = false;
        this.init();
    }

    async init() {
        this.tg.expand();
        this.tg.ready();
        
        await this.loadUserData();
        this.setupEventListeners();
        this.loadTransactionHistory();
        this.updateModeUI();
    }

    async loadUserData() {
        try {
            const response = await fetch(`/api/user/${this.tg.initDataUnsafe.user.id}`);
            this.userData = await response.json();
            this.demoMode = this.userData.demo_mode;
            this.updateUI();
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async loadTransactionHistory() {
        try {
            const response = await fetch(`/api/transactions/${this.tg.initDataUnsafe.user.id}`);
            const data = await response.json();
            this.updateTransactionHistory(data.transactions);
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    }

    updateTransactionHistory(transactions) {
        const transactionsContainer = document.getElementById('transactions');
        if (transactionsContainer) {
            transactionsContainer.innerHTML = '';
            
            transactions.forEach(transaction => {
                const transactionElement = document.createElement('div');
                transactionElement.className = 'transaction-item';
                
                const amountClass = transaction.type === 'deposit' ? 'transaction-positive' : 'transaction-negative';
                const sign = transaction.type === 'deposit' ? '+' : '-';
                const modeBadge = transaction.demo_mode ? ' (TEST)' : ' (REAL)';
                
                transactionElement.innerHTML = `
                    <div class="transaction-info">
                        <div>${transaction.type.toUpperCase()}${modeBadge}</div>
                        <div class="transaction-date">${new Date(transaction.created_at).toLocaleDateString()}</div>
                    </div>
                    <div class="transaction-amount ${amountClass}">
                        ${sign}${transaction.amount} TON
                    </div>
                `;
                
                transactionsContainer.appendChild(transactionElement);
            });

            if (transactions.length === 0) {
                transactionsContainer.innerHTML = '<div class="no-transactions">Нет операций</div>';
            }
        }
    }

    updateUI() {
        if (this.userData) {
            const balanceElement = document.getElementById('balance');
            const modeBadgeElement = document.getElementById('mode-badge');
            const modeInfoElement = document.getElementById('mode-info');
            const modeButton = document.getElementById('mode-button');
            const depositModeInfo = document.getElementById('deposit-mode-info');
            const withdrawModeInfo = document.getElementById('withdraw-mode-info');
            
            if (balanceElement) {
                balanceElement.textContent = this.userData.balance.toFixed(2);
            }
            
            if (modeBadgeElement) {
                modeBadgeElement.textContent = this.demoMode ? 'TESTNET' : 'MAINNET';
                modeBadgeElement.className = this.demoMode ? 'mode-badge testnet' : 'mode-badge mainnet';
            }
            
            if (modeInfoElement) {
                modeInfoElement.textContent = this.demoMode ? 
                    '🔧 Тестовый режим - виртуальные TON' : 
                    '🌐 Реальный режим - настоящие TON';
            }
            
            if (modeButton) {
                modeButton.textContent = this.demoMode ? 
                    '🔄 Перейти к реальным TON' : 
                    '🔄 Перейти к тестовым TON';
                modeButton.className = this.demoMode ? 'btn btn-testnet' : 'btn btn-mainnet';
            }
            
            if (depositModeInfo) {
                depositModeInfo.textContent = this.demoMode ? 
                    'Демо-пополнение (виртуальные TON)' : 
                    'Реальное пополнение через Crypto Pay';
            }
            
            if (withdrawModeInfo) {
                withdrawModeInfo.textContent = this.demoMode ? 
                    'Демо-вывод (виртуальные TON)' : 
                    'Реальный вывод через Crypto Pay';
            }
        }
    }

    updateModeUI() {
        const modeSwitch = document.getElementById('mode-switch');
        if (modeSwitch) {
            modeSwitch.checked = this.demoMode;
        }
    }

    async toggleMode() {
        try {
            const response = await fetch('/api/toggle-mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.tg.initDataUnsafe.user.id
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.demoMode = result.demo_mode;
                this.userData.balance = result.balance;
                this.userData.demo_balance = result.demo_balance;
                this.userData.main_balance = result.main_balance;
                
                this.updateUI();
                this.updateModeUI();
                
                this.tg.showPopup({
                    title: this.demoMode ? "🔧 Тестовый режим" : "🌐 Реальный режим",
                    message: this.demoMode ? 
                        "Переключено на тестовые TON. Баланс: " + result.demo_balance + " TON" : 
                        "Переключено на реальные TON. Баланс: " + result.main_balance + " TON",
                    buttons: [{ type: "ok" }]
                });
                
                await this.loadTransactionHistory();
            }
        } catch (error) {
            console.error('Toggle mode error:', error);
        }
    }

    async processDeposit() {
        const amount = parseFloat(document.getElementById('deposit-amount').value);
        
        if (!amount || amount < 1) {
            alert('Минимальный депозит: 1 TON');
            return;
        }

        try {
            const response = await fetch('/api/create-deposit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.tg.initDataUnsafe.user.id,
                    amount: amount,
                    demoMode: this.demoMode
                })
            });

            const result = await response.json();
            
            if (result.success) {
                if (result.demo) {
                    // Демо-режим - сразу зачисляем
                    this.tg.showPopup({
                        title: "✅ Демо-пополнение",
                        message: `Демо-депозит ${amount} TON успешно зачислен! Новый баланс: ${result.new_balance} TON`,
                        buttons: [{ type: "ok" }]
                    });
                    
                    this.userData.balance = result.new_balance;
                    if (this.demoMode) {
                        this.userData.demo_balance = result.new_balance;
                    }
                    this.updateUI();
                    await this.loadTransactionHistory();
                } else {
                    // Реальный режим - открываем ссылку для оплаты
                    window.open(result.invoiceUrl, '_blank');
                    
                    this.tg.showPopup({
                        title: "Оплата TON",
                        message: `Откройте Crypto Bot для оплаты ${amount} TON`,
                        buttons: [{ type: "ok" }]
                    });
                    
                    // Запускаем проверку статуса
                    this.checkDepositStatus(result.invoiceId);
                }
                
                // Закрываем модальное окно
                closeDepositModal();
            }
        } catch (error) {
            console.error('Deposit error:', error);
            alert('Ошибка при создании депозита');
        }
    }

    async checkDepositStatus(invoiceId) {
        // Проверяем статус каждые 5 секунд
        const checkInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/invoice-status/${invoiceId}`);
                const result = await response.json();
                
                if (result.status === 'paid') {
                    clearInterval(checkInterval);
                    alert('Депозит успешно зачислен!');
                    await this.loadUserData();
                    await this.loadTransactionHistory();
                } else if (result.status === 'expired' || result.status === 'cancelled') {
                    clearInterval(checkInterval);
                    alert('Платеж отменен или просрочен');
                }
            } catch (error) {
                console.error('Status check error:', error);
            }
        }, 5000);
    }

    async processWithdraw() {
        const amount = parseFloat(document.getElementById('withdraw-amount').value);
        const address = document.getElementById('withdraw-address').value;

        if (!amount || amount < 1 || !address) {
            alert('Заполните все поля корректно. Минимальный вывод: 1 TON');
            return;
        }

        if (!address.startsWith('UQ') || address.length < 48) {
            alert('Введите корректный TON адрес (начинается с UQ...)');
            return;
        }

        try {
            const response = await fetch('/api/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.tg.initDataUnsafe.user.id,
                    amount: amount,
                    address: address,
                    demoMode: this.demoMode
                })
            });

            const result = await response.json();
            
            if (result.success) {
                const title = result.demo ? "✅ Демо-вывод" : "✅ Вывод выполнен";
                const message = result.demo ? 
                    `Демо-вывод ${amount} TON успешно обработан. Новый баланс: ${result.new_balance} TON` :
                    `Вывод ${amount} TON успешно обработан. Новый баланс: ${result.new_balance} TON`;
                
                this.tg.showPopup({
                    title: title,
                    message: message,
                    buttons: [{ type: "ok" }]
                });
                
                this.userData.balance = result.new_balance;
                if (this.demoMode) {
                    this.userData.demo_balance = result.new_balance;
                } else {
                    this.userData.main_balance = result.new_balance;
                }
                this.updateUI();
                await this.loadTransactionHistory();
                
                closeWithdrawModal();
            } else {
                alert('Ошибка при выводе средств');
            }
        } catch (error) {
            console.error('Withdraw error:', error);
            alert('Ошибка при выводе средств');
        }
    }

    setupEventListeners() {
        window.processDeposit = () => this.processDeposit();
        window.processWithdraw = () => this.processWithdraw();
        window.toggleMode = () => this.toggleMode();
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    new TonCasinoApp();
});