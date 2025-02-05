import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import questionRouter from './routes/question_router';
import dotenv from 'dotenv';
import cors from 'cors';
import quizRouter from './routes/quiz_router';
import fileRouter from './routes/file_question_router';
import dashboardRouter from './routes/dashboard_router';
import creditsRouter from './routes/credits_router';
import { initializeGameSockets } from './controllers/supabase_game_controller';

dotenv.config();



const app: Express = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: [
          'http://localhost:3000',
          'https://quiz-ai-delta.vercel.app',
          'https://quizlightyear.vercel.app',
          
        ],
        methods: ["GET", "POST"]
    }
});

app.use(express.json());

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://quiz-ai-delta.vercel.app',
    'https://quizlightyear.vercel.app',
    
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Type'] // Add this line
}));

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Express + TypeScript Server' });
});

app.use('/api', quizRouter);


app.use("/api", questionRouter)
app.use("/api", fileRouter)
app.use("/api", dashboardRouter)
app.use("/api", creditsRouter)



app.get('/hello/:name', (req: Request, res: Response) => {
  const { name } = req.params;
  res.json({ message: `Hello, ${name}!` });
});

// Initialize socket handlers
initializeGameSockets(io);

const port = process.env.PORT || 8080;

httpServer.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});