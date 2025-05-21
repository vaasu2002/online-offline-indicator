import axios from 'axios';

const AXIOS_REQUEST_TIME_OUT = 5000;
const HEARTBEAT_INTERVAL_MS = 10000;

export interface IWorkerHeartbeatConfig{
    workerId: string;
    port: string | number;
    masterNodeUrl: string;
}

export class WorkerHeartbeat{
    private readonly config: IWorkerHeartbeatConfig;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private readonly intervalMs: number;
    private isRunning: boolean = false;
    constructor(config: IWorkerHeartbeatConfig){
        this.config = {
            ...config,
        };
        this.intervalMs = HEARTBEAT_INTERVAL_MS;
    }


    public async sendHeartBeat(): Promise<boolean>{
        console.log(this.config)
        try{
            const response = await axios.post(
                `${this.config.masterNodeUrl}/worker/heart-beat`, {
                    config:this.config
                },
                {
                    timeout:AXIOS_REQUEST_TIME_OUT
                }
            );
            console.log(`successfully sent heartbeat to master node: ${JSON.stringify(response.data)}`);
            return true;
        }catch(error){
            console.log(error)
            if (axios.isAxiosError(error)){
                console.error(`Failed to send heartbeat: ${error.message}`);
                if(error.response){
                    console.error(`Server responded with status: ${error.response.status}`);
                } 
                else if(error.request){
                    console.error('No response received from server');
                }
            } 
            else{
                console.error(`Unexpected error sending heartbeat: ${error instanceof Error ? error.message : String(error)}`);
            }
            return false;
        }
    }

    public start(): void{
        if(this.isRunning){
            console.log('Heartbeat service is already running');
            return;
        }
        console.log(`Starting heartbeat interval every ${this.intervalMs}ms for worker ${this.config.workerId}`);
        
        try{
            // send first heartbeat instantly...  we will continue even if first heart-beat fails
            this.sendHeartBeat().catch(err => {
                console.error('Error sending initial heartbeat:', err);
            });

            // imp: used arrow function to preserve 'this' context
            this.heartbeatTimer = setInterval(() => {
                this.sendHeartBeat().catch(err => {
                    console.error('Error in heartbeat interval:', err);
                });
            }, this.intervalMs);
            this.isRunning = true;

        }catch(error){
            console.error(`Failed to start heartbeat service: ${error instanceof Error ? error.message : String(error)}`);
            this.kill(); // distro(kill) process if we fails to start sending heart-beat
        }
    }

    public isActive():boolean{
        return this.isRunning;
    }
    public kill(exitCode: number = 1): void{
        process.kill(process.pid, 'SIGABRT');
        return process.exit(exitCode) as never;
    }
}