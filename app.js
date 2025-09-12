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
        const response = await fetch(`/api/user/${this.tg.initDataUnsafe.user.id}`);
        if (response.ok) {
            const userData = await response.json();
            this.isAdmin = userData.is_admin;
            
            if (this.isAdmin) {
                this.showAdminButton();
            }
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

    async  loadUserData() {
    try {
        const response = await fetch(`/api/user/${this.tg.initDataUnsafe.user.id}`);
        if (response.ok) {
            this.userData = await response.json();
            this.demoMode = this.userData.demo_mode;
            
            // Обновляем UI с правильными балансами
            const balanceElement = document.getElementById('balance');
            if (balanceElement) {
                balanceElement.textContent = this.demoMode ? 
                    this.userData.demo_balance.toFixed(2) : 
                    this.userData.main_balance.toFixed(2);
            }
            
            this.updateUI();
        } else {
            console.error('Failed to load user data:', response.status);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

async createUser() {
    try {
        const response = await fetch(`/api/user/${this.tg.initDataUnsafe.user.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            await this.loadUserData();
        }
    } catch (error) {
        console.error('Error creating user:', error);
    }
}

    async loadTransactionHistory() {
        try {
            const response = await fetch(`/api/transactions/${this.tg.initDataUnsafe.user.id}`);
            if (response.ok) {
                const data = await response.json();
                this.updateTransactionHistory(data.transactions);
            }
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    }

    updateTransactionHistory(transactions) {
        const transactionsContainer = document.getElementById('transactions');
        if (transactionsContainer) {
            transactionsContainer.innerHTML = '';
            
            if (transactions && transactions.length > 0) {
                transactions.forEach(transaction => {
                    if (transaction.status === 'completed') {
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
                    }
                });
            }

            if (transactionsContainer.children.length === 0) {
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
                modeButton.className = this.demoMode ? 'btn btn-mode btn-testnet' : 'btn btn-mode btn-mainnet';
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

    async  toggleMode() {
    try {
        const response = await fetch('/api/user/toggle-demo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegramId: this.tg.initDataUnsafe.user.id
            })
        });

        if (response.ok) {
            const result = await response.json();
            
            if (result.success) {
                this.demoMode = result.demo_mode;
                this.userData.demo_mode = result.demo_mode;
                
                // Загружаем обновленные данные пользователя
                await this.loadUserData();
                
                this.tg.showPopup({
                    title: this.demoMode ? "🔧 Тестовый режим" : "🌐 Реальный режим",
                    message: this.demoMode ? 
                        "Переключено на тестовые TON" : 
                        "Переключено на реальные TON",
                    buttons: [{ type: "ok" }]
                });
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } else {
            throw new Error('Server error');
        }
    } catch (error) {
        console.error('Toggle mode error:', error);
        this.tg.showPopup({
            title: "❌ Ошибка",
            message: "Не удалось переключить режим: " + error.message,
            buttons: [{ type: "ok" }]
        });
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
        if (response.ok) {
            const data = await response.json();
            
            document.getElementById('admin-bank-balance').textContent = data.bank_balance || 0;
            document.getElementById('admin-total-users').textContent = data.total_users || 0;
            document.getElementById('admin-total-transactions').textContent = data.total_transactions || 0;
        }
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
            const response = await fetch('/api/admin/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.tg.initDataUnsafe.user.id,
                    amount: amount
                })
            });

            if (response.ok) {
                const result = await response.json();
                
                if (result.success) {
                    alert(`Успешно выведено ${amount} TON! Hash: ${result.hash}`);
                    await this.loadAdminData();
                } else {
                    alert('Ошибка при выводе: ' + result.error);
                }
            }
        } catch (error) {
            console.error('Withdraw profit error:', error);
            alert('Ошибка при выводе');
        }
    }

    async processDeposit() {
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    
    if (!amount || amount < 1) {
        alert('Минимальный депозит: 1 TON');
        return;
    }

    try {
        const response = await fetch('/api/deposit/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegramId: this.tg.initDataUnsafe.user.id,
                amount: amount
            })
        });

        if (response.ok) {
            const result = await response.json();
            
            if (result.success) {
                if (result.demo_mode) {
                    // Демо-режим - сразу обновляем баланс
                    this.tg.showPopup({
                        title: "✅ Успешно",
                        message: `Демо-баланс пополнен на ${amount} TON!`,
                        buttons: [{ type: "ok" }]
                    });
                    await this.loadUserData();
                    await this.loadTransactionHistory();
                } else {
                    // Режим - открываем инвойс
                    this.tg.openInvoice(result.invoice_url, (status) => {
                        if (status === 'paid') {
                            this.tg.showPopup({
                                title: "✅ Успешно",
                                message: 'Депозит успешно зачислен!',
                                buttons: [{ type: "ok" }]
                            });
                            this.loadUserData();
                            this.loadTransactionHistory();
                        }
                    });
                }
                
                closeDepositModal();
            }
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Deposit error:', error);
        alert('Ошибка при создании депозита');
    }
}

    async checkDepositStatus(invoiceId) {
    const checkInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/deposit/status/${invoiceId}`); // Изменили endpoint
            if (response.ok) {
                const result = await response.json();
                
                if (result.status === 'paid') {
                    clearInterval(checkInterval);
                    this.tg.showPopup({
                        title: "✅ Успешно",
                        message: 'Депозит успешно зачислен!',
                        buttons: [{ type: "ok" }]
                    });
                    await this.loadUserData();
                    await this.loadTransactionHistory();
                } else if (result.status === 'expired' || result.status === 'cancelled') {
                    clearInterval(checkInterval);
                    this.tg.showPopup({
                        title: "❌ Ошибка",
                        message: 'Платеж отменен или просрочен',
                        buttons: [{ type: "ok" }]
                    });
                }
            }
        } catch (error) {
            console.error('Status check error:', error);
        }
    }, 5000);
}

    async addDemoBalance() {
        const targetTelegramId = prompt('ID пользователя для пополнения:');
        const amount = parseFloat(prompt('Сумма для пополнения (тестовые TON):'));
        
        if (!targetTelegramId || !amount || amount < 1) {
            alert('Введите корректные данные');
            return;
        }

        try {
            const response = await fetch('/api/admin/add-balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.tg.initDataUnsafe.user.id,
                    targetTelegramId: targetTelegramId,
                    amount: amount
                })
            });

            if (response.ok) {
                const result = await response.json();
                
                if (result.success) {
                    alert(`Успешно добавлено ${amount} тестовых TON пользователю ${targetTelegramId}`);
                } else {
                    alert('Ошибка: ' + result.error);
                }
            }
        } catch (error) {
            console.error('Add demo balance error:', error);
            alert('Ошибка при пополнении баланса');
        }
    }

    async processWithdraw() {
    const amount = parseFloat(document.getElementById('withdraw-amount').value);
    const address = document.getElementById('withdraw-address').value;

    if (!amount || amount < 1 || !address) {
        alert('Заполните все поля корректно');
        return;
    }

    try {
        const response = await fetch('/api/withdraw/create', { // Изменили endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegramId: this.tg.initDataUnsafe.user.id,
                amount: amount,
                address: address,
                demoMode: this.demoMode
            })
        });

        // Остальной код остается таким же...
    } catch (error) {
        console.error('Withdraw error:', error);
        alert('Ошибка при выводе средств');
    }
}
    setupEventListeners() {
        // Закрытие модальных окон при клике вне их
        window.onclick = function(event) {
            const depositModal = document.getElementById('deposit-modal');
            const withdrawModal = document.getElementById('withdraw-modal');
            const adminModal = document.getElementById('admin-modal');
            
            if (event.target === depositModal) {
                closeDepositModal();
            }
            if (event.target === withdrawModal) {
                closeWithdrawModal();
            }
            if (event.target === adminModal) {
                closeAdminPanel();
            }
        }
    }
}

// Глобальные функции для кнопок
let app;

function openDepositModal() {
    document.getElementById('deposit-modal').style.display = 'block';
}

function closeDepositModal() {
    document.getElementById('deposit-modal').style.display = 'none';
    document.getElementById('deposit-amount').value = '';
}

function openWithdrawModal() {
    document.getElementById('withdraw-modal').style.display = 'block';
}

function closeWithdrawModal() {
    document.getElementById('withdraw-modal').style.display = 'none';
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-address').value = '';
}

function openAdminPanel() {
    app.openAdminPanel();
}

function closeAdminPanel() {
    app.closeAdminPanel();
}

function toggleMode() {
    app.toggleMode();
}

function processDeposit() {
    app.processDeposit();
}

function processWithdraw() {
    app.processWithdraw();
}

function withdrawProfit() {
    app.withdrawProfit();
}

function addDemoBalance() {
    app.addDemoBalance();
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    app = new TonCasinoApp();
});