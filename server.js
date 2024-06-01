const express = require('express');
const app = express();
const http = require('http');
const socket = require('socket.io');

const fs = require('fs');
const path = require('path');

const server = http.createServer(app);
const port = process.env.SERVER_PORT || 5000;

// SOCKET CONNECTION
const io = socket(server);

// BUILT-IN MIDDLEWARE FOR JSON
app.use(express.json());

// SERVE STATIC FILES
app.use(express.static(path.join(__dirname, '/public')));

// ROUTES
app.use('/', require('./routes/root'));

app.all('*', (req, res) => {
	res.status(404);

	if(req.accepts('html')) res.sendFile(path.join(__dirname, 'views', '404.html'));
	else if(req.accepts('json')) res.json({error: "Error 404: The page not found"});
	else res.type('txt').send('<h1>Error 404: The page not found</h1>');
})

server.listen(port, function(){
	console.log('Server started on port ' + port);
});

let players = [];
const rooms = {};

io.on('connection', async function(socket) {
    console.log('New client connected:', socket.id);

    let startTimeout;

    socket.on('joinPlayer', (data) => {
        const { name } = data;

        const nameExists = players.some(player => player.name === name);
        if (nameExists) return socket.emit('error', 'This name already exists');

        const id = players.length + 1;
        players.push({
            id: socket.id,
            player_id: id,
            name: name
        });
        socket.emit('playerjoined', { name });
        console.log(`Player joined: ${id}`);
    });

    socket.on('createRoom', (data) => {
        const { name } = data;
        const roomId = Math.random().toString(36).substring(2, 10);

        const player = players.find(player => player.id === socket.id);

        rooms[roomId] = {
            id: roomId,
            name: name,
            players: [{ 
                id: player.id,
                player_id: player.player_id,
                name: player.name,
                ready: 0
            }],
            marks: { [socket.id]: 'x' },
            board: Array(9).fill(null),
            currentTurn: socket.id,
            started: 0
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
        console.log(`Room created: ${roomId}`);
    });

    socket.on('joinRoom', (data) => {
        const { roomId } = data;
        const room = rooms[roomId];

        if (room) {
            if (room.players.length >= 2) {
                socket.emit('error', 'Room is full');
            } else {
                const player = players.find(player => player.id === socket.id);
                room.players.push({ 
                    id: player.id,
                    player_id: player.player_id,
                    name: player.name,
                    ready: 0
                });
                room.marks[socket.id] = 'o';
                socket.join(roomId);
                io.to(roomId).emit('playerJoined', { playersCount: room.players.length });
                socket.emit('roomJoined', { roomId, playersCount: room.players.length });
            }
        } else {
            socket.emit('error', 'Room ID not found');
        }
    });

    socket.on('leaveRoom', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            room.players = room.players.filter(player => player.id !== socket.id);

            if (room.players.length === 0) delete rooms[roomId];
            else io.to(roomId).emit('playerLeft', { playersCount: room.players.length });
        }
    });

    socket.on('playerReady', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(player => player.id === socket.id);
    
            if (playerIndex !== -1) {
                room.players[playerIndex].ready = 1;
    
                const playersReady = room.players.filter(player => player.ready === 1).length;
                io.to(roomId).emit('playerReady', { playersReady });
                
                const allPlayersReady = room.players.every(player => player.ready === 1);
                const roomIsFull = room.players.length === 2;

                if (allPlayersReady && roomIsFull) {
                    startTimeout = setTimeout(() => {
                        rooms[roomId].started = 1;
                        io.to(roomId).emit('startRoom');
                    }, 5000);
                } else {
                    clearTimeout(startTimeout);
                }
    
                break;
            }
        }
    });

    socket.on('playerCancel', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(player => player.id === socket.id);
    
            if (playerIndex !== -1) {
                room.players[playerIndex].ready = 0;
    
                const playersReady = room.players.filter(player => player.ready === 1).length;
                io.to(roomId).emit('playerReady', { playersReady });
                
                clearTimeout(startTimeout);
    
                break;
            }
        }
    });

    socket.on('makeMove', (data) => {
        const { roomId, index } = data;
        const room = rooms[roomId];

        if (room && room.board[index] === null && room.currentTurn === socket.id) {
            room.board[index] = room.marks[socket.id];

            room.currentTurn = room.players.find(player => player.id !== socket.id).id;
            io.to(roomId).emit('moveMade', { board: room.board, currentTurn: room.currentTurn });

            const winResult = checkWin(room.board);
            if (winResult) {
                const { winner, combination } = winResult;

                io.to(roomId).emit('gameOver', { winner, combination });
            } else if (room.board.every(cell => cell !== null)) {
                io.to(roomId).emit('gameOver', { winner: 'draw' });
            }
        }
    });

    socket.on('restartGame', (data) => {
        const { roomId } = data;
        const room = rooms[roomId];
        if (room) {
            room.board = Array(9).fill(null);
            room.currentTurn = room.players[0].id;
            io.to(roomId).emit('restartGame', { board: room.board, currentTurn: room.currentTurn });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    
        const playerIdToRemove = players.findIndex(player => player.id === socket.id);
        if (playerIdToRemove !== -1) {
            players = players.filter(player => player.id !== socket.id);
            players.forEach(player => {
                if (player.player_id > playerIdToRemove) {
                    player.player_id--;
                }
            });
        }
    
        for (const roomId in rooms) {
            const room = rooms[roomId];

            if (room) {
                room.players = room.players.filter(player => player.id !== socket.id);
    
                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else {
                    io.to(roomId).emit('playerLeft', { playersCount: room.players.length });
                    
                    if (room.started === 1) {
                        room.started = 0;
                        socket.to(roomId).emit('roomCanceled', { playersCount: room.players.length });
                    }
                }
            }
        }
    });

    socket.on('reconnected', (data) => {
        socket.emit('reconnected', { id: socket.id });
    });

    function checkWin(board) {
        const winningCombinations = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6]
        ];

        for (const combination of winningCombinations) {
            const [a, b, c] = combination;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return { winner: board[a], combination };
            }
        }
        return null;
    }
});

io.on("connect_error", (err) => {
	console.log(`connect_error due to ${err.message}`);
});