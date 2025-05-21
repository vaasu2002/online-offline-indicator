import express from 'express';
import { WorkerHeartbeat } from './heart-beat';

const PORT =  process.env.PORT || 4010
const WORKER_ID =  process.env.WORKER_ID || '43434334'
const MASTER_NODE_URL =  process.env.MASTER_NODE_URL || 'http://localhost:8000'

if(!PORT){
    throw new Error('PORT environment variable is required');
}
if(!WORKER_ID){
    throw new Error('WORKER_ID environment variable is required');
}
if(!MASTER_NODE_URL){
    throw new Error('MASTER_NODE_URL environment variable is required');
}

const app = express();
app.use(express.json());

const workerHeartbear = new WorkerHeartbeat({
    workerId: WORKER_ID,
    port: PORT,
    masterNodeUrl: MASTER_NODE_URL
});

const workerInfo = {
    workerId: WORKER_ID,
    startTime: new Date(),
    port: PORT,
    pid: process.pid
};

app.get('/check', (_req, res) =>{
    const successMessage = {
        success:true,
        message: 'Worker server is running',
        ...workerInfo,
        heartbeatActive: workerHeartbear.isActive(),
        timestamp: new Date(),
        uptime: process.uptime(),
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage()
    }
    res.status(200).json(successMessage);
});


// trigger heart-beat manualy
app.post('/trigger-heartbeat', async (req, res) => {
    try{
        const success = await workerHeartbear.sendHeartBeat();
        res.json({
            success,
            timestamp: new Date(),
            message: success ? 'Heartbeat sent successfully' : 'Failed to send heartbeat'
        });
    }catch(error){
        res.status(500).json({
            success: false,
            message: `Error sending heartbeat: ${error instanceof Error ? error.message : String(error)}`
        });
  }
});

app.listen(PORT, () => {
    console.log(`Worker ${WORKER_ID} listening on port ${PORT}`);
    workerHeartbear.start();
});