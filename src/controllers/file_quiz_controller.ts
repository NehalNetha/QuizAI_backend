import { Request, Response } from 'express';
import multer from 'multer';
import { GenerateQuestionsWithSettings } from '../types/questions';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { getRandomValues } from 'crypto';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const buildPrompt = (settings: GenerateQuestionsWithSettings, content: string): string => {
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
    Generate exactly ${questionCount} questions based on the provided content.
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
    
    Content to generate questions from:
    ${content}
    
    Please ensure the output doesn't contain any additional formatting like \`\`\`.`;
};

const cleanResponse = (text: string): string => {
  // Remove all markdown code block syntax
  let cleaned = text.replace(/```json\n/g, '').replace(/```/g, '');
  
  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // If the text starts with a newline and [, remove the newline
  if (cleaned.startsWith('\n[')) {
    cleaned = cleaned.substring(1);
  }
  
  return cleaned;
};

const generateQuestions = async (settings: GenerateQuestionsWithSettings, content: string) => {
  const prompt = buildPrompt(settings, content);
  const result = await model.generateContent(prompt);

  const response = await result.response;
  let questionsText = response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!questionsText) {
    throw new Error("Could not generate questions.");
  }

  try {
    questionsText = cleanResponse(questionsText);
    console.log('Cleaned response:', questionsText.substring(0, 100) + '...'); // Debug log
    return JSON.parse(questionsText);
  } catch (error) {
    console.error("Error parsing JSON response:", error);
    console.error("Raw response content:", questionsText);
    throw new Error("Error parsing the generated questions. Please try again.");
  }
};

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Configure Multer for memory storage
const storage = multer.memoryStorage();
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1
  }
});

export const generateQuestionsFromFileHandler = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    // Get original file name without extension
    const titleFileName = req.file.originalname.replace(/\.[^/.]+$/, "");

    // Parse settings from form data
    let settings: GenerateQuestionsWithSettings;
    try {
      settings = JSON.parse(req.body.settings);
    } catch (error) {
      return res.status(400).json({ error: "Invalid settings format." });
    }

    // Validate question count
    if (settings.questionCount > 20) {
      return res.status(400).json({ 
        error: "The maximum number of questions is 20." 
      });
    }

    // Upload file to Supabase Storage
    const file = req.file;
    const fileName = `${uuidv4()}-${file.originalname}`;
    
    const { error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET || 'documents')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ error: "File storage failed." });
    }

    // Process file content
    let content: string;
    try {
      switch (file.mimetype) {
        case 'text/plain':
          content = file.buffer.toString();
          break;
        case 'application/pdf':
          const pdfData = await pdf(file.buffer);
          content = pdfData.text;
          break;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          const docxResult = await mammoth.extractRawText({ buffer: file.buffer });
          content = docxResult.value;
          break;
        default:
          return res.status(400).json({ error: "Unsupported file type. Only TXT, PDF, and DOCX are supported." });
      }
    } catch (parseError) {
      console.error("Error parsing file:", parseError);
      return res.status(500).json({ error: "Error processing file content." });
    }

    // Generate questions using the extracted content
    const questions = await generateQuestions(settings, content);
    
    // Return questions array along with the file name
    return res.json({
      questions,
      title: titleFileName
    });

  } catch (error) {
    console.error("Error generating questions from file:", error);
    return res.status(500).json({ 
      error: "An error occurred while generating questions from the file." 
    });
  }
};
// Add these new functions to your existing controller

export const getUserFiles = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id; // Assuming you have user info in request
    
    const { data, error } = await supabase
      .storage
      .from(process.env.SUPABASE_STORAGE_BUCKET || 'documents')
      .list(userId?.toString() || '');

    if (error) throw error;

    const files = data.map(file => ({
      id: file.id,
      name: file.name,
      created_at: file.created_at,
      size: file.metadata?.size || 0,
      type: file.metadata?.mimetype || 'unknown'
    }));

    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const userId = req.user?.id;

    const { error } = await supabase
      .storage
      .from(process.env.SUPABASE_STORAGE_BUCKET || 'documents')
      .remove([`${userId}/${fileId}`]);

    if (error) throw error;

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};