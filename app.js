
class TonCasinoApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.userData = null;
        this.demoMode = false;
        this.isAdmin = false;
        this.init();
    }

    async init() {
        this.tg.expand();
        this.tg.ready();
        
        await this.loadUserData();
        this.checkAdminStatus();
        this.setupEventListeners();
        this.loadTransactionHistory();
        this.updateModeUI();
    }

    async checkAdminStatus() {
        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.tg.initDataUnsafe.user.id,
                    password: '1234'
                })
            });

            const result = await response.json();
            this.isAdmin = result.isAdmin;
            
            if (this.isAdmin) {
                this.showAdminButton();
            }
        } catch (error) {
            console.error('Admin check error:', error);
        }
    }

    showAdminButton() {
        const adminBtn = document.getElementById('admin-button');
        if (adminBtn) {
            adminBtn.style.display = 'block';
        }
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
                
                const amountClass = transaction.amount > 0 ? 'transaction-positive' : 'transaction-negative';
                const sign = transaction.amount > 0 ? '+' : '';
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

    async openAdminPanel() {
        document.getElementById('admin-modal').style.display = 'block';
        await this.loadAdminData();
    }

    async closeAdminPanel() {
        document.getElementById('admin-modal').style.display = 'none';
    }

    async loadAdminData() {
        try {
            const response = await fetch(`/api/admin/dashboard/${this.tg.initDataUnsafe.user.id}`);
            const data = await response.json();
            
            document.getElementById('admin-bank-balance').textContent = data.bank_balance;
            document.getElementById('admin-total-users').textContent = data.total_users;
            document.getElementById('admin-total-transactions').textContent = data.total_transactions;
        } catch (error) {
            console.error('Admin data error:', error);
            alert('Ошибка загрузки админ-панели');
        }
    }

    async withdrawProfit() {
        const amount = parseFloat(prompt('Сколько TON вывести?'));
        
        if (!amount || amount < 1) {
            alert('Введите корректную сумму');
            return;
        }

        try {
            const response = await fetch('/api/admin/withdraw-profit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.tg.initDataUnsafe.user.id,
                    amount: amount
                })
            });

            const result = await response.json();
            
            if (result.success) {
                alert(`Успешно выведено ${amount} TON! Hash: ${result.hash}`);
                await this.loadAdminData();
            } else {
                alert('Ошибка при выводе: ' + result.error);
            }
        } catch (error) {
            console.error('Withdraw profit error:', error);
            alert('Ошибка при выводе');
        }
    }

    async playRoulette() {
        const betAmount = parseFloat(prompt('Сколько ставим? (мин. 1 TON)'));
        
        if (!betAmount || betAmount < 1) {
            alert('Минимальная ставка: 1 TON');
            return;
        }

        const betType = prompt('На что ставим? (red/black/number)');
        let number = null;

        if (betType === 'number') {
            number = parseInt(prompt('На какое число? (0-36)'));
            if (number < 0 || number > 36) {
                alert('Число должно быть от 0 до 36');
                return;
            }
        } else if (betType !== 'red' && betType !== 'black') {
            alert('Выберите red, black или number');
            return;
        }

        try {
            const response = await fetch('/api/play/roulette', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.tg.initDataUnsafe.user.id,
                    betAmount: betAmount,
                    betType: betType,
                    number: number,
                    demoMode: this.demoMode
                })
            });

            const result = await response.json();
            
            if (result.success) {
                const message = result.win ? 
                    `🎉 Вы выиграли ${result.amount} TON! Выпало: ${result.result}` :
                    `💸 Вы проиграли ${-result.amount} TON! Выпало: ${result.result}`;
                
                alert(message);
                await this.loadUserData();
                await this.loadTransactionHistory();
            } else {
                alert('Ошибка в игре: ' + result.error);
            }
        } catch (error) {
            console.error('Roulette error:', error);
            alert('Ошибка в игре');
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
                    this.tg.showPopup({
                        title: "✅ Демо-пополнение",
                        message: `Демо-депозит ${amount} TON успешно зачислен!`,
                        buttons: [{ type: "ok" }]
                    });
                    
                    this.userData.balance = result.new_balance;
                    if (this.demoMode) {
                        this.userData.demo_balance = result.new_balance;
                    }
                    this.updateUI();
                    await this.loadTransactionHistory();
                } else {
                    window.open(result.invoiceUrl, '_blank');
                    
                    this.tg.showPopup({
                        title: "Оплата TON",
                        message: `Откройте Crypto Bot для оплаты ${amount} TON`,
                        buttons: [{ type: "ok" }]
                    });
                    
                    this.checkDepositStatus(result.invoiceId);
                }
                
                closeDepositModal();
            }
        } catch (error) {
            console.error('Deposit error:', error);
            alert('Ошибка при создании депозита');
        }
    }

    async checkDepositStatus(invoiceId) {
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
                    `Демо-вывод ${amount} TON успешно обработан` :
                    `Вывод ${amount} TON успешно обработан`;
                
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
                alert('Ошибка при выводе средств: ' + result.error);
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
        window.openAdminPanel = () => this.openAdminPanel();
        window.closeAdminPanel = () => this.closeAdminPanel();
        window.withdrawProfit = () => this.withdrawProfit();
        window.playRoulette = () => this.playRoulette();
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    new TonCasinoApp();
});