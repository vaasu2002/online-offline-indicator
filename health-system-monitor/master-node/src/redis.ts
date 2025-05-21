import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const HEARTBEAT_EXPIRY = 30; 
const WORKER_KEY_PREFIX = 'worker:';
// WORKER_HEARTBEAT_KEY_PREFIX will be used to keep track of heartbeat
const WORKER_HEARTBEAT_KEY_PREFIX = WORKER_KEY_PREFIX + 'heart-beat:';
// WORKER_INFO_KEY_PREFIX will used store history of all workers that ever lived(instead of using another databse we are storing this in redis)
const WORKER_INFO_KEY_PREFIX = WORKER_KEY_PREFIX + 'info:';

export interface IWorker{
    workerId: string;
    port: number;
    masterNodeUrl:string;
}

export interface IWorkerInfo{
    worker: IWorker;
    status: 'online' | 'offline';
    lastHeartbeat: number;
    firstOnlineAt: Date;
    offlineAt: Date | null;
}

export class RedisWorkerManager {
    private client: Redis;
    private subscriber: Redis;
    private connectionPromise: Promise<void> | null = null;

    constructor(){
        const redisUrl = process.env.REDIS_URL;
        if(!redisUrl){
            throw new Error('REDIS_URL is not defined in environment variables');
        }
        this.client = new Redis(redisUrl);

        this.client.on('connect', () => {
            console.log('Successfully connected to Redis');
        });
        this.client.on('error', (err) => {
            console.error('Redis Error:', err);
            this.connectionPromise = null;
        });
        
        this.subscriber = this.client.duplicate();
    }


    private async validatingConnectionPromise(timeoutMs = 5000): Promise<void> {
        // If we already have a connection promise, reuse it
        if(this.connectionPromise){
            return this.connectionPromise;
        }

        // creating a new connection promse
        this.connectionPromise = new Promise((resolve, reject)=>{
            if(this.client.status === 'ready'){
                resolve();
                return;
            }

            // setting a timeout to reject if connection takes too long
            const timeoutId = setTimeout(() => {
                reject(new Error('Redis connection timeout'));
                this.connectionPromise = null;
            }, timeoutMs);
      
            // Wait for the ready event
            this.client.once('ready', () => {
                clearTimeout(timeoutId);
                resolve();
            });
        });
        return this.connectionPromise;
    }

    private async ensureConnection(): Promise<void> {
        await this.validatingConnectionPromise();
    }

    private async increaseExpirationFrequency(hzValue = 20) {
        try {
            await this.client.config('SET', 'hz', String(hzValue));
            console.log(`Successfully set Redis hz value to ${hzValue}`);
        }catch(error){
            console.error('Failed to set Redis hz value:', error);
        }
    }
    async startMonitoring(): Promise<void> {
        try {
            await this.ensureConnection();
            await this.increaseExpirationFrequency();
            console.log('Starting for monitoring for expiration events');
      
            // -- SETTING UP THE SUBSCRIBER -- 
            await this.client.config('SET', 'notify-keyspace-events', 'Ex');
            const expiryChannel = '__keyevent@0__:expired';
            await this.subscriber.subscribe(expiryChannel);

            // listerning
            this.subscriber.on('message', async (channel, message) => {
                console.log(message);
                // we care only about expirations events which have prefix key WORKER_HEARTBEAT_KEY_PREFIX
                if (channel === expiryChannel 
                    && message.startsWith(WORKER_HEARTBEAT_KEY_PREFIX)){

                        const workerId = message.replace(WORKER_HEARTBEAT_KEY_PREFIX, '');
                        console.log(`Worker ${workerId} is now offline...`);
                        await this.handleWorkerOfflineEvent(workerId);
                }
            });
        }catch(error){
            console.error('Failed to start monitoring:', error);
            throw error;
        }
    }
    
    private async handleWorkerOfflineEvent(workerId:string){
        const workerInfoKey = WORKER_INFO_KEY_PREFIX + workerId;
        const workerInfoStr = await this.client.get(workerInfoKey);
        if(workerInfoStr){
            const workerInfo: IWorkerInfo = JSON.parse(workerInfoStr);
            workerInfo.status = 'offline';
            workerInfo.offlineAt = new Date();
            await this.client.set(workerInfoKey, JSON.stringify(workerInfo));
        }
    }

    // registering a newer worker that was made either to handle new work load or 
    // to compenstate for the one that went offline
    async registerWorker(worker: IWorker): Promise<void> {
        await this.ensureConnection();
        const workerInfoKey = WORKER_INFO_KEY_PREFIX + worker.workerId;
        const workerHeartbeatKey = WORKER_HEARTBEAT_KEY_PREFIX + worker.workerId;
        console.log(`heart beat registered from worker node ${worker.workerId}`)
        const workerInfo: IWorkerInfo = {
            worker,
            status: 'online',
            lastHeartbeat: Date.now(),
            firstOnlineAt: new Date(),
            offlineAt : null
        };
        await this.client.set(workerInfoKey, JSON.stringify(workerInfo));
        await this.client.set(workerHeartbeatKey, '1', 'EX', HEARTBEAT_EXPIRY);
    }
    
    // when we get heart-beat from worker
    async updateWorkerHeartbeat(workerId: string): Promise<void> {
        await this.ensureConnection();
        const workerHeartbeatKey = WORKER_HEARTBEAT_KEY_PREFIX + workerId;
        await this.client.set(workerHeartbeatKey, '1', 'EX', HEARTBEAT_EXPIRY);
    
        const workerInfoKey = WORKER_INFO_KEY_PREFIX + workerId;
        const workerInfoStr = await this.client.get(workerInfoKey);
    
        if(workerInfoStr){
            const workerInfo: IWorkerInfo = JSON.parse(workerInfoStr);
            workerInfo.lastHeartbeat = Date.now();
            workerInfo.status = 'online';
            await this.client.set(workerInfoKey, JSON.stringify(workerInfo));
        }
    }
}