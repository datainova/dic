import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import App from '../App'

describe('App', () => {
  it('renders heading', () => {
    const { getByText } = render(<App />)
    expect(getByText(/DataInova Connect/)).toBeTruthy()
  })
})
