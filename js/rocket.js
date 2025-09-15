  let ws = null;
        let currentUser = null;
        let isDemoMode = false;
        let userBet = 0;
        let userCashedOut = false;
        let userPlayer = null;
        let rocketPosition = 80;
        let countdownInterval = null;

        function showButtonLoading(buttonId) {
            const button = document.getElementById(buttonId);
            button.classList.add('loading');
            button.disabled = true;
        }

        function hideButtonLoading(buttonId) {
            const button = document.getElementById(buttonId);
            button.classList.remove('loading');
        }

        // Инициализация
        document.addEventListener('DOMContentLoaded', function() {
            initializeGame();
            setupFixedBetButtons();
        });

        function setupFixedBetButtons() {
            const buttons = document.querySelectorAll('.fixed-bet-button');
            buttons.forEach(button => {
                button.addEventListener('click', function() {
                    // Remove active class from all buttons
                    buttons.forEach(btn => btn.classList.remove('active'));
                    
                    // Add active class to clicked button
                    this.classList.add('active');
                    
                    // Set the bet amount
                    const betAmount = this.getAttribute('data-bet');
                    document.getElementById('betAmount').value = betAmount;
                });
            });
        }

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
            
            // Set initial values to match the screenshot
            document.getElementById('balance').textContent = '195.00';
            document.getElementById('multiplierDisplay').textContent = '1.00x';
            document.getElementById('playersCount').textContent = '5';
        }

        async function loadUserData() {
            try {
                const response = await fetch(`/api/user/balance/${currentUser.id}`);
                if (response.ok) {
                    const userData = await response.json();
                    const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
                    document.getElementById('balance').textContent = balance.toFixed(2);
                    isDemoMode = userData.demo_mode;
                    document.getElementById('demo-badge').style.display = 'none';
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
            rocketGame = gameState;
            
            // Убрали обновление статуса, так как убрали соответствующие элементы
            clearCountdown();
            
            switch(gameState.status) {
                case 'waiting':
                    clearCountdown();
                    resetBettingUI();
                    break;
                    
                case 'counting':
                    // ФИКС: Передаем timeLeft, а не endBetTime
                    startCountdown(gameState.timeLeft || Math.max(0, Math.ceil((gameState.endBetTime - Date.now()) / 1000)));
                    updateBettingUI();
                    break;
                    
                case 'flying':
                    clearCountdown();
                    updateRocketPosition(gameState.multiplier);
                    break;
                    
                case 'crashed':
                    clearCountdown();
                    showExplosion();
                    break;
            }
            
            document.getElementById('multiplierDisplay').textContent = gameState.multiplier.toFixed(2) + 'x';
            
            userPlayer = gameState.players.find(p => p.userId == currentUser.id && !p.isBot);
            
            if (userPlayer) {
                userBet = userPlayer.betAmount;
                userCashedOut = userPlayer.cashedOut;
                document.getElementById('userBet').textContent = userBet.toFixed(2);
                
                if (userCashedOut) {
                    document.getElementById('potentialWin').textContent = userPlayer.winAmount.toFixed(2);
                }
            }
            
            updatePlayersList(gameState.players);
            updateHistory(gameState.history);
            
            if (userBet > 0 && !userCashedOut && gameState.status === 'flying') {
                const potentialWin = userBet * gameState.multiplier;
                document.getElementById('potentialWin').textContent = potentialWin.toFixed(2);
            }
            
            updateBettingUI();
        }

        function startCountdown(timeLeft) {
            clearCountdown();
            
            if (timeLeft <= 0) {
                document.getElementById('placeBetButton').textContent = 'Время вышло';
                document.getElementById('placeBetButton').disabled = true;
            }
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
            const canvasElement = document.getElementById('rocketCanvas');
            
            const trailHeight = Math.max(0, multiplier * 10);
            trailElement.style.height = `${trailHeight}px`;
            
            if (multiplier > 1.00) {
                rocketElement.classList.add('pulsating');
                canvasElement.classList.add('pulsating');
                
                if (multiplier >= 3) {
                    const speedIntensity = Math.min(0.7, (multiplier - 3) / 10);
                    const pulseSpeed = Math.max(0.3, 1.2 - speedIntensity);
                    document.documentElement.style.setProperty('--pulse-speed', `${pulseSpeed}s`);
                } else {
                    document.documentElement.style.setProperty('--pulse-speed', '1.2s');
                }
                
                if (multiplier > 5) {
                    const redIntensity = Math.min(0.3, (multiplier - 5) / 15);
                    canvasElement.style.backgroundColor = `rgba(255, 50, 50, ${redIntensity})`;
                } else {
                    canvasElement.style.backgroundColor = '';
                }
            } else {
                rocketElement.classList.remove('pulsating');
                canvasElement.classList.remove('pulsating');
                canvasElement.style.backgroundColor = '';
                document.documentElement.style.setProperty('--pulse-speed', '1.2s');
            }
        }

        function showExplosion() {
            const canvas = document.getElementById('rocketCanvas');
            const rocketElement = document.getElementById('rocket');
            
            rocketElement.classList.remove('pulsating');
            canvas.classList.remove('pulsating');
            canvas.style.backgroundColor = '';
            
            rocketElement.classList.add('blast-off');
            
            const blastOffText = document.createElement('div');
            blastOffText.className = 'blast-off-text';
            blastOffText.textContent = 'УЛЕТЕЛ!';
            canvas.appendChild(blastOffText);
            
            setTimeout(() => {
                if (blastOffText.parentNode) {
                    canvas.removeChild(blastOffText);
                }
                rocketElement.classList.remove('blast-off');
                rocketElement.style.bottom = '110px';
                rocketElement.style.opacity = '1';
                rocketElement.style.filter = 'none';
            }, 2000);
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
                return;
            }
            
            if (userBet > 0) {
                return;
            }
            
            if (rocketGame.status !== 'counting') {
                return;
            }
            
            const timeLeft = Math.max(0, Math.ceil((rocketGame.endBetTime - Date.now()) / 1000));
            
            if (timeLeft <= 0) {
                return;
            }
            
            showButtonLoading('placeBetButton');
            
            try {
                const response = await fetch('/api/rocket/bet', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
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
            } finally {
                hideButtonLoading('placeBetButton');
            }
        }

        async function cashout() {
            if (userBet <= 0 || userCashedOut) {
                return;
            }
            
            if (rocketGame.status !== 'flying') {
                return;
            }
            
            showButtonLoading('cashoutButton');
            
            try {
                const response = await fetch('/api/rocket/cashout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
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
                        updateBettingUI();
                    } else {
                        alert(result.message || 'Ошибка при выводе средств');
                    }
                } else {
                    alert('Ошибка при выводе средств');
                }
            } catch (error) {
                console.error('Error cashing out:', error);
                alert('Ошибка при выводе средств');
            } finally {
                hideButtonLoading('cashoutButton');
            }
        }

        function updateBettingUI() {
            const placeBetButton = document.getElementById('placeBetButton');
            const cashoutButton = document.getElementById('cashoutButton');
            
            if (userBet > 0) {
                placeBetButton.disabled = true;
                placeBetButton.querySelector('.button-text').textContent = 'Ставка сделана';
                
                if (rocketGame.status === 'flying' && !userCashedOut) {
                    cashoutButton.disabled = false;
                } else {
                    cashoutButton.disabled = true;
                }
                
                if (userCashedOut) {
                    cashoutButton.disabled = true;
                    cashoutButton.querySelector('.button-text').textContent = 'Выплачено';
                }
            } else {
                placeBetButton.disabled = rocketGame.status !== 'counting';
                placeBetButton.querySelector('.button-text').textContent = 'Сделать ставку';
                cashoutButton.disabled = true;
            }
            
            if (rocketGame.status === 'waiting' || rocketGame.status === 'crashed') {
                userBet = 0;
                userCashedOut = false;
                placeBetButton.disabled = false;
                placeBetButton.querySelector('.button-text').textContent = 'Сделать ставку';
                cashoutButton.disabled = true;
                cashoutButton.querySelector('.button-text').textContent = 'Забрать выигрыш';
            }
        }

        function resetBettingUI() {
            userBet = 0;
            userCashedOut = false;
            
            const placeBetButton = document.getElementById('placeBetButton');
            const cashoutButton = document.getElementById('cashoutButton');
            
            placeBetButton.disabled = false;
            placeBetButton.querySelector('.button-text').textContent = 'Сделать ставку';
            
            cashoutButton.disabled = true;
            cashoutButton.querySelector('.button-text').textContent = 'Забрать выигрыш';
            
            document.getElementById('userBet').textContent = '0 TON';
            document.getElementById('potentialWin').textContent = '0 TON';
        }

        // Глобальная переменная для состояния игры (для демонстрации)
        let rocketGame = {
            status: 'waiting',
            multiplier: 1.00,
            players: [],
            history: [
                { multiplier: 1.00 },
                { multiplier: 1.75 },
                { multiplier: 2.75 },
                { multiplier: 12.10 },
                { multiplier: 7.51 },
                { multiplier: 4.33 }
            ]
        };