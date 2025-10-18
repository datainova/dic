import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../index'

describe('health', () => {
  it('responds 200', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
  })
})
