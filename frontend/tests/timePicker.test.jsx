// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TimePicker } from '@/components/ui/TimePicker'

afterEach(cleanup)

it('uses a dropdown with AM/PM labels on options', () => {
  const onChange = vi.fn()
  render(
    <TimePicker
      value=""
      onChange={onChange}
      slots={['08:00', '13:00']}
      testId="picker"
    />,
  )
  fireEvent.click(screen.getByTestId('picker-select'))
  fireEvent.click(screen.getByTestId('picker-slot-13:00'))
  expect(onChange).toHaveBeenCalledWith('13:00')
})
