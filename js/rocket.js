// Здесь будет ваш код из rocket.js
let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 50;
let countdownInterval = null;
let flightInterval = null;

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
        document.getElementById('demo-badge').textContent = 'DEMO';
        document.getElementById('balance').textContent = '1000.00';
    }
    
    // Инициализация интерфейса
    updatePlayersList([]);
    updateHistory([]);
    
    // Настройка обработчиков событий
    document.getElementById('betAmount').addEventListener('input', updatePotentialWin);
    
    // Запуск анимации фона
    animateBackground();
}

function connectWebSocket() {
    // В реальном приложении здесь будет подключение к WebSocket серверу
    console.log("WebSocket подключение эмулируется");
    
    // Эмуляция получения данных от сервера
    setTimeout(() => {
        updateGameStatus('waiting');
    }, 1000);
}

function loadUserData() {
    // В реальном приложении здесь будет загрузка данных пользователя
    document.getElementById('balance').textContent = '500.00';
}

function updateGameStatus(status) {
    const statusElement = document.getElementById('gameStatus');
    const statusText = document.getElementById('statusText');
    
    statusElement.classList.remove('status-waiting', 'status-counting', 'status-flying', 'status-crashed');
    
    switch(status) {
        case 'waiting':
            statusElement.classList.add('status-waiting');
            statusText.textContent = 'Ожидание начала игры...';
            document.getElementById('placeBetButton').disabled = false;
            document.getElementById('cashoutButton').disabled = true;
            hideCountdown();
            resetRocket();
            break;
        case 'counting':
            statusElement.classList.add('status-counting');
            statusText.textContent = 'Игра начнется через:';
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('cashoutButton').disabled = true;
            showCountdown();
            break;
        case 'flying':
            statusElement.classList.add('status-flying');
            statusText.textContent = 'Ракета в полете!';
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('cashoutButton').disabled = false;
            hideCountdown();
            launchRocket();
            break;
        case 'crashed':
            statusElement.classList.add('status-crashed');
            statusText.textContent = 'Ракета взорвалась!';
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('cashoutButton').disabled = true;
            break;
    }
}

function placeBet() {
    const betAmount = parseFloat(document.getElementById('betAmount').value);
    
    if (isNaN(betAmount) || betAmount <= 0) {
        alert('Введите корректную сумму ставки');
        return;
    }
    
    const balance = parseFloat(document.getElementById('balance').textContent);
    if (betAmount > balance) {
        alert('Недостаточно средств на балансе');
        return;
    }
    
    userBet = betAmount;
    userCashedOut = false;
    
    // Обновляем интерфейс
    document.getElementById('userBet').textContent = betAmount.toFixed(2);
    updatePotentialWin();
    
    // В реальном приложении здесь будет отправка ставки на сервер
    console.log(`Ставка размещена: ${betAmount}`);
    
    // Эмуляция начала обратного отсчета
    updateGameStatus('counting');
    startCountdown();
}

function cashout() {
    if (userBet === 0 || userCashedOut) return;
    
    userCashedOut = true;
    const currentMultiplier = parseFloat(document.getElementById('multiplierDisplay').textContent.replace('x', ''));
    const winAmount = userBet * currentMultiplier;
    
    // Обновляем баланс
    const balance = parseFloat(document.getElementById('balance').textContent);
    document.getElementById('balance').textContent = (balance + winAmount).toFixed(2);
    
    // Показываем сообщение о выигрыше
    alert(`Вы успешно забрали ${winAmount.toFixed(2)}!`);
    
    // Обновляем интерфейс
    document.getElementById('cashoutButton').disabled = true;
    
    // В реальном приложении здесь будет отправка запроса на вывод средств
    console.log(`Вывод средств: ${winAmount}`);
}

function updatePotentialWin() {
    const betAmount = parseFloat(document.getElementById('betAmount').value);
    const currentMultiplier = parseFloat(document.getElementById('multiplierDisplay').textContent.replace('x', ''));
    
    if (isNaN(betAmount) || betAmount <= 0) {
        document.getElementById('potentialWin').textContent = '0.00';
        return;
    }
    
    document.getElementById('potentialWin').textContent = (betAmount * currentMultiplier).toFixed(2);
}

