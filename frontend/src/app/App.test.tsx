/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

// jsdom height is 0; the virtualizer renders nothing without this.
function giveScrollerHeight(height = 800) {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return height
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return { width: 1400, height, top: 0, left: 0, bottom: height, right: 1400, x: 0, y: 0, toJSON() {} }
    },
  })
}

giveScrollerHeight()

describe('App', () => {
  it('mounts and auto-allocates on load', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Salmon Allocation' })).toBeDefined()
    expect(screen.getByText(/auto-assigned on load/i)).toBeDefined()

    const allocated = screen.getByText('Allocated').parentElement
    expect(allocated?.textContent).toMatch(/\d/)
    expect(allocated?.textContent).not.toMatch(/^Allocated0/)
  })

  it('renders only a window of rows for a 5,200-row dataset', () => {
    render(<App />)
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.length).toBeLessThan(200)
  })

  it('pages to the next set of rows and back', () => {
    render(<App />)
    const firstId = screen.getAllByText(/^ORDER-\d{4}-\d{3}$/)[0]?.textContent
    expect(firstId).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.queryByText(firstId!)).toBeNull()
    expect(screen.getByText(/51–100 of 5,200/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByText(firstId!)).toBeDefined()
    expect(screen.getByText(/1–50 of 5,200/)).toBeDefined()
  })

  it('filters down to the spec example dataset and shows its rows', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Spec example' }))

    expect(screen.getByText('ORDER-0001-001')).toBeDefined()
    expect(screen.getByText('ORDER-0002-001')).toBeDefined()
  })

  it('narrows the table when searching', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Spec example' }))

    const search = screen.getByLabelText('Search orders')
    fireEvent.change(search, { target: { value: 'ORDER-0002' } })

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(screen.queryByText('ORDER-0001-001')).toBeNull()
        expect(screen.getByText('ORDER-0002-001')).toBeDefined()
        resolve()
      }, 250)
    })
  })

  it('commits a manual allocation from the detail panel', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Spec example' }))
    fireEvent.click(screen.getByText('ORDER-0001-001'))

    const input = screen.getByLabelText('Allocation for ORDER-0001-001') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '4' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input.value).toBe('4.00')
    expect(screen.getAllByRole('row').some((row) => row.textContent?.includes('4.00'))).toBe(true)
  })

  it('clamps a manual allocation that exceeds available stock', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Spec example' }))
    fireEvent.click(screen.getByText('ORDER-0002-001'))

    const input = screen.getByLabelText('Allocation for ORDER-0002-001') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '9999' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(Number.parseFloat(input.value.replace(/,/g, ''))).toBeLessThanOrEqual(300)
    expect(screen.getByRole('dialog', { name: 'Couldn’t increase the allocation' })).toBeDefined()
    expect(screen.getByText(/Not enough stock/)).toBeDefined()
    expect(screen.getByText(/manual order/)).toBeDefined()
  })

  it('zeroes every allocation when Clear all is pressed', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Spec example' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    for (const id of ['ORDER-0001-001', 'ORDER-0002-001']) {
      expect(screen.getByText(id).closest('[role="row"]')?.textContent).toContain('0.00')
    }
  })

  it('restores the rule-based allocation with Reset to auto', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Spec example' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to auto' }))

    expect(screen.getByText('ORDER-0002-001').closest('[role="row"]')?.textContent).toContain('150.00')
  })

  it('shows allocation sources in the detail panel for the selected row', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Spec example' }))

    fireEvent.click(screen.getByText('ORDER-0002-002'))

    expect(screen.getByRole('heading', { name: 'ORDER-0002-002' })).toBeDefined()
    expect(screen.getByText('Drawn from')).toBeDefined()
    expect(screen.getAllByText(/WH-002 · SP-001/).length).toBeGreaterThan(0)
  })
})
