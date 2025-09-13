let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 50;
let countdownInterval = null;

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    connectWebSocket();
});

function goBack() {
    window.location.href = 'index.html';
}

function initializeGame() {
    const tg = window.Telegram.WebApp;
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser = {
            id: tg.initDataUnsafe.user.id,
            username: tg.initDataUnsafe.user.username || `User_${tg.initDataUnsafe.user.id}`,
            firstName: tg.initDataUnsafe.user.first_name,
            lastName: tg.initDataUnsafe.user.last_name
        };
        loadUserData();
    }
}

async function loadUserData() {
    try {
        const response = await fetch(`/api/user/balance/${currentUser.id}`);
        if (response.ok) {
            const userData = await response.json();
            const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
            document.getElementById('balance').textContent = balance.toFixed(2);
            isDemoMode = userData.demo_mode;
            document.getElementById('demo-badge').textContent = isDemoMode ? 'TESTNET' : 'MAINNET';
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('Connected to Rocket game server');
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'rocket_update') {
            updateGameState(data.game);
        }
    };
    
    ws.onclose = function() {
        console.log('Disconnected from Rocket game server');
        setTimeout(connectWebSocket, 5000);
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

function updateGameState(gameState) {
    // Обновляем глобальную переменную игры
    rocketGame = gameState;
    
    // Обновляем статус игры
    const statusElement = document.getElementById('statusText');
    const countdownElement = document.getElementById('countdown');
    const statusClass = `status-${gameState.status}`;
    
    document.getElementById('gameStatus').className = `game-status ${statusClass}`;
    
    switch(gameState.status) {
        case 'waiting':
            statusElement.textContent = 'Ожидание начала игры...';
            countdownElement.textContent = '';
            clearCountdown();
            resetBettingUI();
            break;
            
        case 'counting':
            statusElement.textContent = 'Прием ставок: ';
            startCountdown(gameState.endBetTime);
            updateBettingUI();
            break;
            
        case 'flying':
            statusElement.textContent = 'Ракета взлетает!';
            countdownElement.textContent = '';
            clearCountdown();
            updateRocketPosition(gameState.multiplier);
            updateMultiplierDisplay(gameState.multiplier);
            break;
            
        case 'crashed':
            statusElement.textContent = `Ракета взорвалась на ${gameState.crashPoint.toFixed(2)}x!`;
            countdownElement.textContent = '';
            clearCountdown();
            showExplosion();
            break;
    }
    
    // Обновляем множитель
    document.getElementById('multiplierDisplay').textContent = gameState.multiplier.toFixed(2) + 'x';
    updateMultiplierDisplay(gameState.multiplier);
    
    // Находим нашего игрока
    userPlayer = gameState.players.find(p => p.userId == currentUser.id && !p.isBot);
    
    if (userPlayer) {
        userBet = userPlayer.betAmount;
        userCashedOut = userPlayer.cashedOut;
        document.getElementById('userBet').textContent = userBet.toFixed(2);
        
        if (userCashedOut) {
            document.getElementById('potentialWin').textContent = userPlayer.winAmount.toFixed(2);
        }
    }
    
    // Обновляем список игроков
    updatePlayersList(gameState.players);
    
    // Обновляем историю
    updateHistory(gameState.history);
    
    // Обновляем потенциальный выигрыш
    if (userBet > 0 && !userCashedOut && gameState.status === 'flying') {
        const potentialWin = userBet * gameState.multiplier;
        document.getElementById('potentialWin').textContent = potentialWin.toFixed(2);
    }
    
    updateBettingUI();
}

function startCountdown(endTime) {
    clearCountdown();
    
    function updateCountdown() {
        const timeLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        document.getElementById('countdown').textContent = `${timeLeft}с`;
        
        if (timeLeft <= 0) {
            clearCountdown();
            updateBettingUI();
        }
    }
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

function clearCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// Обновленная функция updateRocketPosition для нового дизайна
function updateRocketPosition(multiplier) {
    const rocketElement = document.getElementById('rocket');
    const rocketImg = rocketElement.querySelector('.rocket-img');
    
    // Сброс всех стилей
    rocketImg.style.transform = '';
    rocketElement.classList.remove('rocket-pulsing');
    
    // Корректировка позиции ракеты в зависимости от множителя
    if (multiplier > 1) {
        const verticalProgress = Math.min(1, (multiplier - 1) / 10);
        const verticalOffset = verticalProgress * 180; // Максимальное смещение 180px
        rocketElement.style.transform = `translateX(-50%) translateY(-${verticalOffset}px)`;
        
        // Поворот ракеты при взлете
        const rotation = Math.min(10, (multiplier - 1) * 2);
        rocketImg.style.transform = `rotate(${rotation}deg)`;
        
        // Пульсация при высоких множителях
        if (multiplier > 5) {
            rocketElement.classList.add('rocket-pulsing');
        }
    } else {
        rocketElement.style.transform = 'translateX(-50%)';
        rocketImg.style.transform = 'rotate(0deg)';
    }
}

function showExplosion() {
    const canvas = document.getElementById('rocketCanvas');
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    canvas.appendChild(explosion);
    
    // Скрываем ракету при взрыве
    const rocketElement = document.getElementById('rocket');
    rocketElement.style.display = 'none';
    
    setTimeout(() => {
        canvas.removeChild(explosion);
        rocketElement.style.display = 'block'; // Ракета снова появляется после взрыва
    }, 1000); // Время анимации взрыва
}

// Новая функция для создания взрыва в новом дизайне
function createExplosion() {
    const explosionContainer = document.getElementById('explosionContainer');
    explosionContainer.innerHTML = '';
    
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    explosionContainer.appendChild(explosion);
    
    // Удаляем взрыв через 1 секунду
    setTimeout(() => {
        explosionContainer.innerHTML = '';
    }, 1000);
}

// Новая функция для обновления отображения множителя
function updateMultiplierDisplay(multiplier) {
    const multiplierDisplay = document.getElementById('multiplierDisplay');
    multiplierDisplay.textContent = multiplier.toFixed(2) + 'x';
    
    // Изменение цвета в зависимости от множителя
    if (multiplier > 5) {
        multiplierDisplay.style.color = '#fbbf24'; // Желтый для высоких множителей
        multiplierDisplay.style.textShadow = '0 0 15px rgba(251, 191, 36, 0.7)';
    } else if (multiplier > 2) {
        multiplierDisplay.style.color = '#60a5fa'; // Синий для средних множителей
        multiplierDisplay.style.textShadow = '0 0 15px rgba(96, 165, 250, 0.7)';
    } else {
        multiplierDisplay.style.color = '#00ff88'; // Зеленый для низких множителей
        multiplierDisplay.style.textShadow = '0 0 15px rgba(0, 255, 136, 0.7)';
    }
}

function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    
    playersList.innerHTML = '';
    playersCount.textContent = players.length;
    
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.name;
        
        const betSpan = document.createElement('span');
        betSpan.className = 'player-bet';
        
        if (player.cashedOut) {
            betSpan.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
            betSpan.style.color = '#00ff88';
        } else if (player.isBot) {
            betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
        } else {
            betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
        }
        
        playerItem.appendChild(nameSpan);
        playerItem.appendChild(betSpan);
        playersList.appendChild(playerItem);
    });
}

