import { Router } from "express";
import { authMiddleware } from '../middleware/middleware';
import { getUserCredits } from "../controllers/credits_controller";

const creditsRouter = Router();

creditsRouter.get('/credits', authMiddleware, getUserCredits);

export default creditsRouter;