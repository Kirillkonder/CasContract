class RocketGame {
    constructor() {
        this.gameState = 'waiting';
        this.multiplier = 1.0;
        this.targetMultiplier = 1.0;
        this.betAmount = 1.0;
        this.players = [];
        this.countdown = 10;
        this.rocketPosition = { x: 50, y: 250 };
        this.maxX = 450;
        this.maxY = 50;
        this.countdownInterval = null;
        this.gameInterval = null;
        this.autoBetEnabled = false;
        this.autoCashoutEnabled = false;
        this.autoCashoutMultiplier = 2.0;
        this.balance = 10.0;
        
        this.initializeElements();
        this.updateUI();
        this.startCountdown();
    }

    initializeElements() {
        this.rocket = document.getElementById('rocket');
        this.rocketFire = document.getElementById('rocketFire');
        this.explosion = document.getElementById('explosion');
        this.multiplierDisplay = document.getElementById('multiplierDisplay');
        this.statusText = document.getElementById('statusText');
        this.countdownElement = document.getElementById('countdown');
        this.betAmountInput = document.getElementById('betAmount');
        this.placeBetButton = document.getElementById('placeBetButton');
        this.cashoutButton = document.getElementById('cashoutButton');
        this.userBetElement = document.getElementById('userBet');
        this.potentialWinElement = document.getElementById('potentialWin');
        this.balanceElement = document.getElementById('balance');
    }

    startCountdown() {
        this.gameState = 'counting';
        this.countdown = 10;
        this.updateStatus('Обратный отсчет: ', 'status-counting');
        
        this.countdownInterval = setInterval(() => {
            this.countdown--;
            this.countdownElement.textContent = this.countdown;
            
            if (this.countdown <= 0) {
                clearInterval(this.countdownInterval);
                this.startGame();
            }
        }, 1000);
    }

    startGame() {
        this.gameState = 'flying';
        this.multiplier = 1.0;
        this.targetMultiplier = this.calculateTargetMultiplier();
        this.updateStatus('Ракета взлетает!', 'status-flying');
        
        this.animateRocket();
    }

    calculateTargetMultiplier() {
        // Случайный множитель с экспоненциальным распределением
        const min = 1.1;
        const max = 100;
        const lambda = 0.1;
        let multiplier = min;
        
        while (Math.random() > 0.5 && multiplier < max) {
            multiplier += Math.random() * 5;
        }
        
        return Math.min(multiplier, max);
    }

    animateRocket() {
        const startTime = Date.now();
        const duration = 5000 + Math.random() * 5000;
        const crashMultiplier = this.targetMultiplier;
        const crashX = this.maxX * (crashMultiplier / 100);
        const crashY = this.maxY * (1 - (crashMultiplier / 100));
        
        this.gameInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Плавное ускорение в начале и замедление в конце
            const easeProgress = progress < 0.5 
                ? 2 * progress * progress 
                : -1 + (4 - 2 * progress) * progress;
            
            this.multiplier = 1 + (crashMultiplier - 1) * easeProgress;
            
            // Позиция ракеты
            const currentX = this.maxX * (this.multiplier / 100);
            const currentY = this.maxY * (1 - (this.multiplier / 100));
            
            this.rocket.style.setProperty('--target-x', `${currentX}px`);
            this.rocket.style.setProperty('--target-y', `${-currentY}px`);
            this.rocket.style.transform = `translateX(${currentX}px) translateY(${-currentY}px)`;
            
            this.updateMultiplierDisplay();
            this.updatePotentialWin();
            
            // Проверка автовывода
            if (this.autoCashoutEnabled && this.multiplier >= this.autoCashoutMultiplier) {
                this.cashout();
            }
            
            if (progress >= 1) {
                this.crashRocket(crashX, crashY);
            }
        }, 16);
    }

    crashRocket(x, y) {
        clearInterval(this.gameInterval);
        this.gameState = 'crashed';
        this.updateStatus('Ракета взорвалась!', 'status-crashed');
        
        // Анимация взрыва
        this.rocket.style.display = 'none';
        this.rocketFire.style.display = 'none';
        
        this.showExplosion(x, y);
        
        setTimeout(() => {
            this.resetGame();
        }, 3000);
    }

    showExplosion(x, y) {
        this.explosion.style.left = `${x}px`;
        this.explosion.style.top = `${y}px`;
        this.explosion.style.display = 'block';
        
        const particles = this.explosion.querySelectorAll('.explosion-particle');
        particles.forEach(particle => {
            const angle = Math.random() * Math.PI * 2;
            const distance = 30 + Math.random() * 50;
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance;
            
            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);
            particle.style.width = `${10 + Math.random() * 20}px`;
            particle.style.height = particle.style.width;
        });
        
        setTimeout(() => {
            this.explosion.style.display = 'none';
        }, 800);
    }

    placeBet() {
        const amount = parseFloat(this.betAmountInput.value);
        if (amount > 0 && amount <= this.balance && this.gameState === 'waiting') {
            this.betAmount = amount;
            this.balance -= amount;
            this.updateBalance();
            this.updateUserBet();
            this.placeBetButton.disabled = true;
        }
    }

    cashout() {
        if (this.gameState === 'flying' && this.betAmount > 0) {
            clearInterval(this.gameInterval);
            this.gameState = 'cashedout';
            
            const winAmount = this.betAmount * this.multiplier;
            this.balance += winAmount;
            
            this.updateStatus(`Вы забрали ${winAmount.toFixed(2)} TON!`, 'status-cashedout');
            this.updateBalance();
            
            setTimeout(() => {
                this.resetGame();
            }, 2000);
        }
    }

    resetGame() {
        clearInterval(this.countdownInterval);
        clearInterval(this.gameInterval);
        
        this.gameState = 'waiting';
        this.multiplier = 1.0;
        this.betAmount = 0;
        
        this.rocket.style.display = 'block';
        this.rocketFire.style.display = 'block';
        this.rocket.style.transform = 'translateX(0px) translateY(0px)';
        this.explosion.style.display = 'none';
        
        this.updateUI();
        this.startCountdown();
        
        if (this.autoBetEnabled) {
            setTimeout(() => this.placeBet(), 1000);
        }
    }

    updateUI() {
        this.updateMultiplierDisplay();
        this.updateStatus('Ожидание начала игры...', 'status-waiting');
        this.updateUserBet();
        this.updatePotentialWin();
        this.updateBalance();
        
        this.placeBetButton.disabled = this.gameState !== 'waiting' || this.balance <= 0;
        this.cashoutButton.disabled = this.gameState !== 'flying' || this.betAmount <= 0;
    }

    updateMultiplierDisplay() {
        this.multiplierDisplay.textContent = this.multiplier.toFixed(2) + 'x';
        
        // Изменение цвета в зависимости от множителя
        if (this.multiplier >= 5) {
            this.multiplierDisplay.style.color = '#e17055';
        } else if (this.multiplier >= 3) {
            this.multiplierDisplay.style.color = '#fdcb6e';
        } else {
            this.multiplierDisplay.style.color = '#00b894';
        }
    }

    updateStatus(text, className) {
        this.statusText.textContent = text;
        this.statusText.parentElement.className = `game-status ${className}`;
    }

    updateUserBet() {
        this.userBetElement.textContent = this.betAmount.toFixed(1) + ' TON';
    }

    updatePotentialWin() {
        const potentialWin = this.betAmount * this.multiplier;
        this.potentialWinElement.textContent = potentialWin.toFixed(2) + ' TON';
    }

    updateBalance() {
        this.balanceElement.textContent = this.balance.toFixed(1);
    }

    toggleAutoBet() {
        this.autoBetEnabled = document.getElementById('autoBetToggle').checked;
    }

    toggleAutoCashout() {
        this.autoCashoutEnabled = document.getElementById('autoCashoutToggle').checked;
    }

    updateAutoBetAmount() {
        this.autoBetAmount = parseFloat(document.getElementById('autoBetAmount').value);
    }

    updateAutoCashoutMultiplier() {
        this.autoCashoutMultiplier = parseFloat(document.getElementById('autoCashoutMultiplier').value);
    }
}

// Инициализация игры
let rocketGame;

function initializeGame() {
    rocketGame = new RocketGame();
}

function placeBet() {
    if (rocketGame) rocketGame.placeBet();
}

function cashout() {
    if (rocketGame) rocketGame.cashout();
}

function toggleAutoBet() {
    if (rocketGame) rocketGame.toggleAutoBet();
}

function toggleAutoCashout() {
    if (rocketGame) rocketGame.toggleAutoCashout();
}

function updateAutoBetAmount() {
    if (rocketGame) rocketGame.updateAutoBetAmount();
}

function updateAutoCashoutMultiplier() {
    if (rocketGame) rocketGame.updateAutoCashoutMultiplier();
}

function goBack() {
    window.history.back();
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', initializeGame);