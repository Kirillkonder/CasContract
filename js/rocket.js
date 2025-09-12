// Основные переменные игры
let gameState = 'waiting'; // waiting, counting, flying, crashed, cashedout
let currentMultiplier = 1.0;
let maxMultiplier = 100.0;
let flightSpeed = 0;
let userBet = 0;
let userBalance = 10.0;
let autoBetEnabled = false;
let autoCashoutEnabled = false;
let autoBetAmount = 1.0;
let autoCashoutMultiplier = 2.0;
let countdownTimer = 10;
let flightTimer = null;
let countdownInterval = null;
let players = [];
let gameHistory = [];

// Инициализация игры
function initRocketGame() {
    updateBalance();
    updateGameStatus('Ожидание начала игры...', 'waiting');
    updatePlayersList();
    loadGameHistory();
    
    // Запуск демо-режима для тестирования
    setTimeout(startCountdown, 2000);
}

// Обновление баланса
function updateBalance() {
    const balanceElement = document.getElementById('balance');
    if (balanceElement) {
        balanceElement.textContent = userBalance.toFixed(2);
    }
}

// Обновление статуса игры
function updateGameStatus(text, statusClass) {
    const statusElement = document.getElementById('statusText');
    const gameStatusElement = document.getElementById('gameStatus');
    
    if (statusElement) {
        statusElement.textContent = text;
    }
    
    if (gameStatusElement) {
        // Удаляем все классы статуса
        gameStatusElement.className = 'game-status';
        // Добавляем текущий класс статуса
        gameStatusElement.classList.add(`status-${statusClass}`);
    }
}

// Запуск обратного отсчета
function startCountdown() {
    if (gameState !== 'waiting') return;
    
    gameState = 'counting';
    countdownTimer = 10;
    updateGameStatus('До старта: ', 'counting');
    
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        countdownElement.textContent = countdownTimer + 's';
    }
    
    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        countdownTimer--;
        
        if (countdownElement) {
            countdownElement.textContent = countdownTimer + 's';
        }
        
        if (countdownTimer <= 0) {
            clearInterval(countdownInterval);
            startFlight();
        }
    }, 1000);
}

// Запуск полета ракеты
function startFlight() {
    if (gameState !== 'counting') return;
    
    gameState = 'flying';
    currentMultiplier = 1.0;
    flightSpeed = 0.02;
    
    updateGameStatus('Ракета взлетает!', 'flying');
    updateMultiplierDisplay();
    
    // Скрываем кнопку ставки, показываем кнопку вывода
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    
    if (betButton) betButton.disabled = true;
    if (cashoutButton) cashoutButton.disabled = false;
    
    // Запускаем анимацию ракеты
    animateRocket();
    
    // Авто-ставка, если включена
    if (autoBetEnabled && userBalance >= autoBetAmount) {
        placeAutoBet();
    }
}

// Анимация полета ракеты
function animateRocket() {
    const rocket = document.getElementById('rocket');
    const rocketTrail = document.querySelector('.rocket-trail');
    const multiplierDisplay = document.getElementById('multiplierDisplay');
    const canvasWidth = document.querySelector('.rocket-canvas').offsetWidth - 40;
    
    if (!rocket || !rocketTrail) return;
    
    let position = 0;
    let crashed = false;
    
    // Сброс позиции ракеты
    rocket.style.transform = 'translateX(0)';
    rocketTrail.style.width = '0';
    
    // Показываем ракету
    rocket.style.display = 'block';
    
    // Функция анимации
    function fly() {
        if (gameState !== 'flying' || crashed) return;
        
        // Увеличиваем множитель и позицию
        currentMultiplier += flightSpeed * (0.5 + Math.random() * 0.5);
        position += flightSpeed * 2;
        
        // Увеличиваем скорость со временем
        flightSpeed *= 1.002;
        
        // Обновляем позицию ракеты
        const translateX = Math.min(position * canvasWidth, canvasWidth);
        rocket.style.transform = `translateX(${translateX}px)`;
        
        // Обновляем след ракеты
        rocketTrail.style.width = `${translateX}px`;
        
        // Обновляем отображение множителя
        updateMultiplierDisplay();
        
        // Проверка на автовывод
        if (autoCashoutEnabled && currentMultiplier >= autoCashoutMultiplier && userBet > 0) {
            cashout();
            return;
        }
        
        // Проверка на краш (случайное событие)
        const crashChance = Math.min(0.001 * currentMultiplier, 0.1);
        if (Math.random() < crashChance) {
            crashed = true;
            crashRocket();
            return;
        }
        
        // Максимальный множитель
        if (currentMultiplier >= maxMultiplier) {
            crashed = true;
            completeFlight();
            return;
        }
        
        // Продолжаем анимацию
        requestAnimationFrame(fly);
    }
    
    // Запускаем анимацию
    requestAnimationFrame(fly);
}

