 let ws = null;
        let currentUser = null;
        let isDemoMode = false;
        let userBet = 0;
        let userCashedOut = false;
        let userPlayer = null;
        let rocketPosition = 50;
        let countdownInterval = null;
        let rocketSpeed = 0.1;

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
                console.log('Disconnected from server, reconnecting...');
                setTimeout(connectWebSocket, 3000);
            };
            
            ws.onerror = function(error) {
                console.error('WebSocket error:', error);
            };
        }

        function updateGameState(game) {
            const statusElement = document.getElementById('gameStatus');
            const statusTextElement = document.getElementById('statusText');
            const countdownElement = document.getElementById('countdown');
            
            // Обновляем статус игры
            switch (game.status) {
                case 'waiting':
                    statusElement.className = 'game-status status-waiting';
                    statusTextElement.textContent = 'Ожидание начала игры...';
                    countdownElement.textContent = '';
                    resetRocket();
                    break;
                    
                case 'counting':
                    statusElement.className = 'game-status status-counting';
                    statusTextElement.textContent = 'Запуск через: ';
                    countdownElement.textContent = game.countdown;
                    
                    // Запускаем обратный отсчет с цифровым таймером
                    startCountdown(game.countdown);
                    break;
                    
                case 'flying':
                    statusElement.className = 'game-status status-flying';
                    statusTextElement.textContent = 'Ракета взлетает!';
                    countdownElement.textContent = '';
                    
                    // Скрываем цифровой таймер
                    document.getElementById('countdownTimer').style.display = 'none';
                    
                    // Запускаем ракету
                    launchRocket(game.multiplier);
                    break;
                    
                case 'crashed':
                    statusElement.className = 'game-status status-crashed';
                    statusTextElement.textContent = `Ракета взорвалась на ${game.crashPoint.toFixed(2)}x`;
                    countdownElement.textContent = '';
                    
                    // Показываем анимацию "КРАХ"
                    showCrashAnimation();
                    break;
            }
            
            // Обновляем список игроков
            updatePlayersList(game.players);
            
            // Обновляем историю игр
            updateGameHistory(game.history);
        }

        function startCountdown(seconds) {
            // Очищаем предыдущий интервал
            if (countdownInterval) {
                clearInterval(countdownInterval);
            }
            
            // Показываем цифровой таймер
            const countdownTimer = document.getElementById('countdownTimer');
            countdownTimer.textContent = seconds;
            countdownTimer.style.display = 'block';
            
            // Запускаем обратный отсчет
            let currentTime = seconds;
            countdownInterval = setInterval(() => {
                currentTime--;
                countdownTimer.textContent = currentTime;
                
                if (currentTime <= 0) {
                    clearInterval(countdownInterval);
                    countdownTimer.style.display = 'none';
                }
            }, 1000);
        }

        function launchRocket(multiplier) {
            const rocket = document.getElementById('rocket');
            const trail = document.getElementById('rocketTrail');
            const multiplierDisplay = document.getElementById('multiplierDisplay');
            
            // Сбрасываем позицию ракеты
            rocket.style.bottom = '50px';
            trail.style.height = '0px';
            
            // Анимируем взлет ракеты
            let position = 50;
            let speed = 0.1;
            let crashed = false;
            
            function animateRocket() {
                if (crashed) return;
                
                position += speed;
                speed *= 1.02; // Увеличиваем скорость
                
                rocket.style.bottom = `${position}px`;
                trail.style.height = `${position - 50}px`;
                
                // Обновляем множитель
                const currentMultiplier = Math.pow(1.05, (position - 50) / 10);
                multiplierDisplay.textContent = currentMultiplier.toFixed(2) + 'x';
                
                // Проверяем, не взорвалась ли ракета
                if (Math.random() < 0.005 * (currentMultiplier / 10)) {
                    crashed = true;
                    // Отправляем сообщение о взрыве
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'rocket_crash',
                            crashPoint: currentMultiplier
                        }));
                    }
                    return;
                }
                
                requestAnimationFrame(animateRocket);
            }
            
            animateRocket();
        }

        function showCrashAnimation() {
            const crashAnimation = document.getElementById('crashAnimation');
            const countdownTimer = document.getElementById('countdownTimer');
            
            // Скрываем цифровой таймер
            countdownTimer.style.display = 'none';
            
            // Показываем анимацию "КРАХ"
            crashAnimation.style.display = 'block';
            
            // Через 3 секунды скрываем анимацию
            setTimeout(() => {
                crashAnimation.style.display = 'none';
            }, 3000);
        }

        function resetRocket() {
            const rocket = document.getElementById('rocket');
            const trail = document.getElementById('rocketTrail');
            const multiplierDisplay = document.getElementById('multiplierDisplay');
            const crashAnimation = document.getElementById('crashAnimation');
            const countdownTimer = document.getElementById('countdownTimer');
            
            // Сбрасываем позицию ракеты
            rocket.style.bottom = '50px';
            trail.style.height = '0px';
            multiplierDisplay.textContent = '1.00x';
            
            // Скрываем анимации
            crashAnimation.style.display = 'none';
            countdownTimer.style.display = 'none';
            
            // Сбрасываем состояние пользователя
            userBet = 0;
            userCashedOut = false;
            document.getElementById('userBet').textContent = '0';
            document.getElementById('potentialWin').textContent = '0';
            document.getElementById('cashoutButton').disabled = true;
        }

        function updatePlayersList(players) {
            const playersList = document.getElementById('playersList');
            const playersCount = document.getElementById('playersCount');
            
            playersList.innerHTML = '';
            playersCount.textContent = players.length;
            
            players.forEach(player => {
                const playerItem = document.createElement('div');
                playerItem.className = 'player-item';
                
                const playerName = document.createElement('span');
                playerName.className = 'player-name';
                playerName.textContent = player.username;
                
                const playerBet = document.createElement('span');
                playerBet.className = 'player-bet';
                
                if (player.cashedOut) {
                    playerBet.textContent = `+${(player.bet * player.cashoutMultiplier).toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
                    playerBet.style.color = '#00b894';
                } else if (player.crashed) {
                    playerBet.textContent = `-${player.bet.toFixed(2)} TON (0x)`;
                    playerBet.style.color = '#d63031';
                } else {
                    playerBet.textContent = `${player.bet.toFixed(2)} TON (в игре)`;
                    playerBet.style.color = '#fdcb6e';
                }
                
                playerItem.appendChild(playerName);
                playerItem.appendChild(playerBet);
                playersList.appendChild(playerItem);
                
                if (player.id === currentUser.id) {
                    userPlayer = player;
                }
            });
        }

        function updateGameHistory(history) {
            const historyItems = document.getElementById('historyItems');
            historyItems.innerHTML = '';
            
            history.slice(-10).reverse().forEach(game => {
                const historyItem = document.createElement('div');
                historyItem.className = `history-item ${game.crashPoint >= 2 ? 'history-win' : 'history-loss'}`;
                historyItem.textContent = `${game.crashPoint.toFixed(2)}x`;
                historyItems.appendChild(historyItem);
            });
        }

        function placeBet() {
            const betAmount = parseFloat(document.getElementById('betAmount').value);
            
            if (isNaN(betAmount) || betAmount <= 0) {
                alert('Введите корректную сумму ставки');
                return;
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'rocket_bet',
                    userId: currentUser.id,
                    username: currentUser.username,
                    betAmount: betAmount,
                    demoMode: isDemoMode
                }));
                
                userBet = betAmount;
                document.getElementById('userBet').textContent = betAmount.toFixed(2);
                document.getElementById('cashoutButton').disabled = false;
            }
        }

        function cashout() {
            if (userBet > 0 && !userCashedOut) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'rocket_cashout',
                        userId: currentUser.id
                    }));
                    
                    userCashedOut = true;
                    document.getElementById('cashoutButton').disabled = true;
                }
            }
        }

        function toggleAutoBet() {
            const autoBetToggle = document.getElementById('autoBetToggle');
            // Логика автоставки
        }

        function updateAutoBetAmount() {
            const autoBetAmount = document.getElementById('autoBetAmount');
            // Обновление суммы автоставки
        }

        function toggleAutoCashout() {
            const autoCashoutToggle = document.getElementById('autoCashoutToggle');
            // Логика автовывода
        }

        function updateAutoCashoutMultiplier() {
            const autoCashoutMultiplier = document.getElementById('autoCashoutMultiplier');
            // Обновление множителя автовывода
        }