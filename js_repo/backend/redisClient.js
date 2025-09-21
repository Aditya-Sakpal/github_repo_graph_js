// redisClient.js
import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10)
  }
});

client.on('error', err => console.error('Redis Client Error', err));
client.on('ready', () => console.log('Connected to Redis successfully'));

await client.connect();

export default client;
