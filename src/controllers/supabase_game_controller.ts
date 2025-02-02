import { Server, Socket } from 'socket.io';
import supabase from '../config/supabaseLib';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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
    gameState: 'waiting' | 'countdown' | 'playing' | 'finished' | 'leaderboard' | 'answer_reveal' | 'finished';
    settings?: any;
}

interface GameRoomRecord {
    room_code: string;
    host_id: string;
    players: Player[];
    quiz: any;
    current_question: number;
    time_remaining: number;
    game_state: string;
    settings?: any;
}

const gameChannel = supabase.channel('game_rooms');

export const initializeGameSockets = (io: Server) => {
    const timers = new Map<string, NodeJS.Timeout>();

    gameChannel
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'game_rooms' },
            (payload: RealtimePostgresChangesPayload<GameRoomRecord>) => {
                console.log('[Realtime] Received change:', payload.eventType, payload.new);
                const roomCode = payload.new && 'room_code' in payload.new ? payload.new.room_code : undefined;
                if (roomCode) {
                    console.log('[Realtime] Emitting game-state-updated for room:', roomCode);
                    io.to(roomCode).emit('game-state-updated', payload.new);
                }
            }
        )
        .subscribe();

    io.on('connection', (socket: Socket) => {
        socket.on('create-game', async (quizData: any) => {
            console.log('[Create Game] Creating new game with data:', { 
                questionCount: quizData.questions.length,
                hostId: socket.id 
            });
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            const normalizedQuestions = quizData.questions.map((q: any) => ({
                ...q,
                id: q.id || Math.random().toString(36).substr(2, 9),
                correct_answer: q.correctAnswer
            }));

            const { error } = await supabase
                .from('game_rooms')
                .insert({
                    room_code: roomCode,
                    host_id: socket.id,
                    players: [{
                        id: socket.id,
                        name: 'Host',
                        score: 0
                    }],
                    quiz: {
                        ...quizData,
                        questions: normalizedQuestions
                    },
                    current_question: 0,
                    time_remaining: 30,
                    game_state: 'waiting'
                });

            if (error) {
                console.error('[Create Game] Error creating game:', error);
                socket.emit('error', { message: 'Failed to create game' });
                return;
            }

            socket.join(roomCode);
            socket.emit('game-created', { roomCode });
        });

        socket.on('join-game', async (roomCode: string, playerName: string) => {
            console.log('[Join Game] Player joining:', { roomCode, playerName });
            const { data: room, error } = await supabase
                .from('game_rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (error || !room) {
                socket.emit('join-error', { message: 'Game room not found' });
                return;
            }

            const updatedPlayers = [...room.players, {
                id: socket.id,
                name: playerName,
                score: 0
            }];

            const { error: updateError } = await supabase
                .from('game_rooms')
                .update({ players: updatedPlayers })
                .eq('room_code', roomCode);

            if (updateError) {
                socket.emit('join-error', { message: 'Failed to join game' });
                return;
            }

            socket.join(roomCode);
            socket.emit('joined-game', {
                roomCode,
                playerCount: updatedPlayers.length,
                players: updatedPlayers
            });

            socket.to(roomCode).emit('player-joined', {
                playerCount: updatedPlayers.length,
                playerName,
                playerId: socket.id
            });
        });

        socket.on('join-game-session', async ({ roomCode, playerName, isHost }) => {
            const { data: room, error } = await supabase
                .from('game_rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (error || !room) {
                socket.emit('join-error', { message: 'Game room not found' });
                return;
            }

            socket.join(roomCode);

            if (isHost) {
                console.log('[Server] Host joined with socket ID:', socket.id);
                await supabase
                    .from('game_rooms')
                    .update({ host_id: socket.id })
                    .eq('room_code', roomCode);
            }

            const existingPlayerIndex = room.players.findIndex((p: any) => p.name === playerName);
            const updatedPlayers = [...room.players];

            if (existingPlayerIndex === -1) {
                updatedPlayers.push({
                    id: socket.id,
                    name: playerName,
                    score: 0
                });
            } else {
                updatedPlayers[existingPlayerIndex].id = socket.id;
            }

            await supabase
                .from('game_rooms')
                .update({ players: updatedPlayers })
                .eq('room_code', roomCode);

            socket.emit('game-state', {
                questions: room.quiz.questions,
                currentQuestion: room.current_question,
                timeRemaining: room.time_remaining,
                players: updatedPlayers
            });
        });

        socket.on('start-game', async ({ roomCode, questions, settings }) => {
            console.log('[Start Game] Starting game:', { roomCode, questionCount: questions?.length });
            const { data: room } = await supabase
                .from('game_rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (!room || socket.id !== room.host_id) return;

            // First update game state to countdown
            await supabase
                .from('game_rooms')
                .update({ 
                    game_state: 'countdown',
                    quiz: { questions },  // Store questions immediately
                    settings
                })
                .eq('room_code', roomCode);

            let countdown = 5;
            const countdownInterval = setInterval(async () => {
                io.to(roomCode).emit('countdown', { count: countdown });
                countdown--;

                if (countdown < 0) {
                    clearInterval(countdownInterval);
                    
                    // Update game state to playing with all necessary data
                    const { error } = await supabase
                        .from('game_rooms')
                        .update({
                            game_state: 'playing',
                            current_question: 0,
                            time_remaining: settings?.timeLimit || 30
                        })
                        .eq('room_code', roomCode);

                    if (error) {
                        console.error('[Start Game] Error updating game state:', error);
                        return;
                    }

                    // Emit game state to all players including host
                    io.to(roomCode).emit('game-state', {
                        gameState: 'playing',
                        currentQuestion: 0,
                        timeRemaining: settings?.timeLimit || 30,
                        questions: questions
                    });

                    startGameTimer(io, roomCode, settings?.timeLimit || 30, timers);
                }
            }, 1000);
        });

        socket.on('submit-answer', async ({ roomCode, answer, questionId, timeLeft }) => {
            console.log('[Submit Answer] Processing submission:', {
                roomCode,
                answer,
                questionId,
                timeLeft,
                playerId: socket.id
            });

            const { data: room } = await supabase
                .from('game_rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (!room || socket.id === room.host_id) return;

            const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
            if (playerIndex === -1) return;

            const currentQuestion = room.quiz.questions[room.current_question];
            if (currentQuestion.id !== questionId) return;

            const isCorrect = answer === currentQuestion.correctAnswer;
            const basePoints = 1000;
            const timeBonus = Math.floor((timeLeft / 30) * 1000);
            const points = isCorrect ? basePoints + timeBonus : 0;

            const updatedPlayers = [...room.players];
            updatedPlayers[playerIndex] = {
                ...updatedPlayers[playerIndex],
                score: updatedPlayers[playerIndex].score + points,
                currentAnswer: answer
            };

            await supabase
                .from('game_rooms')
                .update({ players: updatedPlayers })
                .eq('room_code', roomCode);

            io.to(roomCode).emit('answer-submitted', {
                playerName: room.players[playerIndex].name,
                answer,
                isCorrect,
                points,
                correctAnswer: currentQuestion.correctAnswer,
                leaderboard: getLeaderboard(room),
                answerDistribution: getAnswerDistribution(room)
            });
        });

        socket.on('show-leaderboard', async ({ roomCode }) => {
            const { data: room } = await supabase
                .from('game_rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (!room || socket.id !== room.host_id) return;

            await supabase
                .from('game_rooms')
                .update({ game_state: 'leaderboard' })
                .eq('room_code', roomCode);

            io.to(roomCode).emit('show-leaderboard', {
                leaderboard: getLeaderboard(room),
                isEndOfGame: room.current_question >= room.quiz.questions.length - 1
            });
        });

        socket.on('next-question-host', async ({ roomCode }) => {
            const { data: room } = await supabase
                .from('game_rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (!room || socket.id !== room.host_id) return;

            const nextQuestionIndex = room.current_question + 1;

            if (nextQuestionIndex >= room.quiz.questions.length) {
                await supabase
                    .from('game_rooms')
                    .update({ game_state: 'finished' })
                    .eq('room_code', roomCode);

                io.to(roomCode).emit('show-leaderboard', {
                    leaderboard: getLeaderboard(room),
                    isEndOfGame: true
                });
            } else {
                const updatedPlayers = room.players.map((p: any) => ({ ...p, currentAnswer: undefined }));

                await supabase
                    .from('game_rooms')
                    .update({
                        current_question: nextQuestionIndex,
                        time_remaining: room.settings?.timeLimit || 30,
                        game_state: 'playing',
                        players: updatedPlayers
                    })
                    .eq('room_code', roomCode);

                io.to(roomCode).emit('next-question', {
                    currentQuestion: nextQuestionIndex,
                    timeRemaining: room.settings?.timeLimit || 30,
                    gameState: 'playing',
                    question: room.quiz.questions[nextQuestionIndex]
                });

                startGameTimer(io, roomCode, room.settings?.timeLimit || 30, timers);
            }
        });

        socket.on('disconnect', async () => {
            const { data: rooms } = await supabase
                .from('game_rooms')
                .select('*')
                .contains('players', [{ id: socket.id }]);

            if (!rooms) return;

            for (const room of rooms) {
                if (room.host_id === socket.id) {
                    // Host disconnected - delete the room
                    await supabase
                        .from('game_rooms')
                        .delete()
                        .eq('room_code', room.room_code);

                    if (timers.has(room.room_code)) {
                        clearInterval(timers.get(room.room_code));
                        timers.delete(room.room_code);
                    }

                    io.to(room.room_code).emit('game-ended', {
                        message: 'Host has left the game'
                    });
                } else {
                    // Player disconnected - update player list
                    const updatedPlayers = room.players.filter((p: any) => p.id !== socket.id);

                    if (updatedPlayers.length <= 1) { // Only host remaining
                        // Delete room if no players left
                        await supabase
                            .from('game_rooms')
                            .delete()
                            .eq('room_code', room.room_code);

                        if (timers.has(room.room_code)) {
                            clearInterval(timers.get(room.room_code));
                            timers.delete(room.room_code);
                        }

                        io.to(room.room_code).emit('game-ended', {
                            message: 'All players have left the game'
                        });
                    } else {
                        // Update room with remaining players
                        await supabase
                            .from('game_rooms')
                            .update({ players: updatedPlayers })
                            .eq('room_code', room.room_code);

                        io.to(room.room_code).emit('player-left', {
                            playerId: socket.id,
                            players: updatedPlayers.filter((p: any) => p.id !== room.host_id)
                        });
                    }
                }
            }
        });
    });
};

function startGameTimer(io: Server, roomCode: string, timeLimit: number, timers: Map<string, NodeJS.Timeout>) {
    if (timers.has(roomCode)) {
        clearInterval(timers.get(roomCode));
    }

    let timeRemaining = timeLimit;
    const timer = setInterval(async () => {
        timeRemaining--;

        await supabase
            .from('game_rooms')
            .update({ time_remaining: timeRemaining })
            .eq('room_code', roomCode);

        io.to(roomCode).emit('time-update', { timeRemaining });

        if (timeRemaining <= 0) {
            clearInterval(timer);
            timers.delete(roomCode);

            const { data: room } = await supabase
                .from('game_rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (room) {
                io.to(roomCode).emit('answer-reveal', {
                    correctAnswer: room.quiz.questions[room.current_question].correctAnswer,
                    answers: room.players.map((p: any)  => ({
                        playerId: p.id,
                        playerName: p.name,
                        answer: p.currentAnswer
                    }))
                });
            }
        }
    }, 1000);

    timers.set(roomCode, timer);
}

function getAnswerDistribution(room: GameRoom) {
    const currentQuestion = room.quiz?.questions?.[room.currentQuestion];
    if (!currentQuestion?.options) {
        return [];
    }

    const answers = room.players
        .filter(p => p.id !== room.hostId && p.currentAnswer)
        .map(p => p.currentAnswer);

    return currentQuestion.options.map((option: any) => {
        const count = answers.filter(a => a === option).length;
        const total = answers.length;
        const percentage = total > 0 ? (count / total) * 100 : 0;
        return { option, count, percentage };
    });
}

function getLeaderboard(room: GameRoom) {
    return room.players
        .filter(p => p.id !== room.hostId)
        .sort((a, b) => b.score - a.score)
        .map((player, index) => ({
            name: player.name,
            score: player.score,
            position: index + 1
        }));
}