function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';
    
    // Добавляем текущего пользователя
    if (userBet > 0) {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.innerHTML = `
            <span class="player-name">${currentUser.username}</span>
            <span class="player-bet">${userBet.toFixed(2)}</span>
        `;
        playersList.appendChild(playerItem);
    }
    
    // Добавляем других игроков (в демо-режиме)
    if (players.length === 0 && isDemoMode) {
        const demoPlayers = [
            { username: 'Player1', bet: (Math.random() * 10 + 1).toFixed(2) },
            { username: 'Player2', bet: (Math.random() * 10 + 1).toFixed(2) },
            { username: 'Player3', bet: (Math.random() * 10 + 1).toFixed(2) }
        ];
        
        demoPlayers.forEach(player => {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            playerItem.innerHTML = `
                <span class="player-name">${player.username}</span>
                <span class="player-bet">${player.bet}</span>
            `;
            playersList.appendChild(playerItem);
        });
    }
    
    document.getElementById('playersCount').textContent = players.length + (userBet > 0 ? 1 : 0);
}

function updateHistory(history) {
    const historyItems = document.getElementById('historyItems');
    historyItems.innerHTML = '';
    
    // Добавляем демо-историю
    if (history.length === 0 && isDemoMode) {
        const demoHistory = [
            { multiplier: (Math.random() * 5 + 1).toFixed(2), result: 'win' },
            { multiplier: (Math.random() * 3 + 0.1).toFixed(2), result: 'loss' },
            { multiplier: (Math.random() * 8 + 1).toFixed(2), result: 'win' },
            { multiplier: (Math.random() * 2 + 0.1).toFixed(2), result: 'loss' },
            { multiplier: (Math.random() * 10 + 1).toFixed(2), result: 'win' }
        ];
        
        demoHistory.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = `history-item history-${item.result}`;
            historyItem.textContent = `${item.multiplier}x`;
            historyItems.appendChild(historyItem);
        });
    }
}

function startCountdown() {
    let countdown = 5;
    const countdownElement = document.getElementById('countdownNumber');
    countdownElement.textContent = countdown;
    
    // Показываем контейнер с обратным отсчетом
    document.getElementById('countdownContainer').classList.add('visible');
    
    // Скрываем ракетку
    document.getElementById('rocketContainer').style.opacity = '0';
    
    countdownInterval = setInterval(() => {
        countdown--;
        countdownElement.textContent = countdown;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            document.getElementById('countdownContainer').classList.remove('visible');
            document.getElementById('rocketContainer').style.opacity = '1';
            updateGameStatus('flying');
        }
    }, 1000);
}

function hideCountdown() {
    clearInterval(countdownInterval);
    document.getElementById('countdownContainer').classList.remove('visible');
    document.getElementById('rocketContainer').style.opacity = '1';
}

function launchRocket() {
    let currentStep = 0;
    const maxSteps = flightPath.length - 1;
    
    // Очищаем предыдущий полет
    clearInterval(flightInterval);
    
    // Очищаем график
    document.getElementById('graphContainer').innerHTML = '';
    
    // Добавляем зеленую линию
    const greenLine = document.createElement('div');
    greenLine.className = 'green-line';
    document.getElementById('graphContainer').appendChild(greenLine);
    
    // Запускаем полет
    flightInterval = setInterval(() => {
        if (currentStep > maxSteps) {
            clearInterval(flightInterval);
            explodeRocket();
            updateGameStatus('crashed');
            setTimeout(() => {
                updateGameStatus('waiting');
            }, 3000);
            return;
        }
        
        const step = flightPath[currentStep];
        const multiplier = step.multiplier;
        
        // Обновляем множитель
        document.getElementById('multiplierDisplay').textContent = multiplier.toFixed(2) + 'x';
        updatePotentialWin();
        
        // Обновляем позицию ракеты
        rocketPosition = step.x;
        document.getElementById('rocketContainer').style.bottom = `${rocketPosition}%`;
        
        // Добавляем точку на график
        addTrajectoryPoint(step.x, multiplier);
        
        // Анимации для ракеты при достижении определенных множителей
        const rocket = document.getElementById('rocket');
        
        if (multiplier >= 3 && multiplier < 5) {
            // Поворачиваем ракету на 50 градусов
            rocket.style.transform = 'translateX(-50%) rotate(50deg)';
        } else if (multiplier >= 5) {
            // Поворачиваем ракету полностью и добавляем пульсацию
            rocket.style.transform = 'translateX(-50%) rotate(90deg)';
            rocket.classList.add('rocket-pulsing');
        } else {
            // Сбрасываем анимации
            rocket.style.transform = 'translateX(-50%) rotate(0deg)';
            rocket.classList.remove('rocket-pulsing');
        }
        
        currentStep++;
    }, 800); // Скорость полета
}

