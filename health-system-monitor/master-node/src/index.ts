import express from 'express';
import cors from 'cors';
import { RedisWorkerManager } from './redis';

const app = express();
const PORT = process.env.PORT || 8000;

const redisWorkerManager = new RedisWorkerManager();

// Middleware
app.use(express.json());
app.use(cors());

// Start the server
app.listen(PORT, async () => {
    console.log(`master-node is working on port: ${PORT}`);
    await redisWorkerManager.startMonitoring();
});