function updateHistory(history) {
    const historyContainer = document.getElementById('historyItems');
    historyContainer.innerHTML = '';
    
    history.slice(0, 10).forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${item.multiplier >= 2 ? 'history-win' : 'history-loss'}`;
        historyItem.textContent = `${item.multiplier.toFixed(2)}x`;
        historyContainer.appendChild(historyItem);
    });
}

async function placeBet() {
    const betAmount = parseFloat(document.getElementById('betAmount').value);
    
    if (betAmount < 0.5 || betAmount > 50) {
        alert('Ставка должна быть от 0.5 до 50 TON');
        return;
    }
    
    // Запрещаем несколько ставок
    if (userBet > 0) {
        alert('Вы уже сделали ставку в этом раунде!');
        return;
    }
    
    // Проверяем что игра в стадии приема ставок
    if (rocketGame.status !== 'counting') {
        alert('Сейчас нельзя сделать ставку! Дождитесь следующего раунда.');
        return;
    }
    
    // Проверяем время для ставок
    const timeLeft = Math.ceil((rocketGame.endBetTime - Date.now()) / 1000);
    if (timeLeft <= 0) {
        alert('Время для ставок закончилось! Дождитесь следующего раунда.');
        return;
    }
    
    try {
        const response = await fetch('/api/rocket/bet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegramId: currentUser.id,
                betAmount: betAmount,
                demoMode: isDemoMode
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Ошибка при размещении ставки');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userBet = betAmount;
            document.getElementById('userBet').textContent = betAmount.toFixed(2);
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            // Блокируем кнопку ставки
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('placeBetButton').textContent = 'Ставка сделана';
            
            alert('Ставка принята! Удачи! 🚀');
        }
    } catch (error) {
        console.error('Error placing bet:', error);
        alert('Ошибка при размещении ставки');
    }
}

async function cashout() {
    if (userCashedOut) {
        alert('Вы уже забрали выигрыш!');
        return;
    }
    
    if (userBet === 0) {
        alert('Сначала сделайте ставку!');
        return;
    }
    
    if (rocketGame.status !== 'flying') {
        alert('Нельзя забрать выигрыш сейчас!');
        return;
    }
    
    try {
        const response = await fetch('/api/rocket/cashout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegramId: currentUser.id
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Ошибка при выводе средств');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userCashedOut = true;
            updateBettingUI();
            
            // Обновляем баланс
            const response = await fetch(`/api/user/balance/${currentUser.id}`);
            if (response.ok) {
                const userData = await response.json();
                const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
                document.getElementById('balance').textContent = balance.toFixed(2);
            }
            
            alert(`🎉 Вы успешно вывели ${result.winAmount.toFixed(2)} TON на ${result.multiplier.toFixed(2)}x!`);
        }
    } catch (error) {
        console.error('Error cashing out:', error);
        alert('Ошибка при выводе средств');
    }
}

function updateBettingUI() {
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    
    if (rocketGame.status === 'counting') {
        // В режиме ставок
        const timeLeft = rocketGame.endBetTime ? Math.ceil((rocketGame.endBetTime - Date.now()) / 1000) : 0;
        const canBet = timeLeft > 0;
        
        betButton.disabled = userBet > 0 || !canBet;
        cashoutButton.disabled = true;
        
        if (userBet > 0) {
            betButton.textContent = 'Ставка сделана';
        } else if (!canBet) {
            betButton.textContent = 'Время вышло';
        } else {
            betButton.textContent = `Поставить (${timeLeft}с)`;
        }
    } else if (rocketGame.status === 'flying') {
        // В полете
        betButton.disabled = true;
        betButton.textContent = 'Полёт...';
        cashoutButton.disabled = userCashedOut || userBet === 0;
        
        if (!userCashedOut && userBet > 0) {
            cashoutButton.textContent = `Забрать ${rocketGame.multiplier.toFixed(2)}x`;
        }
    } else {
        // Ожидание или краш
        betButton.disabled = rocketGame.status !== 'waiting';
        cashoutButton.disabled = true;
        betButton.textContent = 'Поставить';
        cashoutButton.textContent = 'Забрать выигрыш';
    }
}

function resetBettingUI() {
    userBet = 0;
    userCashedOut = false;
    userPlayer = null;
    document.getElementById('userBet').textContent = '0';
    document.getElementById('potentialWin').textContent = '0';
    document.getElementById('placeBetButton').disabled = false;
    document.getElementById('placeBetButton').textContent = 'Поставить';
    updateBettingUI();
}

// Глобальная переменная для доступа из WebSocket
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    endBetTime: 0
};

// Новая функция для обновления информации о ставке
function updateBetInfo(betAmount, potentialWin) {
    document.getElementById('userBet').textContent = betAmount.toFixed(1);
    document.getElementById('potentialWin').textContent = potentialWin.toFixed(2);
}

// Новая функция для обновления баланса
function updateBalance(balance) {
    document.getElementById('balance').textContent = balance.toFixed(2);
}

// Новая функция для переключения кнопок ставок
function toggleBettingButtons(canBet, canCashout) {
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    
    betButton.disabled = !canBet;
    cashoutButton.disabled = !canCashout;
    
    if (canCashout) {
        cashoutButton.style.background = 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)';
    } else {
        cashoutButton.style.background = '#4a5568';
    }
}

// Функция для кнопки "Назад"
function goBack() {
    window.history.back();
}

// Инициализация игры
function initGame() {
    console.log('Game initialized with new 1win design');
    
    // Пример начальных данных
    updateBalance(100.0);
    updateGameStatus('waiting');
    updatePlayersList([]);
    updateHistory([]);
    toggleBettingButtons(true, false);
}

// Запуск инициализации при загрузке страницы
window.onload = initGame;