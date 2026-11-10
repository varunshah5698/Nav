import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatClock,
  formatDuration,
  formatFeatureName,
  formatOperator,
  ruleShortLabel,
} from '../src/lib/format'

describe('formatDuration', () => {
  it('renders minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(59)).toBe('0:59')
    expect(formatDuration(75)).toBe('1:15')
  })

  it('renders hours when present', () => {
    expect(formatDuration(3725)).toBe('1:02:05')
  })

  it('never invents a value for missing data', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('formatClock', () => {
  it('floors fractional seconds', () => {
    expect(formatClock(12.9)).toBe('0:12')
    expect(formatClock(600)).toBe('10:00')
  })

  it('clamps negative values', () => {
    expect(formatClock(-4)).toBe('0:00')
  })
})

describe('labels', () => {
  it('maps rule ids to plain language', () => {
    expect(ruleShortLabel('R1')).toBe('Sustained distress')
    expect(ruleShortLabel('R4')).toBe('Insufficient speech evidence')
    expect(ruleShortLabel('R9')).toBe('R9')
  })

  it('renders operators without leaking enum names', () => {
    expect(formatOperator('gte')).toBe('≥')
    expect(formatOperator('lt')).toBe('<')
  })

  it('humanizes feature names', () => {
    expect(formatFeatureName('arousal_ema')).toBe('arousal smoothed')
    expect(formatFeatureName('p_distressed')).toBe('P(distressed)')
    expect(formatFeatureName('valence_ema')).toBe('valence smoothed')
  })
})

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