// Обновление отображения множителя
function updateMultiplierDisplay() {
    const multiplierDisplay = document.getElementById('multiplierDisplay');
    if (multiplierDisplay) {
        multiplierDisplay.textContent = currentMultiplier.toFixed(2) + 'x';
        
        // Изменяем цвет в зависимости от множителя
        if (currentMultiplier < 2) {
            multiplierDisplay.style.color = '#00b894';
        } else if (currentMultiplier < 5) {
            multiplierDisplay.style.color = '#fdcb6e';
        } else {
            multiplierDisplay.style.color = '#ff7675';
        }
        
        // Анимация пульсации для высоких множителей
        if (currentMultiplier > 10) {
            multiplierDisplay.style.animation = 'multiplierIncrease 1s infinite';
        } else {
            multiplierDisplay.style.animation = 'none';
        }
    }
    
    // Обновляем потенциальный выигрыш
    updatePotentialWin();
}

// Краш ракеты
function crashRocket() {
    gameState = 'crashed';
    
    // Анимация взрыва
    const rocket = document.getElementById('rocket');
    const explosion = document.getElementById('explosion');
    
    if (rocket) rocket.style.display = 'none';
    
    if (explosion) {
        explosion.style.display = 'block';
        explosion.style.left = rocket.style.transform.replace('translateX(', '').replace('px)', '') + 'px';
        explosion.style.bottom = '40px';
        
        // Анимируем частицы взрыва
        const particles = explosion.querySelectorAll('.explosion-particle');
        particles.forEach(particle => {
            const tx = (Math.random() - 0.5) * 100;
            const ty = (Math.random() - 0.5) * 100;
            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);
        });
        
        // Скрываем взрыв через 1 секунду
        setTimeout(() => {
            explosion.style.display = 'none';
        }, 1000);
    }
    
    updateGameStatus(`Ракета взорвалась на ${currentMultiplier.toFixed(2)}x!`, 'crashed');
    addToHistory(currentMultiplier.toFixed(2), 'loss');
    
    // Сбрасываем игру через 3 секунды
    setTimeout(resetGame, 3000);
}

// Успешное завершение полета
function completeFlight() {
    gameState = 'completed';
    updateGameStatus(`Ракета улетела на ${currentMultiplier.toFixed(2)}x!`, 'flying');
    addToHistory(currentMultiplier.toFixed(2), 'win');
    
    // Сбрасываем игру через 3 секунды
    setTimeout(resetGame, 3000);
}

// Сброс игры
function resetGame() {
    gameState = 'waiting';
    currentMultiplier = 1.0;
    userBet = 0;
    
    // Сбрасываем UI элементы
    const rocket = document.getElementById('rocket');
    const rocketTrail = document.querySelector('.rocket-trail');
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    const multiplierDisplay = document.getElementById('multiplierDisplay');
    
    if (rocket) rocket.style.display = 'none';
    if (rocketTrail) rocketTrail.style.width = '0';
    if (betButton) betButton.disabled = false;
    if (cashoutButton) cashoutButton.disabled = true;
    if (multiplierDisplay) {
        multiplierDisplay.textContent = '1.00x';
        multiplierDisplay.style.color = '#00b894';
        multiplierDisplay.style.animation = 'none';
    }
    
    updateGameStatus('Ожидание начала игры...', 'waiting');
    updateUserBetDisplay();
    updatePotentialWin();
    
    // Запускаем новый отсчет
    setTimeout(startCountdown, 3000);
}

// Размещение ставки
function placeBet() {
    const betAmountInput = document.getElementById('betAmount');
    const betAmount = parseFloat(betAmountInput.value);
    
    if (isNaN(betAmount) || betAmount <= 0) {
        showMessage('Введите корректную сумму ставки!', 'error');
        return;
    }
    
    if (betAmount > userBalance) {
        showMessage('Недостаточно средств!', 'error');
        return;
    }
    
    if (gameState !== 'waiting') {
        showMessage('Можно ставить только в режиме ожидания!', 'error');
        return;
    }
    
    userBet = betAmount;
    userBalance -= betAmount;
    
    updateBalance();
    updateUserBetDisplay();
    updatePotentialWin();
    
    // Добавляем игрока в список
    addPlayer('Вы', betAmount);
    
    showMessage(`Ставка ${betAmount} TON принята!`, 'success');
}

