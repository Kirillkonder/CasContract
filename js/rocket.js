// Все функции из вашего оригинального файла остаются без изменений
// Я только добавил несколько улучшений для анимаций

let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 80;
let countdownInterval = null;

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    connectWebSocket();
    
    // Добавляем плавное появление элементов
    setTimeout(() => {
        document.body.style.opacity = '1';
        document.querySelector('.container').style.transform = 'translateY(0)';
    }, 100);
});

function goBack() {
    // Анимация при переходе назад
    document.body.style.opacity = '0';
    document.querySelector('.container').style.transform = 'translateY(20px)';
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 300);
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
    
    // Настройка внешнего вида Telegram WebApp
    tg.expand();
    tg.enableClosingConfirmation();
    tg.setHeaderColor('#0f1120');
    tg.setBackgroundColor('#0f1120');
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
            document.getElementById('demo-badge').style.background = isDemoMode ? 'var(--warning-color)' : 'var(--success-color)';
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
        // Показать статус подключения
        showToast('Подключено к серверу', 'success');
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'rocket_update') {
            updateGameState(data.game);
        }
    };
    
    ws.onclose = function() {
        console.log('Disconnected from Rocket game server');
        // Показать статус отключения
        showToast('Потеряно соединение с сервером', 'error');
        setTimeout(connectWebSocket, 5000);
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
        showToast('Ошибка соединения', 'error');
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
    
    // Находим нашего игрока
    userPlayer = gameState.players.find(p => p.userId == currentUser.id && !p.isBot);
    
    if (userPlayer) {
        userBet = userPlayer.betAmount;
        userCashedOut = userPlayer.cashedOut;
        document.getElementById('userBet').textContent = userBet.toFixed(2) + ' TON';
        
        if (userCashedOut) {
            document.getElementById('potentialWin').textContent = userPlayer.winAmount.toFixed(2) + ' TON';
        }
    }
    
    // Обновляем список игроков
    updatePlayersList(gameState.players);
    
    // Обновляем историю
    updateHistory(gameState.history);
    
    // Обновляем потенциальный выигрыш
    if (userBet > 0 && !userCashedOut && gameState.status === 'flying') {
        const potentialWin = userBet * gameState.multiplier;
        document.getElementById('potentialWin').textContent = potentialWin.toFixed(2) + ' TON';
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

function updateRocketPosition(multiplier) {
    const rocketElement = document.getElementById('rocket');
    const trailElement = document.getElementById('rocketTrail');
    const canvasElement = document.querySelector('.game-canvas');
    
    // Обновляем след
    const trailHeight = Math.max(0, multiplier * 10);
    trailElement.style.height = `${trailHeight}px`;
    
    // Включаем пульсацию после 1.00x
    if (multiplier > 1.00) {
        // Добавляем классы пульсации
        rocketElement.classList.add('pulsating');
        canvasElement.classList.add('pulsating');
        
        // Ускоряем пульсацию после 3x
        if (multiplier >= 3) {
            const speedIntensity = Math.min(0.7, (multiplier - 3) / 10);
            const pulseSpeed = Math.max(0.3, 1.2 - speedIntensity);
            document.documentElement.style.setProperty('--pulse-speed', `${pulseSpeed}s`);
        } else {
            document.documentElement.style.setProperty('--pulse-speed', '1.2s');
        }
        
        // Меняем цвет фона при высоких множителях
        if (multiplier > 5) {
            const redIntensity = Math.min(0.3, (multiplier - 5) / 15);
            canvasElement.style.background = `linear-gradient(135deg, rgba(22, 25, 49, 0.95) 0%, rgba(255, 50, 50, ${redIntensity}) 100%)`;
        } else {
            canvasElement.style.background = 'var(--bg-card)';
        }
    } else {
        // Убираем пульсацию при множителе 1.00
        rocketElement.classList.remove('pulsating');
        canvasElement.classList.remove('pulsating');
        canvasElement.style.background = 'var(--bg-card)';
        document.documentElement.style.setProperty('--pulse-speed', '1.2s');
    }
}

function showExplosion() {
    const canvas = document.querySelector('.game-canvas');
    const rocketElement = document.getElementById('rocket');
    
    // Убираем пульсацию перед взрывом
    rocketElement.classList.remove('pulsating');
    canvas.classList.remove('pulsating');
    canvas.style.background = 'var(--bg-card)';
    
    // Запускаем эффект улетающей ракеты
    rocketElement.classList.add('blast-off');
    
    // Создаем текст "УЛЕТЕЛ"
    const blastOffText = document.createElement('div');
    blastOffText.className = 'blast-off-text';
    blastOffText.textContent = 'УЛЕТЕЛ!';
    canvas.appendChild(blastOffText);
    
    setTimeout(() => {
        // Убираем текст
        if (blastOffText.parentNode) {
            canvas.removeChild(blastOffText);
        }
        // Возвращаем ракету в исходное состояние
        rocketElement.classList.remove('blast-off');
        rocketElement.style.transform = 'translateY(0)';
        rocketElement.style.opacity = '1';
        rocketElement.style.filter = 'none';
    }, 2000);
}

function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    
    playersList.innerHTML = '';
    playersCount.textContent = players.length;
    
    if (players.length === 0) {
        playersList.innerHTML = '<div class="empty-state">Нет активных игроков</div>';
        return;
    }
    
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.name;
        
        const betSpan = document.createElement('span');
        betSpan.className = 'player-bet';
        
        if (player.cashedOut) {
            betSpan.textContent = `+${player.winAmount.toFixed(2)} (${player.cashoutMultiplier.toFixed(2)}x)`;
            betSpan.style.color = 'var(--success-color)';
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
    
    if (history.length === 0) {
        historyContainer.innerHTML = '<div class="empty-state">История игр пуста</div>';
        return;
    }
    
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
        showToast('Ставка должна быть от 0.5 до 50 TON', 'error');
        return;
    }
    
    // Запрещаем несколько ставок
    if (userBet > 0) {
        showToast('Вы уже сделали ставку в этом раунде!', 'error');
        return;
    }
    
    // Проверяем что игра в стадии приема ставок
    if (rocketGame.status !== 'counting') {
        showToast('Сейчас нельзя сделать ставку! Дождитесь следующего раунда.', 'error');
        return;
    }
    
    // Проверяем время для ставок
    const timeLeft = Math.ceil((rocketGame.endBetTime - Date.now()) / 1000);
    if (timeLeft <= 0) {
        showToast('Время для ставок закончилось! Дождитесь следующего раунда.', 'error');
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
            showToast(error.error || 'Ошибка при размещении ставки', 'error');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userBet = betAmount;
            document.getElementById('userBet').textContent = betAmount.toFixed(2) + ' TON';
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            // Блокируем кнопку ставки
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('placeBetButton').textContent = 'Ставка сделана';
            
            showToast('Ставка принята! Удачи! 🚀', 'success');
        }
    } catch (error) {
        console.error('Error placing bet:', error);
        showToast('Ошибка при размещении ставки', 'error');
    }
}

