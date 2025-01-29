import { Request, Response } from 'express';
import { getUserCreditsService } from '../config/credits_service';

export const getUserCredits = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = req.user;
    
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const credits = await getUserCreditsService(user.id);
    return res.json(credits);
  } catch (error) {
    console.error('Error fetching credits:', error);
    return res.status(500).json({ error: 'Failed to fetch credits' });
  }
};