// Авто-ставка
function placeAutoBet() {
    userBet = autoBetAmount;
    userBalance -= autoBetAmount;
    
    updateBalance();
    updateUserBetDisplay();
    updatePotentialWin();
    
    addPlayer('Вы (авто)', autoBetAmount);
}

// Забрать выигрыш
function cashout() {
    if (gameState !== 'flying' || userBet === 0) return;
    
    gameState = 'cashedout';
    
    const winAmount = userBet * currentMultiplier;
    userBalance += winAmount;
    
    updateBalance();
    updateGameStatus(`Вы забрали ${winAmount.toFixed(2)} TON!`, 'cashedout');
    addToHistory(currentMultiplier.toFixed(2), 'win');
    
    // Анимация кнопки вывода
    const cashoutButton = document.getElementById('cashoutButton');
    if (cashoutButton) {
        cashoutButton.classList.add('cashing-out');
        setTimeout(() => {
            cashoutButton.classList.remove('cashing-out');
        }, 1000);
    }
    
    userBet = 0;
    updateUserBetDisplay();
    
    // Сбрасываем игру через 3 секунды
    setTimeout(resetGame, 3000);
}

// Обновление отображения ставки пользователя
function updateUserBetDisplay() {
    const userBetElement = document.getElementById('userBet');
    if (userBetElement) {
        userBetElement.textContent = userBet > 0 ? userBet.toFixed(2) + ' TON' : '0 TON';
    }
}

// Обновление потенциального выигрыша
function updatePotentialWin() {
    const potentialWinElement = document.getElementById('potentialWin');
    if (potentialWinElement) {
        const potentialWin = userBet * currentMultiplier;
        potentialWinElement.textContent = potentialWin > 0 ? potentialWin.toFixed(2) + ' TON' : '0 TON';
    }
}

// Добавление игрока в список
function addPlayer(name, betAmount) {
    players.push({ name, betAmount });
    updatePlayersList();
}

// Обновление списка игроков
function updatePlayersList() {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    
    if (!playersList) return;
    
    playersList.innerHTML = '';
    
    if (playersCount) {
        playersCount.textContent = players.length;
    }
    
    players.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.innerHTML = `
            <span class="player-name">${player.name}</span>
            <span class="player-bet">${player.betAmount.toFixed(2)} TON</span>
        `;
        playersList.appendChild(playerElement);
    });
}

// Добавление в историю игр
function addToHistory(multiplier, result) {
    gameHistory.unshift({ multiplier, result });
    
    if (gameHistory.length > 20) {
        gameHistory = gameHistory.slice(0, 20);
    }
    
    updateHistoryDisplay();
}

// Обновление отображения истории
function updateHistoryDisplay() {
    const historyItems = document.getElementById('historyItems');
    if (!historyItems) return;
    
    historyItems.innerHTML = '';
    
    gameHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item history-${item.result}`;
        historyItem.textContent = item.multiplier + 'x';
        historyItems.appendChild(historyItem);
    });
}

// Загрузка истории игр
function loadGameHistory() {
    // Загрузка из localStorage или создание демо-истории
    const savedHistory = localStorage.getItem('rocketGameHistory');
    
    if (savedHistory) {
        gameHistory = JSON.parse(savedHistory);
    } else {
        // Демо-история
        for (let i = 0; i < 10; i++) {
            const multiplier = (1 + Math.random() * 20).toFixed(2);
            const result = Math.random() > 0.4 ? 'win' : 'loss';
            gameHistory.push({ multiplier, result });
        }
    }
    
    updateHistoryDisplay();
}

// Сохранение истории игр
function saveGameHistory() {
    localStorage.setItem('rocketGameHistory', JSON.stringify(gameHistory));
}

// Управление авто-ставками
function toggleAutoBet() {
    const toggle = document.getElementById('autoBetToggle');
    autoBetEnabled = toggle.checked;
}

function updateAutoBetAmount() {
    const input = document.getElementById('autoBetAmount');
    autoBetAmount = parseFloat(input.value) || 1.0;
}

function toggleAutoCashout() {
    const toggle = document.getElementById('autoCashoutToggle');
    autoCashoutEnabled = toggle.checked;
}

function updateAutoCashoutMultiplier() {
    const input = document.getElementById('autoCashoutMultiplier');
    autoCashoutMultiplier = parseFloat(input.value) || 2.0;
}

// Вспомогательные функции
function showMessage(message, type) {
    // Реализация показа сообщений (можно добавить toast-уведомления)
    console.log(`${type}: ${message}`);
}

function goBack() {
    window.history.back();
}

// Инициализация игры при загрузке страницы
document.addEventListener('DOMContentLoaded', initRocketGame);

// Сохранение при закрытии страницы
window.addEventListener('beforeunload', saveGameHistory);