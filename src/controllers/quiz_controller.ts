import { Request, Response } from 'express';
import { getQuizzesByUserId, saveQuiz } from '../models/saveQuiz';
import supabase from '../config/supabaseLib';
import { updateDashboardStats } from './dashboardStats';

export const createQuiz = async (req: Request, res: Response): Promise<any> => {
    try {
        const { questions, title } = req.body;
        const user = req.user;

        if (!user?.email || !user?.id) {
            return res.status(401).json({ error: 'Authentication required or user not found' });
        }

        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Invalid questions data' });
        }

        // Updated validation to handle both multiple-choice and true-false questions
        const isValidQuestionStructure = questions.every(q => {
            const hasValidBasicStructure = 
                typeof q.question === 'string' &&
                Array.isArray(q.options) &&
                typeof q.correctAnswer === 'string' &&
                ['multiple-choice', 'true-false'].includes(q.type);

            if (!hasValidBasicStructure) return false;

            // Additional validation for true-false questions
            if (q.type === 'true-false') {
                return q.options.length === 2 &&
                    q.options.includes('True') &&
                    q.options.includes('False') &&
                    (q.correctAnswer === 'True' || q.correctAnswer === 'False');
            }

            // Validation for multiple-choice questions
            return q.options.length >= 2 && q.options.includes(q.correctAnswer);
        });

        if (!isValidQuestionStructure) {
            return res.status(400).json({ error: 'Invalid question structure' });
        }
      
        // Set title to the first question if not provided
        const quizTitle = title || questions[0].question;


        const quizData = {
            title: quizTitle,
            questions,
            user_id: user.id
        }

        const data = await saveQuiz(quizData);
        // Update dashboard stats
        await updateDashboardStats(user.id, {
            total_quizzes: (await getQuizzesByUserId(user.id)).length
        });

        return res.status(200).json({
            message: 'Quiz saved successfully',
            data
        });

    } catch (error: any) {
        console.error('Error processing request:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
};


export const getQuizzes = async (req: Request, res: Response) :Promise<any> => {
    try {
        const user = req.user;

        //Validate user
        if (!user?.email || !user?.id) {
            return res.status(401).json({ error: 'Authentication required or user not found' });
        }

        const data = await getQuizzesByUserId(user.id)

        return res.status(200).json({
            message: 'Quizzes fetched successfully',
            data
        })
    } catch (error:any) {
        console.error('Error processing request:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
}

export const getQuizById = async (req: Request, res: Response): Promise<any> => {
    try {
        const user = req.user;
        const quizId = req.params.quizId;

        // Add request logging
    

        if (!user?.email || !user?.id) {
            return res.status(401).json({ error: 'Authentication required or user not found' });
        }

        // Update the query to explicitly select questions
        const { data, error } = await supabase
            .from('quizzes')
            .select(`
                id,
                title,
                user_id,
                questions
            `)
            .eq('id', quizId)
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(400).json({
                error: 'Failed to fetch quiz',
                details: error.message
            });
        }

        if (!data) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Log the complete data for debugging

        if (!data.questions || !Array.isArray(data.questions)) {
            console.error('Invalid questions data in quiz:', data);
            return res.status(400).json({
                error: 'Quiz data is corrupted',
                details: 'Questions array is missing or invalid'
            });
        }

        return res.status(200).json({
            message: 'Quiz fetched successfully',
            data: {
                id: data.id,
                title: data.title,
                questions: data.questions,
                user_id: data.user_id
            }
        });
    } catch (error: any) {
        console.error('Error fetching quiz:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
};

export const deleteQuiz = async (req: Request, res: Response): Promise<any> => {
    try {
        const user = req.user;
        const quizId = req.params.quizId;

        if (!user?.email || !user?.id) {
            return res.status(401).json({ error: 'Authentication required or user not found' });
        }

        const { error } = await supabase
            .from('quizzes')
            .delete()
            .eq('id', quizId)
            .eq('user_id', user.id); // Ensure user can only delete their own quizzes

        if (error) {
            console.error('Supabase error:', error);
            return res.status(400).json({
                error: 'Failed to delete quiz',
                details: error.message
            });
        }

        return res.status(200).json({
            message: 'Quiz deleted successfully'
        });
    } catch (error: any) {
        console.error('Error deleting quiz:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
};