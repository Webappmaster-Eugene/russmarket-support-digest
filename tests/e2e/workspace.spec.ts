import { expect, test, type Page } from '@playwright/test'

const userPassword = process.env.SUPPORT_E2E_PASSWORD
const reviewerPassword = process.env.REVIEWER_E2E_PASSWORD

async function login(page: Page, user = 'support', secret = userPassword) {
  if (!secret) throw new Error('Set SUPPORT_E2E_PASSWORD and REVIEWER_E2E_PASSWORD for the disposable test stack')
  await page.goto('/login')
  await page.getByLabel('Логин').fill(user)
  await page.getByLabel('Пароль').fill(secret)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Сводка поддержки' })).toBeVisible()
}

test('гость получает форму входа и 401 от API', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/u)
  await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
  const response = await page.request.get('/api/cases')
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toContain('no-store')
})

test('неверные попытки входа ограничены', async ({ page }) => {
  await page.goto('/login')
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await page.getByLabel('Логин').fill('qa-unknown-account')
    await page.getByLabel('Пароль').fill('incorrect-qa-password')
    const result = page.waitForResponse((response) => response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await result
    await expect(page.getByRole('main').getByRole('alert')).toContainText(attempt === 6
      ? 'Слишком много попыток'
      : 'Проверьте логин и пароль')
  }
})

test('в проверочном пространстве доступна исходная сводка', async ({ page }) => {
  await login(page, 'reviewer', reviewerPassword)
  await page.getByRole('link', { name: 'История', exact: true }).click()
  await page.getByRole('link', { name: /23\.11\.2026, 10:00/ }).click()
  const list = page.getByRole('region', { name: 'Случаи в сводке' })
  await expect(list).toContainText('П-08')
  await expect(list).toContainText('С-24')
  await expect(list).toContainText('С-17')
  await expect(list).toContainText('П-09')
  await expect(list).toContainText('не раньше 13:00')
  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/login$/u)
  expect((await page.request.get('/api/digest')).status()).toBe(401)
})

test('создаёт три типа, редактирует, сохраняет переписку и историю', async ({ page, baseURL }) => {
  await login(page)
  const prefix = `QA-${Date.now().toString(36)}`
  let deliveryPath = ''
  for (const [kind, suffix] of [['onboarding', 'ON'], ['offboarding', 'OF'], ['delivery', 'DL']]) {
    await page.getByRole('link', { name: 'Новый случай' }).click()
    await expect(page.getByRole('heading', { name: 'Новый случай', exact: true })).toBeVisible()
    await page.getByLabel('Тип операции', { exact: true }).selectOption(kind ?? '')
    const ref = `${prefix}-${suffix}`
    await page.getByLabel('ID случая').fill(ref)
    if (kind === 'onboarding') await page.getByLabel('Дата первого выхода').fill('2026-12-01')
    if (kind === 'offboarding') await page.getByLabel('Последний рабочий день').fill('2026-12-01')
    if (kind === 'delivery') await page.getByLabel('Срок доставки, МСК').fill('2026-12-01T12:00')
    await page.getByRole('button', { name: 'Сохранить случай' }).click()
    await expect(page.getByRole('heading', { name: ref, exact: true })).toBeVisible()
    if (kind === 'delivery') deliveryPath = new URL(page.url()).pathname
  }

  await page.getByRole('link', { name: 'Редактировать' }).click()
  await page.getByLabel('Статус доставки').selectOption('accepted')
  await page.getByLabel('Время приёмки, МСК').fill('2026-11-20T12:00')
  await page.getByRole('button', { name: 'Сохранить случай' }).click()
  await expect(page.getByRole('region', { name: 'Данные CRM' })).toContainText('Принято')
  await page.getByLabel('Автор сообщения').selectOption('recipient')
  await page.getByLabel('Текст сообщения').fill('Карты ещё не получили.')
  await page.getByRole('button', { name: 'Добавить сообщение' }).click()
  await expect(page.getByText('Проверить расхождение', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Карты ещё не получили.', { exact: true })).toBeVisible()
  await page.getByLabel('Пояснение к расхождению').fill('Сверили фактическую приёмку.')
  await page.getByRole('button', { name: 'Закрыть расхождение' }).click()
  await expect(page.getByText('Сверили фактическую приёмку.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Перенести в архив' }).click()
  await expect(page.getByText(/В архиве с/)).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить случай' }).click()
  await expect(page.getByRole('link', { name: 'Редактировать' })).toBeVisible()

  await page.getByRole('link', { name: 'Сводка', exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить сводку' }).click()
  await expect(page.getByRole('heading', { name: 'Сохранённая сводка' })).toBeVisible()
  await expect(page.getByText(`${prefix}-DL`, { exact: true })).toBeVisible()

  const cross = await page.request.patch(`${baseURL}/api${deliveryPath}`, {
    headers: { Origin: 'https://different.invalid' },
    data: { action: 'archive', version: 1 },
  })
  expect(cross.status()).toBe(403)
  await page.getByRole('button', { name: 'Выйти' }).click()
  await login(page, 'reviewer', reviewerPassword)
  expect((await page.request.get('/api' + deliveryPath)).status()).toBe(404)
})

test('на 320 px кнопка сверху, форма помещается, ошибка не стирает поля', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 })
  await login(page, 'reviewer', reviewerPassword)
  const add = page.getByRole('link', { name: 'Новый случай' })
  await expect(add).toBeInViewport()
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Новый случай', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.getByLabel('ID случая').fill('С-17')
  await page.getByLabel('Дата первого выхода').fill('2026-12-01')
  await page.getByRole('button', { name: 'Сохранить случай' }).click()
  await expect(page.getByText('Укажите другой ID.')).toBeVisible()
  await expect(page.getByLabel('ID случая')).toHaveValue('С-17')
})
