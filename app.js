
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
        this.updateDemoModeUI();
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
                const demoBadge = transaction.demo ? ' (TESTNET)' : '';
                
                transactionElement.innerHTML = `
                    <div class="transaction-info">
                        <div>${transaction.type.toUpperCase()}${demoBadge}</div>
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
            const demoBadgeElement = document.getElementById('demo-badge');
            const networkInfoElement = document.getElementById('network-info');
            const depositModeInfo = document.getElementById('deposit-mode-info');
            const withdrawModeInfo = document.getElementById('withdraw-mode-info');
            
            if (balanceElement) {
                balanceElement.textContent = this.userData.balance.toFixed(2);
            }
            
            if (demoBadgeElement) {
                demoBadgeElement.style.display = this.demoMode ? 'block' : 'none';
            }
            
            if (networkInfoElement) {
                networkInfoElement.textContent = this.demoMode ? 
                    '🔧 TESTNET MODE - Используются тестовые TON' : 
                    '🌐 MAINNET MODE - Используются реальные TON';
            }
            
            if (depositModeInfo) {
                depositModeInfo.textContent = this.demoMode ? 
                    'Демо-пополнение (тестовые TON)' : 
                    'Оплата через Crypto Pay';
            }
            
            if (withdrawModeInfo) {
                withdrawModeInfo.textContent = this.demoMode ? 
                    'Демо-вывод (тестовые TON)' : 
                    'Вывод через Crypto Pay';
            }
        }
    }

    updateDemoModeUI() {
        const demoToggle = document.getElementById('demo-toggle');
        const demoStatus = document.getElementById('demo-status');
        
        if (demoToggle && demoStatus) {
            // Для Render отключаем переключение, так как это делается через переменные окружения
            demoToggle.disabled = true;
            demoToggle.checked = this.demoMode;
            demoStatus.textContent = this.demoMode ? 'TESTNET' : 'MAINNET';
            
            // Показываем подсказку
            if (this.demoMode) {
                demoStatus.title = "Режим можно изменить только на сервере";
            }
        }
    }

    async toggleDemoMode() {
        // Для Render переключение отключено, так как делается через переменные окружения
        this.tg.showPopup({
            title: "ℹ️ Информация",
            message: "Переключение режима доступно только через настройки сервера. Обратитесь к администратору.",
            buttons: [{ type: "ok" }]
        });
        
        // Возвращаем переключатель в исходное положение
        const demoToggle = document.getElementById('demo-toggle');
        demoToggle.checked = this.demoMode;
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
                    amount: amount
                })
            });

            const result = await response.json();
            
            if (result.success) {
                if (result.demo) {
                    // Демо-режим - сразу зачисляем
                    this.tg.showPopup({
                        title: "✅ Демо-пополнение",
                        message: `Демо-депозит ${amount} TON успешно зачислен!`,
                        buttons: [{ type: "ok" }]
                    });
                    
                    await this.loadUserData();
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
                    address: address
                })
            });

            const result = await response.json();
            
            if (result.success) {
                const title = result.demo ? "✅ Демо-вывод" : "✅ Вывод выполнен";
                const message = result.demo ? 
                    `Демо-вывод ${amount} TON успешно обработан` :
                    `Вывод ${amount} TON успешно обработан`;
                
                this.tg.showPopup({
                    title: title,
                    message: message,
                    buttons: [{ type: "ok" }]
                });
                
                // Обновляем баланс и историю
                await this.loadUserData();
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
        window.toggleDemoMode = () => this.toggleDemoMode();
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    new TonCasinoApp();
});