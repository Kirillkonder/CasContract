require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./server/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/admin', require('./server/routes/admin'));
app.use('/api/user', require('./server/routes/user'));
app.use('/api/transactions', require('./server/routes/transactions'));
app.use('/api/mines', require('./server/routes/mines'));

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.send('TON Casino Server is running!');
});

async function startServer() {
    try {
        await initDatabase();
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Demo mode: ${process.env.DEMO_MODE}`);
            console.log(`Bot username: ${process.env.BOT_USERNAME}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();