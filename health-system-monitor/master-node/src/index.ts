import express from 'express';
import cors from 'cors';
import {exec} from 'child_process'
import { RedisWorkerManager } from './redis';

const app = express();
const PORT = process.env.PORT || 8000;

// TODO: Later to be replaced with persistance datastore
// In-memory storage for tracking worker instances (we will integrate redis later for this)
const workers = new Map(); 
// Starting port for workers
let currentPort = 4000;

const redisWorkerManager = new RedisWorkerManager();

// Middleware
app.use(express.json());
app.use(cors());

app.get('/check',(_req,res)=>{
    res.status(200).json({
        success:true,
        message:'master node is live',
        url: `http://localhost:${PORT}`
    });
});

app.post('/workers/create-worker', (_req, res) => {
    const workerId = Date.now().toString();
    const workerPort = currentPort++;
    const MASTER_URL = 'http://localhost:8000';
    const dockerCommand = `
        docker run -d -p ${workerPort}:3000 -e WORKER_ID=${workerId} -e PORT=${workerPort} -e MASTER_NODE_URL=${MASTER_URL}  --name worker-${workerId} worker-server
    `

    exec(dockerCommand, (error, stdout, _stderr) => {
        if(error){
            console.error(`Error creating worker: ${error}`);
            return res.status(500).json({ error: 'Failed to create worker instance' });
        }
        // Store worker details
        workers.set(workerId, {
            id: workerId,
            port: workerPort,
            containerId: stdout.trim(),
            createdAt: new Date()
        });
        console.log(`a new worker node with id ${workerId} at http://localhost:${workerPort}`)
        res.status(201).json({
            workerId,
            port: workerPort,
            url: `http://localhost:${workerPort}`
        });
    });
});

app.delete('/workers/:id', (req, res) => {
    const workerId = req.params.id;
    if(!workers.has(workerId)){
        return res.status(404).json({ error: 'Worker not found' });
    }
  
    const worker = workers.get(workerId);
    const dockerCommand = `docker stop worker-${workerId} && docker rm worker-${workerId}`;
  
    exec(dockerCommand, (error) => {
        if(error){
            console.error(`Error removing worker: ${error}`);
            return res.status(500).json({ error: 'Failed to remove worker instance' });
        }
        workers.delete(workerId);
        res.status(200).json(
            { 
                success:true,
                message: `Worker node with id ${workerId} has been killed successfully`
            }
        );
    });
});

app.get('/workers', (req, res) => {
    const workersList = Array.from(workers.entries()).map(([id, worker]) => {
        const { process, ...safeWorker } = worker;
        return safeWorker;
    });
    res.json(workersList);
});

app.post('/worker/heart-beat', (req, res) => {
    console.log(req.body.config);
    // todo: connect with with heartbeat mech
    res.status(200).json({
        success: true,
        message: 'Heartbeat received successfully',
        timestamp: new Date()
    });
});

// Start the server
app.listen(PORT, async () => {
    console.log(`master-node is working on port: ${PORT}`);
    await redisWorkerManager.startMonitoring();
});