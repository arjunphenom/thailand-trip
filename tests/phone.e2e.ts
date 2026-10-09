import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function expectPhoneLayout(page: Page) {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    undersized: Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((button) => {
      const rect = button.getBoundingClientRect()
      return rect.width > 0 && (rect.width < 44 || rect.height < 44)
    }).map((button) => button.getAttribute('aria-label') || button.textContent),
  }))
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.width)
  expect(layout.undersized).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-23T06:00:00Z'))
  await page.goto('./')
  await expect(page.getByRole('dialog', { name: "Who's coming?" })).toBeVisible()
  await expect(page.locator('.identity-option')).toHaveCount(6)
  await expect(page.locator('.identity-photo')).toHaveJSProperty('naturalWidth', 1200)
  await page.getByRole('button', { name: 'achu', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Read-only preview', { exact: true })).toBeVisible()
})

test('phone navigation, full notes and static-host links work', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('.trip-cover img')).toHaveJSProperty('naturalWidth', 1200)
  await expect(page.locator('.trip-cover img')).toHaveJSProperty('naturalHeight', 734)
  await expectPhoneLayout(page)
  const firstTask = await page.locator('.task-card').first().boundingBox()
  expect(firstTask?.y).toBeLessThan(testInfo.project.name.startsWith('phone') ? 520 : 650)
  await page.screenshot({ path: testInfo.outputPath('checklist.png') })

  await page.locator('.task-toggle').first().click()
  await expect(page.locator('.task-detail').first()).toContainText('everything else on 2 and 3 Nov depends on it.')
  await expectPhoneLayout(page)
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectPhoneLayout(page)
  if (testInfo.project.name.startsWith('phone')) {
    const sizes = await page.locator('.task-form input, .task-form select, .task-form textarea')
      .evaluateAll((fields) => fields.map((field) => parseFloat(getComputedStyle(field).fontSize)))
    expect(sizes.every((size) => size >= 16)).toBe(true)
  }
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  const navigation = page.getByRole('navigation', { name: 'Trip navigation' })
  await navigation.getByRole('link', { name: 'Itinerary', exact: true }).click()
  await expect(page.locator('.day-card')).toHaveCount(9)
  await expectPhoneLayout(page)
  await page.reload()
  await expect(page.locator('.day-card')).toHaveCount(9)
  await page.locator('.skip-link').focus()
  await page.locator('.skip-link').press('Enter')
  await expect(page.locator('main')).toBeFocused()
  await expect(page.locator('.day-card')).toHaveCount(9)
  await page.screenshot({ path: testInfo.outputPath('itinerary.png') })
  await page.locator('.day-card').last().scrollIntoViewIfNeeded()

  await navigation.getByRole('link', { name: 'Money', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Money.' })).toBeInViewport()
  await expect(page.getByText('Your total spend')).toBeVisible()
  await expect(page.getByText('No spending logged yet. Add your first entry above.')).toBeVisible()
  await expectPhoneLayout(page)
  await page.screenshot({ path: testInfo.outputPath('money.png') })
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Transport' }).click()
  await expect(page.locator('.cat-chip.selected')).toHaveText('Transport')

  await navigation.getByRole('link', { name: 'Map', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Live map.' })).toBeInViewport()
  await expect(page.locator('.map-canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share my live location' })).toBeVisible()
  await expectPhoneLayout(page)
  await page.screenshot({ path: testInfo.outputPath('map.png') })
  expect(errors).toEqual([])
})

test('installed app shell reopens offline with notification controls', async ({ page, context }, testInfo) => {
  const registration = await page.evaluate(async () => {
    const worker = await navigator.serviceWorker.ready
    return { scope: worker.scope, script: worker.active?.scriptURL }
  })
  expect(registration.script).toContain('/sw.js')
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestUrl).toBeTruthy()
  const manifestResponse = await page.request.get(new URL(manifestUrl!, page.url()).href)
  const manifest = await manifestResponse.json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.shortcuts.map((entry: { name: string }) => entry.name)).toEqual(['Money', 'Map'])
  await page.getByRole('button', { name: 'App and notifications', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'App & notifications', exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Notifications on this device' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeDisabled()
  await expectPhoneLayout(page)
  await page.screenshot({ path: testInfo.outputPath('app-settings.png') })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Trip navigation' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch traveller' })).toContainText('A')
  await expect(page.getByRole('button', { name: 'App and notifications' })).toBeVisible()
})

test('preview cannot fake saves and identity persists on this device', async ({ page }) => {
  const task = page.locator('.task-card').first()
  await task.locator('.status-button').click()
  await expect(page.getByText(/Supabase.*not connected|preview cannot save|Connect Supabase/i).last()).toBeVisible()
  await expect(task.locator('.status-mark')).toHaveClass(/status-todo/)
  await page.getByRole('button', { name: 'Switch traveller', exact: true }).click()
  await page.getByRole('button', { name: 'AJ', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Switch traveller', exact: true })).toContainText('AJ')
  await page.reload()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Switch traveller', exact: true })).toContainText('AJ')
})