import { Router } from "express";
import { generateQuestionsFromFileHandler, upload } from "../controllers/file_quiz_controller";

const fileRouter = Router();

// Add error handling for multer with detailed logging
const uploadMiddleware = (req: any, res: any, next: any) => {
  console.log('Received file upload request');
  
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      console.error('No file received');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log('File received:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
    next();
  });
};

// Add logging middleware
fileRouter.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

fileRouter.post(
  '/generate-file',
  uploadMiddleware,
  generateQuestionsFromFileHandler
);

export default fileRouter;