import { expect, test } from '@playwright/test'

test('показывает четыре случая в порядке действий и раскрывает источники', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Сводка поддержки')
  await expect(page.getByRole('banner')).toContainText('Центр поддержки')

  const queue = page.getByRole('region', { name: 'Очередь случаев' })
  const buttons = queue.getByRole('button')
  await expect(buttons).toHaveCount(4)
  await expect(buttons.nth(0)).toContainText('П-08')
  await expect(buttons.nth(1)).toContainText('С-24')
  await expect(buttons.nth(2)).toContainText('С-17')
  await expect(buttons.nth(3)).toContainText('П-09')

  const urgent = page.getByRole('article', { name: 'Случай П-08' })
  await expect(urgent.getByRole('region', { name: 'Подтверждено в CRM' })).toContainText('10:00 МСК')
  await expect(urgent.getByRole('region', { name: 'Из рабочего чата' })).toContainText('не раньше 13:00')

  await buttons.nth(3).click()
  const accepted = page.getByRole('article', { name: 'Случай П-09' })
  await expect(accepted).toContainText('Без действий')
  await expect(accepted).toContainText('09:20 МСК')
})

test('подсвечивает дубликат, отправляет исправленный случай в API и даёт вернуть пример', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Изменить данные' }).click()
  await page.getByRole('button', { name: 'Добавить случай', exact: true }).click()

  const added = page.getByRole('region', { name: 'Новый случай 5' })
  await added.getByLabel('Тип операции').selectOption('delivery')
  await added.getByLabel('Срок доставки').fill('2026-11-23T11:00')
  await added.getByLabel('ID случая').fill('С-17')

  const duplicate = page.getByRole('region', { name: 'Случай С-17', exact: true }).last()
  await duplicate.getByRole('button', { name: 'Добавить сообщение' }).click()
  await duplicate.getByLabel('Сообщение', { exact: true }).fill('Приеду к 12:00.')
  await page.getByRole('button', { name: 'Пересчитать сводку' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Проверьте поля сводки.')
  await expect(duplicate.getByLabel('ID случая')).toHaveAttribute('aria-invalid', 'true')
  await expect(duplicate.getByText('Этот ID уже используется.')).toBeVisible()

  await duplicate.getByLabel('ID случая').fill('ДЕМО-1')
  const response = page.waitForResponse((result) => result.url().endsWith('/api/digest') && result.status() === 200)
  await page.getByRole('button', { name: 'Пересчитать сводку' }).click()
  await response
  await page.getByRole('button', { name: /ДЕМО-1/ }).click()
  const result = page.getByRole('article', { name: 'Случай ДЕМО-1' })
  await expect(result).toContainText('Проверить сегодня')
  await expect(result).toContainText('12:00 МСК')

  await page.getByRole('button', { name: 'Изменить данные' }).click()
  await page.getByRole('region', { name: 'Случай ДЕМО-1' }).getByRole('button', { name: 'Удалить случай' }).click()
  await expect(page.getByRole('region', { name: 'Случай ДЕМО-1' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Загрузить пример' }).click()
  await page.getByRole('button', { name: 'Пересчитать сводку' }).click()
  await expect(page.getByRole('region', { name: 'Очередь случаев' }).getByRole('button')).toHaveCount(4)
})

test('копирует сводку с источниками', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Копировать сводку' }).click()
  await expect(page.getByRole('status')).toHaveText('Сводка скопирована.')
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('CRM: Статус «В пути».')
  expect(clipboard).toContain('Чат, Курьер:')
  expect(clipboard.indexOf('П-08')).toBeLessThan(clipboard.indexOf('С-24'))
})

test('на узком экране сводка и форма помещаются по ширине', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Сводка поддержки' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.getByRole('button', { name: /С-17/ }).click()
  await expect(page.getByRole('article', { name: 'Случай С-17' })).toBeInViewport()
  await page.getByRole('button', { name: 'Данные', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Данные для сводки' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})
