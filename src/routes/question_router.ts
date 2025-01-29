import { Router } from "express";
import { generateQuestionsHandler } from "../controllers/question_controller";
import { authMiddleware } from "../middleware/middleware";

const questionRouter = Router();

questionRouter.post(
  '/generate',generateQuestionsHandler
);

export default questionRouter;