import supabase from "../config/supabaseLib";

export interface UserCredits {
  normal_quiz_credits: number;
  file_quiz_credits: number;
  total_purchased_credits: number;
}

export async function getUserCreditsService(userId: string): Promise<any> {
  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (!data) {
    // Initialize credits for new user
    const { data: newCredits, error: insertError } = await supabase
      .from('user_credits')
      .insert([{
        user_id: userId,
        normal_quiz_credits: 10,
        file_quiz_credits: 5,
        total_purchased_credits: 0
      }])
      .select()
      .single();

    if (insertError) throw insertError;
    return newCredits;
  }

  return data;
}

export async function deductCredits(userId: string, type: 'normal' | 'file'): Promise<void> {
    const field = type === 'normal' ? 'normal_quiz_credits' : 'file_quiz_credits';
    
    const { error } = await supabase
      .from('user_credits')
      .update({
        [field]: `${field} - 1`,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .gt(field, 0);
  
    if (error) throw error;
  }

  export async function addCredits(userId: string, type: 'normal' | 'file', amount: number): Promise<void> {
    const field = type === 'normal' ? 'normal_quiz_credits' : 'file_quiz_credits';
    
    const { error } = await supabase
      .from('user_credits')
      .update({
        [field]: `${field} + ${amount}`,
        total_purchased_credits: `total_purchased_credits + ${amount}`,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
  
    if (error) throw error;
  }