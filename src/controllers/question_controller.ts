import { Request, Response } from 'express';
import { GenerateQuestionsWithSettings } from '../types/questions';

import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import { getUserCreditsService } from '../config/credits_service';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const buildPrompt = (settings: GenerateQuestionsWithSettings): string => {
  const {
    questionCount,
    questionType,
    difficulty,
    optionsCount,
  } = settings;

  const typePrompt = questionType === "mixed"
    ? "The questions can be either multiple-choice or true-false."
    : `The questions should be ${questionType.replace("-", " ")}.`;

  const difficultyPrompt = difficulty
    ? `The questions should be of ${difficulty} difficulty level.`
    : "";

  const optionsPrompt = questionType === "multiple-choice" && optionsCount
    ? `For multiple-choice questions, provide exactly ${optionsCount} options for each question.`
    : "";

  return `You are an expert in creating various types of questions.
    Generate exactly ${questionCount} questions based on the provided topic.
    ${typePrompt}
    ${difficultyPrompt}
    ${optionsPrompt}
    Format the output as a JSON array of question objects.
    
    Each question object should follow these rules:
    - For multiple-choice questions, include:
      - A "question" field (string)
      - An "options" field (array of strings)
      - A "correctAnswer" field (string, must be one of the options)
      - A "type" field with value "multiple-choice"
    - For true-false questions, include:
      - A "question" field (string)
      - An "options" field with exactly ["True", "False"]
      - A "correctAnswer" field (string, either "True" or "False")
      - A "type" field with value "true-false"
    
    Please ensure the output doesn't contain any additional formatting like \`\`\`.`;
};

const cleanResponse = (text: string): string => {
  if (text.startsWith("```json") && text.endsWith("```")) {
    return text.substring(7, text.length - 3);
  }
  return text;
};

 export const GenerateQuestions= async (settings: GenerateQuestionsWithSettings) => {
  const prompt = buildPrompt(settings);
  const result = await model.generateContent(
    `${prompt}\n\nTopic: ${settings.input}`
  );

  const response = await result.response;
  let questionsText = response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!questionsText) {
    throw new Error("Could not generate questions.");
  }

  questionsText = cleanResponse(questionsText);

  try {
    return JSON.parse(questionsText);
  } catch (error) {
    console.error("Error parsing JSON response:", error);
    console.error("Raw response content:", questionsText);
    throw new Error("Error parsing the generated questions. Ensure the output is valid JSON.");
  }
};


export const generateQuestionsHandler = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const settings: GenerateQuestionsWithSettings = req.body;
    // const user = req.user;

    // if (!user?.id) {
    //   return res.status(401).json({ 
    //     error: "Authentication required." 
    //   });
    // }

    // // Check credits
    // const credits = await getUserCreditsService(user.id);
    // if (credits.normal_quiz_credits <= 0) {
    //   return res.status(403).json({ 
    //     error: "Insufficient credits. Please purchase more credits to generate quizzes." 
    //   });
    // }


    if (settings.questionCount > 20) {
      return res.status(400).json({ 
        error: "The maximum number of questions is 20." 
      });
    }

    

    const questions = await GenerateQuestions(settings);
    return res.json(questions);

  } catch (error) {
    console.error("Error generating questions:", error);
    return res.status(500).json({ 
      error: "An error occurred while generating questions." 
    });
  }
};


