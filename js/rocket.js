
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
    
    // Убираем все inline стили позиционирования, чтобы работал CSS
    rocketElement.style.bottom = '';
    rocketElement.style.left = '';
    rocketElement.style.transform = '';
    
    // Обновляем след ракеты в зависимости от множителя
    const trailHeight = Math.min(multiplier * 20, 250);
    trailElement.style.height = `${trailHeight}px`;
    
    // Добавляем анимацию полета
    if (multiplier > 1.1) {
        rocketImg.classList.add('rocket-flying');
    } else {
        rocketImg.classList.remove('rocket-flying');
    }
}

    function showExplosion() {
        const explosionElement = document.getElementById('explosion');
        explosionElement.style.display = 'flex';
        
        setTimeout(() => {
            explosionElement.style.display = 'none';
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

    function updateBettingUI() {
        const betButton = document.getElementById('placeBetButton');
        const cashoutButton = document.getElementById('cashoutButton');
        
        if (!rocketGame) return;
        
        if (rocketGame.status === 'waiting' || rocketGame.status === 'counting') {
            betButton.disabled = false;
            cashoutButton.disabled = true;
        } else if (rocketGame.status === 'flying') {
            betButton.disabled = true;
            cashoutButton.disabled = userBet === 0 || userCashedOut;
        } else {
            betButton.disabled = true;
            cashoutButton.disabled = true;
        }
    }

    function resetBettingUI() {
        userBet = 0;
        userCashedOut = false;
        document.getElementById('userBet').textContent = '0';
        document.getElementById('potentialWin').textContent = '0';
        document.getElementById('placeBetButton').disabled = false;
        document.getElementById('cashoutButton').disabled = true;
    }

    async function placeBet() {
        const betAmount = parseFloat(document.getElementById('betAmount').value);
        
        if (isNaN(betAmount) || betAmount <= 0) {
            alert('Пожалуйста, введите корректную сумму ставки');
            return;
        }
        
        if (betAmount < 0.5 || betAmount > 50) {
            alert('Сумма ставки должна быть от 0.5 до 50 TON');
            return;
        }
        
        try {
            const response = await fetch('/api/rocket/bet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: currentUser.id,
                    betAmount: betAmount,
                    isDemo: isDemoMode
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    userBet = betAmount;
                    document.getElementById('userBet').textContent = betAmount.toFixed(2);
                    updateBettingUI();
                } else {
                    alert(result.message || 'Ошибка при размещении ставки');
                }
            } else {
                alert('Ошибка при размещении ставки');
            }
        } catch (error) {
            console.error('Error placing bet:', error);
            alert('Ошибка при размещении ставки');
        }
    }

    async function cashout() {
        if (userBet === 0 || userCashedOut) return;
        
        try {
            const response = await fetch('/api/rocket/cashout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: currentUser.id,
                    isDemo: isDemoMode
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    userCashedOut = true;
                    document.getElementById('cashoutButton').disabled = true;
                    document.getElementById('potentialWin').textContent = result.winAmount.toFixed(2);
                    alert(`Вы успешно забрали ${result.winAmount.toFixed(2)} TON!`);
                } else {
                    alert(result.message || 'Ошибка при выводе средств');
                }
            } else {
                alert('Ошибка при выводе средств');
            }
        } catch (error) {
            console.error('Error cashing out:', error);
            alert('Ошибка при выводе средств');
        }
    }

    // Глобальная переменная для хранения состояния игры
    let rocketGame = null;
