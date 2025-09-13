// Здесь будет ваш код из rocket.js
let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 50;
let countdownInterval = null;

// Предопределенная траектория полета
const flightPath = [
    { x: 0, multiplier: 1.0 },
    { x: 10, multiplier: 1.2 },
    { x: 20, multiplier: 1.5 },
    { x: 30, multiplier: 2.0 },
    { x: 40, multiplier: 2.8 },
    { x: 50, multiplier: 3.5 },
    { x: 60, multiplier: 4.3 },
    { x: 70, multiplier: 5.2 },
    { x: 80, multiplier: 6.5 },
    { x: 90, multiplier: 8.0 },
    { x: 100, multiplier: 10.0 }
];

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    connectWebSocket();
    // Запускаем демо-режим для тестирования
    setTimeout(startDemoMode, 2000);
});

function goBack() {
    window.location.href = 'index.html';
}

function initializeGame() {
    const tg = window.Telegram.WebApp;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser = {
            id: tg.initDataUnsafe.user.id,
            username: tg.initDataUnsafe.user.username || `User_${tg.initDataUnsafe.user.id}`,
            firstName: tg.initDataUnsafe.user.first_name,
            lastName: tg.initDataUnsafe.user.last_name
        };
        loadUserData();
    } else {
        // Демо-режим для тестирования
        currentUser = {
            id: 123456789,
            username: 'DemoUser',
            firstName: 'Demo',
            lastName: 'User'
        };
        isDemoMode = true;
        document.getElementById('demo-badge').textContent = 'TESTNET';
        document.getElementById('balance').textContent = '1000.00';
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
            drawFlightPath(gameState.multiplier);
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

function updateRocketPosition(multiplier) {
    const rocketElement = document.getElementById('rocket');
    const rocketContainer = document.getElementById('rocketContainer');
    
    // Находим позицию на траектории по множителю
    let targetX = 0;
    let targetY = 0;
    
    for (let i = 0; i < flightPath.length - 1; i++) {
        if (multiplier >= flightPath[i].multiplier && multiplier <= flightPath[i + 1].multiplier) {
            const progress = (multiplier - flightPath[i].multiplier) / 
                            (flightPath[i + 1].multiplier - flightPath[i].multiplier);
            targetX = flightPath[i].x + (flightPath[i + 1].x - flightPath[i].x) * progress;
            targetY = Math.min(35, (multiplier - 1) * 10);
            break;
        }
    }
    
    // Обновляем позицию ракеты
    rocketContainer.style.left = `${targetX}%`;
    rocketContainer.style.bottom = `calc(50% + ${targetY}%)`;
    
    // Применяем трансформации в зависимости от множителя
    if (multiplier >= 3 && multiplier < 5) {
        // Плавный поворот на 50 градусов
        const rotationProgress = (multiplier - 3) / 2;
        const rotation = -50 * rotationProgress;
        rocketElement.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
    } else if (multiplier >= 5) {
        // Полный переворот на 180 градусов
        rocketElement.style.transform = `translateX(-50%) rotate(-180deg)`;
        rocketElement.classList.add('rocket-pulsing');
    } else {
        rocketElement.style.transform = `translateX(-50%)`;
        rocketElement.classList.remove('rocket-pulsing');
    }
}

function drawFlightPath(multiplier) {
    const graphContainer = document.getElementById('graphContainer');
    graphContainer.innerHTML = '';
    
    // Добавляем зеленую линию траектории
    const greenLine = document.createElement('div');
    greenLine.className = 'green-line';
    graphContainer.appendChild(greenLine);
    
    if (multiplier > 1.1) {
        // Добавляем X-образные метки на траектории
        for (let i = 0; i < flightPath.length; i++) {
            if (flightPath[i].multiplier > multiplier) break;
            
            // Создаем X-образную метку
            const xMark = document.createElement('div');
            xMark.className = 'trajectory-point';
            xMark.style.left = `${flightPath[i].x}%`;
            xMark.style.bottom = `calc(50% + ${Math.min(35, (flightPath[i].multiplier - 1) * 10)}%)`;
            
            graphContainer.appendChild(xMark);
            
            // Добавляем значение множителя
            const value = document.createElement('div');
            value.className = 'trajectory-value';
            value.style.left = `${flightPath[i].x}%`;
            value.style.bottom = `calc(50% + ${Math.min(35, (flightPath[i].multiplier - 1) * 10) + 15}px)`;
            value.textContent = `${flightPath[i].multiplier.toFixed(1)}x`;
            
            graphContainer.appendChild(value);
        }
    }
}

function showExplosion() {
    const explosionContainer = document.getElementById('explosionContainer');
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    
    // Позиционируем взрыв на месте ракеты
    const rocketContainer = document.getElementById('rocketContainer');
    explosion.style.left = rocketContainer.style.left;
    explosion.style.bottom = rocketContainer.style.bottom;
    explosion.style.transform = 'translateX(-50%) translateY(50%)';
    
    explosionContainer.appendChild(explosion);
    
    // Скрываем ракету при взрыве
    const rocketElement = document.getElementById('rocket');
    rocketElement.style.display = 'none';
    
    setTimeout(() => {
        explosionContainer.removeChild(explosion);
        rocketElement.style.display = 'block';
        rocketElement.style.transform = 'translateX(-50%)';
        rocketElement.classList.remove('rocket-pulsing');
        
        // Сбрасываем позицию ракеты
        rocketContainer.style.left = '50%';
        rocketContainer.style.bottom = '50%';
        
        // Очищаем график
        const graphContainer = document.getElementById('graphContainer');
        graphContainer.innerHTML = '';
    }, 1000);
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
            betSpan.style.color = '#00b894';
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

// Демо-режим для тестирования
function startDemoMode() {
    // Имитируем получение данных с сервера
    const demoGameState = {
        status: 'counting',
        multiplier: 1.00,
        endBetTime: Date.now() + 15000,
        players: [
            { userId: 123456789, name: 'DemoUser', betAmount: 1, cashedOut: false, isBot: false },
            { userId: 1, name: 'Bot1', betAmount: 2.5, cashedOut: false, isBot: true },
            { userId: 2, name: 'Bot2', betAmount: 1.8, cashedOut: false, isBot: true }
        ],
        history: [
            { multiplier: 3.45 },
            { multiplier: 1.23 },
            { multiplier: 8.91 },
            { multiplier: 2.67 },
            { multiplier: 5.32 }
        ],
        crashPoint: 0
    };
    
    updateGameState(demoGameState);
    
    // Запускаем демо-полет через 15 секунд
    setTimeout(() => {
        startDemoFlight();
    }, 15000);
}

function startDemoFlight() {
    let multiplier = 1.00;
    const flightInterval = setInterval(() => {
        multiplier += 0.05 + (Math.random() * 0.1);
        
        // Обновляем состояние игры
        const demoGameState = {
            status: 'flying',
            multiplier: multiplier,
            endBetTime: 0,
            players: [
                { userId: 123456789, name: 'DemoUser', betAmount: 1, cashedOut: false, isBot: false },
                { userId: 1, name: 'Bot1', betAmount: 2.5, cashedOut: Math.random() > 0.8, isBot: true, winAmount: 2.5 * multiplier, cashoutMultiplier: multiplier },
                { userId: 2, name: 'Bot2', betAmount: 1.8, cashedOut: Math.random() > 0.7, isBot: true, winAmount: 1.8 * multiplier, cashoutMultiplier: multiplier }
            ],
            history: rocketGame.history,
            crashPoint: 0
        };
        
        updateGameState(demoGameState);
        
        // Случайный краш между 1.5x и 10x
        if (multiplier > 1.5 && (Math.random() < 0.02 || multiplier > 10)) {
            clearInterval(flightInterval);
            
            setTimeout(() => {
                const demoGameStateCrashed = {
                    status: 'crashed',
                    multiplier: multiplier,
                    endBetTime: 0,
                    players: demoGameState.players,
                    history: [{ multiplier: multiplier }, ...rocketGame.history.slice(0, 9)],
                    crashPoint: multiplier
                };
                
                updateGameState(demoGameStateCrashed);
                
                // Перезапускаем через 5 секунд
                setTimeout(() => {
                    resetBettingUI();
                    startDemoMode();
                }, 5000);
            }, 1000);
        }
    }, 100);
}

// Глобальная переменная для доступа из WebSocket
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    endBetTime: 0
};