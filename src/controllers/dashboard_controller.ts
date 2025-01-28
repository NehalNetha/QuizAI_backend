import { Request, Response } from 'express';
import { getQuizzesByUserId } from '../models/saveQuiz';
import { getDashboardStats } from './dashboardStats';

export const getDashboardStatsHandler = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get stats from dashboard_stats table
    const stats = await getDashboardStats(userId);
    
    // Get recent quizzes
    const quizzes = await getQuizzesByUserId(userId);
    const recentQuizzes = quizzes
      .slice(0, 5)
      .map(quiz => ({
        id: quiz.id,
        title: quiz.title,
        players: 0, // You can update this if you track players per quiz
        date: new Date(quiz.created_at).toLocaleDateString()
      }));

    return res.json({
      totalQuizzes: stats.total_quizzes || quizzes.length,
      totalPlayers: stats.total_players || 0,
      recentQuizzes
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};