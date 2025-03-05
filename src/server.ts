import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Define your API routes here
app.get('/api/example', (req: Request, res: Response) => {
    res.json({ message: 'This is an example route' });
});

// Root route
app.get('/', (req: Request, res: Response) => {
    res.send('Welcome to the root page!');
});

// Catch-all for any unmatched routes and redirect to root
app.use((req: Request, res: Response) => {
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
