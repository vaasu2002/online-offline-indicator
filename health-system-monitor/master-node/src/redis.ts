import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const HEARTBEAT_EXPIRY = 30; // seconds
const WORKER_KEY_PREFIX = 'worker:';
const WORKER_HEARTBEAT_KEY_PREFIX = WORKER_KEY_PREFIX + 'heart-beat:';
const WORKER_INFO_KEY_PREFIX = WORKER_KEY_PREFIX + 'info:';

export interface IWorker {
  workerId: string;
  port: number;
}

export interface IWorkerInfo {
  worker: IWorker;
  status: 'online' | 'offline';
  lastHeartbeat: number;
  createdAt: Date;
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

    async startMonitoring(): Promise<void> {
        try {
            await this.ensureConnection();
            console.log('Starting for monitoring for expiration events');
      
            // -- SETTING UP THE SUBSCRIBER -- 
            await this.client.config('SET', 'notify-keyspace-events', 'Ex');
            const expiryChannel = '__keyevent@0__:expired';
            await this.subscriber.subscribe(expiryChannel);

            // listerning
            this.subscriber.on('message', async (channel, message) => {
                // we care only about expirations events which have prefix key WORKER_HEARTBEAT_KEY_PREFIX
                if (channel === expiryChannel 
                    && message.startsWith(WORKER_HEARTBEAT_KEY_PREFIX)){

                        const workerId = message.replace(WORKER_HEARTBEAT_KEY_PREFIX, '');
                        console.log(`Worker ${workerId} is now offline...`);
                        // TODO: handle worker offline event
                }
            });
        }catch(error){
            console.error('Failed to start monitoring:', error);
            throw error;
        }
    }
}