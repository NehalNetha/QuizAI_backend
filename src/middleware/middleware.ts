

import { Request, Response, NextFunction } from 'express';
import supabase from '../config/supabaseLib';
import { SessionUser } from '../types/questions';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        // Log all headers for debugging
        
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ 
                error: 'Authentication required: no auth header present',
                headers: req.headers // Debug info
            });
        }
        
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Authentication required: invalid auth header format',
                receivedHeader: authHeader // Debug info
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify the token
        const { data, error } = await supabase.auth.getUser(token);
        
      
        if (error) {
            return res.status(401).json({ 
                error: 'Authentication failed',
                details: error.message,
                status: error.status
            });
        }

        if (!data?.user) {
            return res.status(401).json({ 
                error: 'No user data found',
                authResponse: data
            });
        }

        // Set user info on request
        req.user = {
            id: data.user.id,
            email: data.user.email
        } as SessionUser;

      

        next();
    } catch (error: any) {
        console.error('Detailed error in authMiddleware:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        return res.status(500).json({ 
            error: 'Internal server error during authentication',
            details: error.message,
            type: error.name
        });
    }
};