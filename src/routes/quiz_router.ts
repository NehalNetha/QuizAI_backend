import express from 'express';
import { authMiddleware } from '../middleware/middleware';
import { createQuiz, getQuizById, getQuizzes, deleteQuiz } from '../controllers/quiz_controller';

const quizRouter = express.Router();
quizRouter.get('/quiz/:quizId', authMiddleware, getQuizById);
quizRouter.post('/quiz', authMiddleware, createQuiz);
quizRouter.get('/quiz', authMiddleware, getQuizzes);
quizRouter.delete('/quiz/:quizId', authMiddleware, deleteQuiz);

export default quizRouter;