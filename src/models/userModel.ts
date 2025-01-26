import supabase from "../config/supabaseLib";

export const getUserById = async (id:string) => {
  const {data, error} = await supabase.from('users').select('*').eq('id', id).single();
  if (error) {
    throw error
  }
  return data;
}