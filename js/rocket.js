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
    const trailElement = document.getElementById('rocketTrail');
    const rocketImg = rocketElement.querySelector('.rocket-img');
    
    // Фиксированная позиция по центру
    rocketElement.style.left = '50%';
    rocketElement.style.transform = 'translateX(-50%)';
    
    // Вычисляем высоту полета (от 50px до 250px)
    const maxHeight = 300;
    const rocketHeight = 150;
    const availableSpace = maxHeight - rocketHeight - 20;
    
    // Плавное увеличение высоты с множителем
    const newPosition = 50 + (multiplier * 2);
    const boundedPosition = Math.min(newPosition, availableSpace);
    
    rocketElement.style.bottom = `${boundedPosition}px`;
    
    // Обновляем след ракеты
    trailElement.style.height = `${boundedPosition - 40}px`;
    trailElement.style.left = '50%';
    trailElement.style.transform = 'translateX(-50%)';
    
    // Добавляем анимацию полета
    if (multiplier > 1.1) {
        rocketImg.classList.add('rocket-flying');
    } else {
        rocketImg.classList.remove('rocket-flying');
    }
}

    function showExplosion() {
    const rocket = document.getElementById('rocket');
    const explosionContainer = document.getElementById('explosionContainer');
    const explosionImg = explosionContainer.querySelector('.explosion-img');
    
    // Прячем ракету
    rocket.style.display = 'none';
    
    // Показываем взрыв в позиции ракеты
    const rocketRect = rocket.getBoundingClientRect();
    const canvasRect = document.getElementById('rocketCanvas').getBoundingClientRect();
    
    explosionContainer.style.display = 'block';
    explosionContainer.style.left = `${rocketRect.left - canvasRect.left + rocketRect.width / 2}px`;
    explosionContainer.style.top = `${rocketRect.top - canvasRect.top + rocketRect.height / 2}px`;
    
    // Через 1 секунду скрываем взрыв и показываем ракету снова
    setTimeout(() => {
        explosionContainer.style.display = 'none';
        rocket.style.display = 'block';
    }, 1000);
}

    
function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    
    playersList.innerHTML = '';
    playersCount.textContent = players.length;
    
    players.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.name;
        
        const betSpan = document.createElement('span');
        betSpan.className = 'player-bet';
        
        if (player.cashedOut) {
            betSpan.textContent = `${player.cashoutMultiplier.toFixed(2)}x (${player.winAmount.toFixed(2)} TON)`;
            betSpan.style.color = '#00b894';
        } else if (player.betAmount > 0) {
            betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
            betSpan.style.color = '#fdcb6e';
        } else {
            betSpan.textContent = '0 TON';
        }
        
        playerElement.appendChild(nameSpan);
        playerElement.appendChild(betSpan);
        playersList.appendChild(playerElement);
    });
}

    
function updateHistory(history) {
    const historyItems = document.getElementById('historyItems');
    historyItems.innerHTML = '';
    
    history.slice(0, 10).forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${item.crashPoint < 2 ? 'history-loss' : 'history-win'}`;
        historyItem.textContent = `${item.crashPoint.toFixed(2)}x`;
        historyItems.appendChild(historyItem);
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
    document.getElementById('userBet').textContent = '0';
    document.getElementById('potentialWin').textContent = '0';
    document.getElementById('placeBetButton').disabled = false;
    document.getElementById('placeBetButton').textContent = 'Поставить';
    document.getElementById('cashoutButton').disabled = true;
}

    // Глобальная переменная для доступа из WebSocket
    let rocketGame = {
        status: 'waiting',
        multiplier: 1.00,
        endBetTime: 0
    };