$(document).ready(function() {
    const socket = io(':5000');

    socket.on('connect', function() {
        socket.emit("users");
    });

    socket.on('reconnected', function() {
        alert("Reconnected");
        location.reload();
    });

    socket.on('connect_error', function() {
        alert("Disconnected");
    });

    socket.on('error', (message) => {
        alert(message);
    });

    socket.on('startRoom', (data) => {
        $('#waiting-container').hide();
        $('#room-container').show();
    });

    socket.on('roomCanceled', (data) => {
        alert("The room was canceled because the other player left");
        const { playersCount } = data;

        $('#waiting-container').show();
        $('#room-container').hide();

        $('#playersCount').text(`${playersCount} / 2`);
    });

    socket.on('playerReady', (data) => {
        const { playersReady } = data;

        $('#playersReadyCount').text(playersReady + ' / 2');
    });

    $('#joinPlayerBtn').click(function() {
        const name = $('#playerName').val();

        if (name) socket.emit('joinPlayer', { name });
        else alert('Please enter a name.');
    });

    socket.on('playerjoined', (data) => {
        const { name } = data;

        $('#main-container').show();
        $('#join-player').hide();

        $('.playerName').text("Name: " + name);
    });

    $('#createRoomBtn').click(function() {
        const roomName = $('#roomName').val();
        
        if (roomName) socket.emit('createRoom', { roomName });
        else alert('Please enter a room name.');
    });

    socket.on('roomCreated', (data) => {
        const { roomId } = data;

        $('#main-container').hide();
        $('#waiting-container').show();

        $('#waitingRoomId').text(roomId);
    });

    $('#joinRoomBtn').click(function() {
        const roomId = $('#roomId').val();

        if (roomId) socket.emit('joinRoom', { roomId });
        else alert('Please enter a room ID.');
    });

    $('#leaveRoomBtn').click(function() {
        socket.emit('leaveRoom');
        $('#waiting-container').hide();
        $('#main-container').show();
    });

    $(document).on('click', '.readyBtn', function(){
        socket.emit('playerReady');

        $(this).addClass('btn-cancel cancelBtn').removeClass('btn-ready readyBtn').text('Cancel');
    });

    $(document).on('click', '.cancelBtn', function(){
        socket.emit('playerCancel');

        $(this).addClass('btn-ready readyBtn').removeClass('btn-cancel cancelBtn').text('Ready');
    });

    socket.on('playerJoined', (data) => {
        const { playersCount } = data;

        $('#playersCount').text(`${playersCount} / 2`);
    });

    socket.on('playerLeft', (data) => {
        const { playersCount } = data;

        $('#playersCount').text(`${playersCount} / 2`);
    });

    socket.on('roomJoined', (data) => {
        const { roomId, playersCount } = data;

        $('#main-container').hide();
        $('#waiting-container').show();

        $('#waitingRoomId').text(roomId);
        $('#playersCount').text(`${playersCount} / 2`);
    });

    // GAME

    $('#restartButton').click(function() {
        const roomId = $('#waitingRoomId').text();
        socket.emit('restartGame', { roomId });
    });

    socket.on('moveMade', (data) => {
        const { board, currentTurn } = data;
        updateBoard(board);
        setMessage(currentTurn === socket.id ? 'Your turn' : 'Opponent\'s turn');
    });

    socket.on('gameOver', (data) => {
        const { winner, combination } = data;
        setMessage(winner === 'draw' ? 'It\'s a draw!' : (winner === 'x' ? 'X wins!' : 'O wins!'));
        updateWinner(combination, winner);

        $('.cell').off('click');
    });

    socket.on('restartGame', (data) => {
        const { board, currentTurn } = data;
        updateBoard(board);
        setMessage(currentTurn === socket.id ? 'Your turn' : 'Opponent\'s turn');
        $('.cell').on('click', cellClickHandler);
    });

    function cellClickHandler() {
        const index = $(this).index();
        const roomId = $('#waitingRoomId').text();
        socket.emit('makeMove', { roomId, index });
    }

    $('.cell').on('click', cellClickHandler);

    function updateBoard(board) {
        $('.cell').each(function(index) {
            $(this).removeClass('x o winner_x winner_o');
            if (board[index]) {
                $(this).addClass(board[index]);
            }
        });
    }

    function updateWinner(combination, winner){
        $('.cell').each(function(index) {
            for(var i = 0; i < combination.length; i++){
                if(index == combination[i]) $(this).addClass((winner == 'x') ? 'winner_x' : 'winner_o');
            }
        });
    }

    function setMessage(message) {
        $('.message').text(message);
    }
});
