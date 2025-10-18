import IORedis from 'ioredis'
import dotenv from 'dotenv'

dotenv.config()

const redis = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379')

async function main(){
  console.log('Worker started, publishing example job...')
  await redis.lpush('jobs', JSON.stringify({ type: 'example', payload: { hello: 'world' } }))
  await redis.quit()
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
