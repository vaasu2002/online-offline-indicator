# online-offline-indicator


## Running Redis Locally with Docker
```bash
# Pull the Redis image
docker pull redis:latest

# Run Redis with hz set to 20
docker run -d --name my-redis -p 6379:6379 redis:latest redis-server --hz 20

# Connect to Redis CLI
docker exec -it my-redis redis-cli
```


## Worker Node
Without docker
```bash
PORT=4001 WORKER_ID=worker1 MASTER_NODE_URL=http://localhost:8000 npm run dev
PORT=4002 WORKER_ID=worker2 MASTER_NODE_URL=http://localhost:8000 npm run dev
```
With docker
```bash
# create docker image
docker build -t worker-server .

# for testing 
docker run -d -p 4003:3000 -e WORKER_ID=20 -e PORT=4003 -e MASTER_NODE_URL=http://localhost:8000  --name worker-20 worker-server
```