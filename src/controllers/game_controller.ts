import { Server, Socket } from 'socket.io';
import { updateDashboardStats } from './dashboardStats';
import { getDashboardStats } from './dashboardStats';


interface GameRoom {
    hostId: string;
    players: Array<{
        id: string;
        name: string;
        score: number;
    }>;
    quiz?: any;
    currentQuestion: number;
    timeRemaining: number;
    gameState: 'waiting' | 'playing' | 'finished';
    timer?: NodeJS.Timeout;
    settings?: any;

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
            try {
                const hostId = room.hostId;
                const stats = await getDashboardStats(hostId);
                await updateDashboardStats(hostId, {
                    total_players: (stats.total_players || 0) + 1
                });
            } catch (error) {
                console.error('Error updating player stats:', error);
            }

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
        socket.on('start-game', ({ roomCode }) => {
            const room = gameRooms.get(roomCode);
            if (room && socket.id === room.hostId) {
                io.to(roomCode).emit('game-started', { 
                    roomCode,
                    quiz: room.quiz,
                    players: room.players 
                });
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
    
    socket.on('submit-answer', ({ roomCode, answer, questionId }) => {
        const room = gameRooms.get(roomCode);
        if (!room) return;
    
        // Broadcast the answer to all players in the room
        io.to(roomCode).emit('answer-submitted', {
            playerId: socket.id,
            playerName: room.players.find(p => p.id === socket.id)?.name,
            answer
        });
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
            const room = gameRooms.get(roomCode);
            if (room && socket.id === room.hostId) {
                room.gameState = 'playing';
                room.currentQuestion = 0;
                room.timeRemaining = settings?.timeLimit || 30;
                room.settings = settings; // Store settings in room

                // Start the game timer with custom time limit
                startGameTimer(io, roomCode, room);

                io.to(roomCode).emit('game-started', { 
                    roomCode,
                    quiz: room.quiz,
                    players: room.players,
                    settings: settings
                });
            }
        });

        // Update the startGameTimer function to use custom time limit
        function startGameTimer(io: Server, roomCode: string, room: GameRoom) {
            if (room.timer) {
                clearInterval(room.timer);
            }
        
            const timeLimit = room.settings?.timeLimit || 30;
            room.timeRemaining = timeLimit;
            
            room.timer = setInterval(() => {
                room.timeRemaining--;
        
                io.to(roomCode).emit('time-update', { timeRemaining: room.timeRemaining });
        
                if (room.timeRemaining <= 0) {
                    clearInterval(room.timer);
                    
                    const currentLeaderboard = getLeaderboard(room);
                    io.to(roomCode).emit('show-leaderboard', {
                        leaderboard: currentLeaderboard,
                        isEndOfGame: room.currentQuestion >= room.quiz.questions.length - 1
                    });
        
                    setTimeout(() => {
                        if (room.currentQuestion < room.quiz.questions.length - 1) {
                            room.currentQuestion++;
                            room.timeRemaining = timeLimit; // Use custom time limit for next question
                            
                            io.to(roomCode).emit('next-question', {
                                currentQuestion: room.currentQuestion,
                                timeRemaining: room.timeRemaining,
                                leaderboard: currentLeaderboard
                            });
        
                            startGameTimer(io, roomCode, room);
                        } else {
                            room.gameState = 'finished';
                            io.to(roomCode).emit('game-over', {
                                finalLeaderboard: currentLeaderboard
                            });
                        }
                    }, 5000);
                }
            }, 1000);
        }

        // Update the GameRoom interface to include settings
        interface GameRoom {
            hostId: string;
            players: Array<{
                id: string;
                name: string;
                score: number;
            }>;
            quiz?: any;
            currentQuestion: number;
            timeRemaining: number;
            gameState: 'waiting' | 'playing' | 'finished';
            timer?: NodeJS.Timeout;
            settings?: any;
        }

        socket.on('submit-answer', ({ roomCode, answer, questionId }) => {
            const room = gameRooms.get(roomCode);
            if (!room || socket.id === room.hostId) return; // Prevent host from submitting answers

            const player = room.players.find(p => p.id === socket.id);
            if (!player) return;

            const currentQuestion = room.quiz.questions[room.currentQuestion];
       
            if (currentQuestion.id === questionId) {
                const isCorrect = answer === currentQuestion.correct_answer;
                const timeBonus = Math.floor(room.timeRemaining / 2);
                const points = isCorrect ? (1000 + timeBonus) : 0;

                player.score += points;

              

                io.to(roomCode).emit('answer-submitted', {
                    playerId: socket.id,
                    playerName: player.name,
                    answer,
                    isCorrect,
                    points,
                    correctAnswer: currentQuestion.correct_answer,
                    leaderboard: getLeaderboard(room)
                });
            }
        });
    });
};



function startGameTimer(io: Server, roomCode: string, room: GameRoom) {
    if (room.timer) {
        clearInterval(room.timer);
    }

    room.timeRemaining = 30;
    room.timer = setInterval(() => {
        room.timeRemaining--;

        io.to(roomCode).emit('time-update', { timeRemaining: room.timeRemaining });

        if (room.timeRemaining <= 0) {
            clearInterval(room.timer);
            
            // Show leaderboard for 5 seconds before next question
            const currentLeaderboard = getLeaderboard(room);
            io.to(roomCode).emit('show-leaderboard', {
                leaderboard: currentLeaderboard,
                isEndOfGame: room.currentQuestion >= room.quiz.questions.length - 1
            });

            // Wait 5 seconds before moving to next question
            setTimeout(() => {
                if (room.currentQuestion < room.quiz.questions.length - 1) {
                    room.currentQuestion++;
                    room.timeRemaining = 30;
                    
                    io.to(roomCode).emit('next-question', {
                        currentQuestion: room.currentQuestion,
                        timeRemaining: room.timeRemaining,
                        leaderboard: currentLeaderboard
                    });

                    startGameTimer(io, roomCode, room);
                } else {
                    room.gameState = 'finished';
                    io.to(roomCode).emit('game-over', {
                        finalLeaderboard: currentLeaderboard
                    });
                }
            }, 5000);
        }
    }, 1000);
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