function resetRocket() {
    clearInterval(flightInterval);
    document.getElementById('multiplierDisplay').textContent = '1.00x';
    document.getElementById('rocketContainer').style.bottom = '50%';
    
    // Сбрасываем анимации ракеты
    const rocket = document.getElementById('rocket');
    rocket.style.transform = 'translateX(-50%) rotate(0deg)';
    rocket.classList.remove('rocket-pulsing');
    
    // Очищаем график
    document.getElementById('graphContainer').innerHTML = '';
    
    // Очищаем взрыв
    document.getElementById('explosionContainer').innerHTML = '';
}

function explodeRocket() {
    const explosionContainer = document.getElementById('explosionContainer');
    explosionContainer.innerHTML = '';
    
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    explosion.style.left = `${rocketPosition}%`;
    explosionContainer.appendChild(explosion);
    
    // Скрываем ракету
    document.getElementById('rocketContainer').style.opacity = '0';
    
    // Обновляем историю
    const currentMultiplier = parseFloat(document.getElementById('multiplierDisplay').textContent.replace('x', ''));
    const newHistoryItem = {
        multiplier: currentMultiplier.toFixed(2),
        result: currentMultiplier >= 1.5 ? 'win' : 'loss'
    };
    
    // В реальном приложении здесь будет обновление истории на сервере
    updateHistory([newHistoryItem]);
}

function addTrajectoryPoint(x, multiplier) {
    const graphContainer = document.getElementById('graphContainer');
    
    // Создаем точку траектории
    const point = document.createElement('div');
    point.className = 'trajectory-point';
    point.style.left = `${x}%`;
    graphContainer.appendChild(point);
    
    // Добавляем значение множителя (каждую 5-ю точку)
    if (x % 20 === 0) {
        const value = document.createElement('div');
        value.className = 'trajectory-value';
        value.textContent = `${multiplier.toFixed(1)}x`;
        value.style.left = `${x}%`;
        value.style.bottom = `${x + 5}%`;
        graphContainer.appendChild(value);
    }
}

function animateBackground() {
    // Анимация уже реализована через CSS
}

function startDemoMode() {
    // Автоматически размещаем демо-ставку
    document.getElementById('betAmount').value = '5.0';
    placeBet();
}

// Функции для работы с WebSocket (в реальном приложении)
function sendWebSocketMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function handleWebSocketMessage(event) {
    const message = JSON.parse(event.data);
    
    switch(message.type) {
        case 'game_state':
            updateGameStatus(message.state);
            break;
        case 'players_update':
            updatePlayersList(message.players);
            break;
        case 'history_update':
            updateHistory(message.history);
            break;
        case 'rocket_position':
            updateRocketPosition(message.position, message.multiplier);
            break;
        case 'game_result':
            handleGameResult(message.result);
            break;
    }
}

function updateRocketPosition(position, multiplier) {
    // Обновляем позицию ракеты на основе данных с сервера
    rocketPosition = position;
    document.getElementById('rocketContainer').style.bottom = `${position}%`;
    document.getElementById('multiplierDisplay').textContent = multiplier.toFixed(2) + 'x';
    updatePotentialWin();
    
    // Анимации для ракеты
    const rocket = document.getElementById('rocket');
    if (multiplier >= 3 && multiplier < 5) {
        rocket.style.transform = 'translateX(-50%) rotate(50deg)';
    } else if (multiplier >= 5) {
        rocket.style.transform = 'translateX(-50%) rotate(90deg)';
        rocket.classList.add('rocket-pulsing');
    } else {
        rocket.style.transform = 'translateX(-50%) rotate(0deg)';
        rocket.classList.remove('rocket-pulsing');
    }
}

function handleGameResult(result) {
    if (result.crashed) {
        explodeRocket();
        updateGameStatus('crashed');
    }
}