async function cashout() {
    if (userCashedOut) {
        showToast('Вы уже забрали выигрыш!', 'error');
        return;
    }
    
    if (userBet === 0) {
        showToast('Сначала сделайте ставку!', 'error');
        return;
    }
    
    if (rocketGame.status !== 'flying') {
        showToast('Нельзя забрать выигрыш сейчас!', 'error');
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
            showToast(error.error || 'Ошибка при выводе средств', 'error');
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
            
            showToast(`🎉 Вы успешно вывели ${result.winAmount.toFixed(2)} TON на ${result.multiplier.toFixed(2)}x!`, 'success');
        }
    } catch (error) {
        console.error('Error cashing out:', error);
        showToast('Ошибка при выводе средств', 'error');
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
            betButton.innerHTML = '<span>Ставка сделана</span>';
        } else if (!canBet) {
            betButton.innerHTML = '<span>Время вышло</span>';
        } else {
            betButton.innerHTML = '<span>Поставить</span>';
        }
    } else if (rocketGame.status === 'flying') {
        // В полете
        betButton.disabled = true;
        betButton.innerHTML = '<span>Полёт...</span>';
        cashoutButton.disabled = userCashedOut || userBet === 0;
        
        if (!userCashedOut && userBet > 0) {
            cashoutButton.innerHTML = '<span>Забрать</span>';
        }
    } else {
        // Ожидание или краш
        betButton.disabled = rocketGame.status !== 'waiting';
        cashoutButton.disabled = true;
        betButton.innerHTML = '<span>Поставить</span>';
        cashoutButton.innerHTML = '<span>Забрать</span>';
    }
}

function resetBettingUI() {
    userBet = 0;
    userCashedOut = false;
    userPlayer = null;
    document.getElementById('userBet').textContent = '0 TON';
    document.getElementById('potentialWin').textContent = '0 TON';
    document.getElementById('placeBetButton').disabled = false;
    document.getElementById('placeBetButton').innerHTML = '<span>Поставить</span>';
    updateBettingUI();
    
    // Сбрасываем позицию ракеты
    const rocketElement = document.getElementById('rocket');
    const trailElement = document.getElementById('rocketTrail');
    rocketElement.style.transform = 'translateY(0)';
    trailElement.style.height = '0px';
}

// Глобальная переменная для доступа из WebSocket
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    endBetTime: 0
};

// Вспомогательная функция для показа уведомлений
function showToast(message, type = 'info') {
    // Создаем элемент тоста, если его еще нет
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        padding: 12px 20px;
        border-radius: 12px;
        color: white;
        font-weight: 500;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s ease;
        max-width: 300px;
    `;
    
    // Устанавливаем цвет в зависимости от типа
    if (type === 'success') {
        toast.style.background = 'var(--success-color)';
    } else if (type === 'error') {
        toast.style.background = 'var(--danger-color)';
    } else {
        toast.style.background = 'var(--primary-color)';
    }
    
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    // Анимация появления
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    }, 10);
    
    // Автоматическое скрытие через 3 секунды
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Инициализация стилей для плавного появления
document.body.style.opacity = '0';
document.querySelector('.container').style.transform = 'translateY(20px)';
document.body.style.transition = 'opacity 0.3s ease';
document.querySelector('.container').style.transition = 'transform 0.3s ease';