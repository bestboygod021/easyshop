import { expect, test } from '@playwright/test';

test('customer can sign in, browse the catalog, pay in test mode, and find the order', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('user@easyshop.ir');
  await page.getByPlaceholder('••••••••').fill('Shopper#2026');
  await page.getByRole('button', { name: 'ورود به حساب', exact: true }).click();
  await expect(page).toHaveURL(/\/account\/?$/);

  await page.goto('/products');
  await expect(page.getByRole('heading', { name: /همه محصولات/ })).toBeVisible();
  const addToCart = page.locator('button:not([disabled])').filter({ hasText: 'افزودن به سبد' }).first();
  await expect(addToCart).toBeVisible();
  await addToCart.click();
  await expect(page.getByText(/به سبد خرید اضافه شد/)).toBeVisible();

  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: /سبد خرید/ })).toBeVisible();
  await page.getByRole('button', { name: 'ادامه فرآیند خرید' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'تکمیل خرید' })).toBeVisible();

  const checkoutResponse = page.waitForResponse((response) =>
    response.url().includes('/api/orders/checkout') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'پرداخت و ثبت سفارش' }).click();
  const response = await checkoutResponse;
  expect(response.status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'سفارش شما ثبت شد!' })).toBeVisible();

  const orderSummary = await page.getByText(/کد سفارش:/).innerText();
  const orderCode = orderSummary.match(/کد سفارش:\s*([^\n]+)/)?.[1]?.trim();
  expect(orderCode).toBeTruthy();

  await page.goto('/account/orders');
  await expect(page.getByRole('heading', { name: 'سفارش‌های من' })).toBeVisible();
  await expect(page.getByText(`سفارش ${orderCode}`, { exact: false })).toBeVisible();
});

test('catalog search shows matching results and preserves the query in the URL', async ({ page }) => {
  await page.goto('/products?q=هدفون');
  await expect(page.getByRole('heading', { name: /نتایج جستجو برای/ })).toBeVisible();
  await expect(page).toHaveURL(/\/products\?q=/);
  await expect(page.locator('a[href^="/products/"]').filter({ has: page.getByRole('button', { name: /افزودن به سبد/ }) }).first()).toBeVisible();
});
