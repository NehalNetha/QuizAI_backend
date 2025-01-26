import { Router } from "express";
import { generateQuestionsHandler } from "../controllers/question_controller";

const questionRouter = Router();

questionRouter.post(
  '/generate', generateQuestionsHandler
);

export default questionRouter;