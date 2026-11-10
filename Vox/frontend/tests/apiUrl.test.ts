import { describe, expect, it } from 'vitest'
import { ApiError, apiUrl } from '../src/api/client'

describe('apiUrl', () => {
  it('prefixes a bare path exactly once', () => {
    expect(apiUrl('/calls')).toBe('/v1/calls')
    expect(apiUrl('/auth/login')).toBe('/v1/auth/login')
  })

  it('leaves a server-supplied URL that already carries /v1 untouched', () => {
    const audio = '/v1/calls/4f2ed410-8e66-4b86-aac4-acf401a51c0f/audio'
    expect(apiUrl(audio)).toBe(audio)
  })

  it('does not treat a path that merely starts with "v1" as a prefix match', () => {
    expect(apiUrl('/v1beta/thing')).toBe('/v1/v1beta/thing')
  })
})

describe('ApiError', () => {
  it('surfaces a string detail', () => {
    expect(new ApiError(422, 'consent required').messageText).toBe('consent required')
  })

  it('surfaces FastAPI validation detail', () => {
    const error = new ApiError(422, { detail: [{ msg: 'field required' }] })
    expect(error.messageText).toBe('field required')
  })

  it('falls back to a readable message', () => {
    expect(new ApiError(500, null).messageText).toBe('request failed (500)')
  })
})
