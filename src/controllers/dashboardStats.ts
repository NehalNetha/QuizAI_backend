import supabase from "../config/supabaseLib";

export const getDashboardStats = async (userId: string) => {
  const { data, error } = await supabase
    .from('dashboard_stats')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
    throw error;
  }

  return data || { total_quizzes: 0, total_players: 0 };
};

export const updateDashboardStats = async (userId: string, stats: { total_quizzes?: number, total_players?: number }) => {
  const { data: existingStats } = await supabase
    .from('dashboard_stats')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!existingStats) {
    // Create new stats record
    const { error } = await supabase
      .from('dashboard_stats')
      .insert([{
        user_id: userId,
        ...stats
      }]);
    if (error) throw error;
  } else {
    // Update existing stats
    const { error } = await supabase
      .from('dashboard_stats')
      .update({
        ...stats,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    if (error) throw error;
  }
};