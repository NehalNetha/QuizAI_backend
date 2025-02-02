import { Server, Socket } from 'socket.io';

interface Player {
 id: string;
 name: string;
 score: number;
 currentAnswer?: string;
}

interface GameRoom {
 hostId: string;
 players: Player[];
 quiz?: any;
 currentQuestion: number;
 timeRemaining: number;
 gameState: 'waiting' | 'countdown' | 'playing' | 'finished' | 'leaderboard' | 'answer_reveal'| 'finished';
 timer?: NodeJS.Timeout;
 settings?: any;
 currentCountdown?: number;

}

const gameRooms = new Map<string, GameRoom>();

export const initializeGameSockets = (io: Server) => {
 io.on('connection', (socket: Socket) => {

     socket.on('create-game', (quizData: any) => {
         const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

         const normalizedQuestions = quizData.questions.map((q: any) => ({
             ...q,
             id: q.id || Math.random().toString(36).substr(2, 9),
             correct_answer: q.correctAnswer // Map correctAnswer to correct_answer
         }));

        
         gameRooms.set(roomCode, {
             hostId: socket.id,
             players: [{
                 id: socket.id,
                 name: 'Host',
                 score: 0
             }],
             quiz: {
                 ...quizData,
                 questions: normalizedQuestions
             },
             currentQuestion: 0,
             timeRemaining: 30,
             gameState: 'waiting'
         });

         socket.join(roomCode);
         socket.emit('game-created', { roomCode });
     });

     // Join an existing game room
     socket.on('join-game', async (roomCode: string, playerName: string) => {
         const room = gameRooms.get(roomCode);

         if (!room) {
             socket.emit('join-error', { message: 'Game room not found' });
             return;
         }

         // Add player with their name
         room.players.push({
             id: socket.id,
             name: playerName,
             score: 0
         });

         // Update total players in dashboard stats

         socket.join(roomCode);

         socket.emit('joined-game', {
             roomCode,
             playerCount: room.players.length,
             players: room.players
         });

         // Notify other players in the room
         socket.to(roomCode).emit('player-joined', {
             playerCount: room.players.length,
             playerName,
             playerId: socket.id
         });
     });

     socket.on('disconnect', () => {
        // Find the room where this socket is either a host or player
        for (const [roomCode, room] of gameRooms.entries()) {
            // Check if the disconnected socket was the host
            if (room.hostId === socket.id) {
                // Notify all players in the room that the game has ended
                io.to(roomCode).emit('game-ended', {
                    message: 'Host has left the game'
                });

                // Remove all players from the room
                const playersInRoom = [...io.sockets.adapter.rooms.get(roomCode) || []];
                playersInRoom.forEach(playerId => {
                    const playerSocket = io.sockets.sockets.get(playerId);
                    if (playerSocket) {
                        playerSocket.leave(roomCode);
                    }
                });

                // Clear any existing timers
                if (room.timer) {
                    clearTimeout(room.timer);
                }

                // Delete the room
                gameRooms.delete(roomCode);
                return;
            }

            // If it's a player disconnecting, remove them from the room
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                socket.leave(roomCode);

                // Notify remaining players about the player leaving
                io.to(roomCode).emit('player-left', {
                    playerId: socket.id,
                    players: room.players.filter(p => p.id !== room.hostId) // Don't include host in player list
                });
            }
        }
    });

     socket.on('start-game', ({ roomCode, questions, settings }) => {
         const room = gameRooms.get(roomCode);
         if (room && socket.id === room.hostId) {
             
             let countdown = 5;
             
             // Emit countdown every second
             const countdownInterval = setInterval(() => {
                 io.to(roomCode).emit('countdown', { count: countdown });
                 countdown--;
                 
                 if (countdown < 0) {
                     clearInterval(countdownInterval);

                     
                     // Start actual game after countdown
                     room.gameState = 'playing';
                     room.currentQuestion = 0;
                     room.timeRemaining = settings?.timeLimit || 30;
                     room.settings = settings;
                     room.quiz = { questions };
                     
                     startGameTimer(io, roomCode, room);
                     
                     io.to(roomCode).emit('game-state', { 
                         questions: room.quiz.questions,
                         currentQuestion: room.currentQuestion,
                         timeRemaining: room.timeRemaining,
                         players: room.players
                     });
                 }
             }, 1000);
                //  io.to(roomCode).emit('countdown')
         }
     });
     
     socket.on('join-game-session', ({ roomCode, playerName, isHost }) => {
         const room = gameRooms.get(roomCode);

         if (!room) {
             console.error('Room not found:', roomCode);
             socket.emit('join-error', { message: 'Game room not found' });
             return;
         }

         socket.join(roomCode);

         // If this is the host joining, update the hostId
         if (isHost) {
             console.log('[Server] Host joined with socket ID:', socket.id);
             room.hostId = socket.id;
             
             // Send current game state to host
             if (room.quiz && room.gameState === 'playing') {
                 socket.emit('game-state', {
                     questions: room.quiz.questions,
                     currentQuestion: room.currentQuestion,
                     timeRemaining: room.timeRemaining,
                     players: room.players
                 });
             }
         }

         const existingPlayerIndex = room.players.findIndex(p => p.name === playerName);
         if (existingPlayerIndex === -1) {
             room.players.push({
                 id: socket.id,
                 name: playerName,
                 score: 0
             });
         } else {
             room.players[existingPlayerIndex].id = socket.id;
         }

         socket.emit('game-state', {
             questions: room.quiz.questions,
             currentQuestion: 0,
             timeRemaining: 30,
             players: room.players
         });

         socket.to(roomCode).emit('player-joined', {
             playerCount: room.players.length,
             playerName,
             playerId: socket.id
         });
     });

     socket.on('submit-answer', ({ roomCode, answer, questionId, timeLeft,playerName }) => {
        console.log('[Server] Received answer submission:', {
            roomCode,
            answer,
            questionId,
            timeLeft,
            playerId: socket.id,
            playerName,
            rooms: Array.from(socket.rooms) // Log all rooms this socket is in
        });
    
     
         const room = gameRooms.get(roomCode);
         if (!room) {
             console.log('[Server] Room not found:', roomCode);
             return;
         }
     
         if (socket.id === room.hostId) {
             console.log('[Server] Host tried to submit answer - ignored');
             return;
         }
     
         const player = room.players.find(p => p.id === socket.id);
         if (!player) {
             console.log('[Server] Player not found in room:', socket.id);
             return;
         }
     
         const currentQuestion = room.quiz.questions[room.currentQuestion];
         console.log('[Server] Current question:', currentQuestion);
     
         if (currentQuestion.id === questionId) {
             player.currentAnswer = answer;
             // Fix: Use correct_answer instead of correctAnswer
             const isCorrect = answer === currentQuestion.correctAnswer;
             const basePoints = 1000;
             const timeBonus = Math.floor((timeLeft / 30) * 1000);
             const points = isCorrect ? basePoints + timeBonus : 0;
             player.score += points;
     
             console.log('[Server] Answer submitted:', {
                 playerName: player.name,
                 submittedAnswer: answer,
                 correctAnswer: currentQuestion.correctAnswer, // Fix: Use correct_answer
                 isCorrect,
                 points,
                 currentScore: player.score,
                 answerDistribution: getAnswerDistribution(room) // Add this log
             });
     
             const leaderboard = getLeaderboard(room);
             console.log('[Server] Updated leaderboard:', leaderboard);
     
             io.to(roomCode).emit('answer-submitted', {
                 playerName: player.name,
                 answer,
                 isCorrect,
                 points,
                 correctAnswer: currentQuestion.correctAnswer, // Fix: Use correct_answer
                 leaderboard,
                 answerDistribution: getAnswerDistribution(room) // Add distribution data
             });
         }
     });

     

     // Handle disconnection
     socket.on('disconnect', () => {
         for (const [roomCode, room] of gameRooms.entries()) {
             const playerIndex = room.players.findIndex(p => p.id === socket.id);
             if (playerIndex !== -1) {
                 const player = room.players[playerIndex];
                 room.players.splice(playerIndex, 1);

                 if (room.players.length === 0) {
                     gameRooms.delete(roomCode);
                 } else {
                     io.to(roomCode).emit('player-left', {
                         playerCount: room.players.length,
                         playerId: socket.id,
                         playerName: player.name
                     });
                 }
             }
         }
     });


     socket.on('start-game', ({ roomCode, questions, settings }) => {
        console.log('[Server] Received start-game event:', {
            roomCode,
            questionCount: questions?.length,
            settings
        });
    
        const room = gameRooms.get(roomCode);
        if (room && socket.id === room.hostId) {
            // Store the quiz data in the room immediately
            room.quiz = { questions };
            room.settings = settings;
            room.gameState = 'waiting'; // Set initial state
            
            let countdown = 5;
            
            // Emit countdown every second
            const countdownInterval = setInterval(() => {
                io.to(roomCode).emit('countdown', { count: countdown });
                countdown--;
                
                if (countdown < 0) {
                    clearInterval(countdownInterval);
                    
                    // Start actual game after countdown
                    room.gameState = 'playing';
                    room.currentQuestion = 0;
                    room.timeRemaining = settings?.timeLimit || 30;
                    
                    // Emit initial game state with the first question
                    io.to(roomCode).emit('game-state', { 
                        questions: room.quiz.questions,
                        currentQuestion: room.currentQuestion,
                        timeRemaining: room.timeRemaining, // Use room.timeRemaining
                        gameState: 'playing'
                    });
                    
                    // Sta
                    
                    // Start the timer for the first question
                    startGameTimer(io, roomCode, room);
                }
            }, 1000);
        }
    });

    const startGameTimer = (io: Server, roomCode: string, room: GameRoom) => {
        if (room.timer) {
            clearInterval(room.timer);
        }
        room.timeRemaining = room.settings?.timeLimit || 30;
        io.to(roomCode).emit('time-update', { timeRemaining: room.timeRemaining });
        room.timer = setInterval(() => {
            room.timeRemaining--;
            io.to(roomCode).emit('time-update', { timeRemaining: room.timeRemaining });

            if (room.timeRemaining <= 0) {
                clearInterval(room.timer);
                // Show answer reveal only, don't automatically transition to leaderboard
                io.to(roomCode).emit('answer-reveal', {
                    correctAnswer: room.quiz.questions[room.currentQuestion].correctAnswer,
                    answers: room.players.map(p => ({
                        playerId: p.id,
                        playerName: p.name,
                        answer: p.currentAnswer
                    }))
                });
                // Remove the automatic transition to leaderboard
            }
        }, 1000);
    };

    // Add a new event handler for when the host clicks "Show Leaderboard"
    socket.on('show-leaderboard', ({ roomCode }) => {
        const room = gameRooms.get(roomCode);
        if (!room || socket.id !== room.hostId) return;

        // Update the game state for all players
        room.gameState = 'leaderboard';
        
        // Emit to all players including host
        io.to(roomCode).emit('show-leaderboard', {
            leaderboard: getLeaderboard(room),
            isEndOfGame: room.currentQuestion >= room.quiz.questions.length - 1
        });
    });

    socket.on('next-question-host', ({ roomCode }) => {
        const room = gameRooms.get(roomCode);
        if (!room || socket.id !== room.hostId) return;

        const nextQuestionIndex = room.currentQuestion + 1;
        
        if (nextQuestionIndex >= room.quiz.questions.length) {
            // End the game if we've gone through all questions
            room.gameState = 'finished';
            io.to(roomCode).emit('show-leaderboard', {
                leaderboard: getLeaderboard(room),
                isEndOfGame: true
            });
        } else {
            // Move to next question
            room.currentQuestion = nextQuestionIndex;
            room.timeRemaining = room.settings?.timeLimit || 30;
            room.gameState = 'playing';
            
            // Reset player answers for the new question
            room.players.forEach(player => {
                player.currentAnswer = undefined;
            });
            
            // Emit the new question state to ALL clients including host
            io.to(roomCode).emit('next-question', {
                currentQuestion: room.currentQuestion,
                timeRemaining: room.timeRemaining,
                gameState: 'playing',
                question: room.quiz.questions[room.currentQuestion] // Include the question data
            });
            
            // Start the timer for the new question
            startGameTimer(io, roomCode, room);
        }
    });
 });
};


function getAnswerDistribution(room: GameRoom) {
    console.log('[Server] Calculating distribution for room:', {
        currentQuestion: room.currentQuestion,
        totalPlayers: room.players.length,
        playerAnswers: room.players.map(p => ({
            name: p.name,
            answer: p.currentAnswer
        }))
    });

    const currentQuestion = room.quiz.questions[room.currentQuestion];
    const answers = room.players
        .filter(p => p.id !== room.hostId && p.currentAnswer)
        .map(p => p.currentAnswer);

    console.log('[Server] Filtered answers:', answers);

    const distribution = currentQuestion.options.map((option: any) => {
        const count = answers.filter(a => a === option).length;
        const total = answers.length;
        const percentage = total > 0 ? (count / total) * 100 : 0;
        return { option, count, percentage };
    });

    console.log('[Server] Generated answer distribution:', distribution);
    return distribution;
}




function getLeaderboard(room: GameRoom) {
    return room.players
        .filter(p => p.id !== room.hostId) // Exclude host from leaderboard
        .sort((a, b) => b.score - a.score)
        .map((player, index) => ({
            name: player.name,
            score: player.score,
            position: index + 1
        }));
}