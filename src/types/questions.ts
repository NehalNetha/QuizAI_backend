export interface GenerateQuestionsWithSettings {
    input: string;
    questionType: 'multiple-choice' | 'true-false' | 'short-answer' | 'mixed';
    questionCount: number;
    difficulty?: string;
    optionsCount?: number;
  }
  
  export interface QuestionBase {
    question: string;
  }
  
  export interface MultipleChoiceQuestion extends QuestionBase {
    options: string[];
    correctAnswer: string;
  }
  
  export interface TrueFalseQuestion extends QuestionBase {
    correctAnswer: boolean;
  }
  
  export interface ShortAnswerQuestion extends QuestionBase {
    // No additional fields required
  }
  
  export type Question = MultipleChoiceQuestion | TrueFalseQuestion | ShortAnswerQuestion;
  
  export interface SessionUser {
    id: string,
    email: string
}
export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
  user_id: string,
  created_at: Date,
  is_published: boolean
}

declare global {
  namespace Express {
      interface Request {
          user?: SessionUser,
      }
  }
}



export interface FrontendQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}