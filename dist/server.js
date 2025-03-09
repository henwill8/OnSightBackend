"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Define your API routes here
app.get('/api/example', (req, res) => {
    res.json({ message: 'This is an example route' });
});
// Root route
app.get('/', (req, res) => {
    res.send('Welcome to the root page!');
});
// Catch-all for any unmatched routes and redirect to root
app.use((req, res) => {
    res.redirect('/');
});
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
