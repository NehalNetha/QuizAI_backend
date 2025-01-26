import supabase from "../config/supabaseLib";
import { Quiz } from "../types/questions";

export const saveQuiz = async (quizData: Omit<Quiz, 'id' | 'created_at' | 'is_published'>) => {
    const { data, error } = await supabase
      .from('quizzes')
      .insert([
        {
          ...quizData,
          created_at: new Date().toISOString(),
          is_published: false
        },
      ])
      .select();

      if (error) {
        throw error;
      }

      return data;
}

export const getQuizzesByUserId = async (userId: string) => {
  const {data, error} = await supabase.from('quizzes').select('*').eq('user_id', userId);
  if (error) {
    throw error
  }

  return data
}