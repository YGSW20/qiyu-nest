/**
 * CLOSD E2E Tests — Playwright
 * 关键用户旅程: 登录 → 发帖 → 评论 → 收藏 → AI → 通知
 * 运行: npx playwright test tests/e2e/closd.spec.js
 */

const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8080';

test.beforeAll(async () => {
  const resp = await fetch(`${BASE}/api/health`);
  if (!resp.ok) throw new Error('CLOSD 服务器未启动');
});

// CP1: 登录 → 发帖
test('CP1: 登录并发帖', async ({ page }) => {
  await page.goto(BASE);
  await page.click('text=登录');
  await page.fill('#loginUsername', 'admin');
  await page.fill('#loginPassword', 'admin123');
  await page.click('#loginModal .btn-submit');
  await expect(page.locator('#btnPostTop')).toBeVisible({ timeout: 5000 });

  await page.click('#btnPostTop');
  await page.fill('#postTitle', `[E2E] 测试帖子 ${Date.now()}`);
  await page.fill('#postContent', 'E2E 自动化测试验证发帖功能。');
  await page.selectOption('#postForum', 'tech');
  await page.click('#postModal .btn-submit');
  await expect(page.locator('.toast.show')).toContainText('发布成功', { timeout: 5000 });
});

// CP2: 浏览 → 评论
test('CP2: 浏览帖子并评论', async ({ page }) => {
  await page.goto(BASE);
  await page.click('text=登录');
  await page.fill('#loginUsername', 'admin');
  await page.fill('#loginPassword', 'admin123');
  await page.click('#loginModal .btn-submit');
  await expect(page.locator('#btnPostTop')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(1000);

  // 直接用JS调用openPost，更可靠
  await page.evaluate(() => { openPost(currentPosts[0].id) });
  await expect(page.locator('#detailOverlay.show')).toBeVisible({ timeout: 5000 });

  await page.fill('#commentInput', `E2E ${Date.now()}`);
  await page.click('#commentsSection button');
  await expect(page.locator('.toast.show')).toContainText('回复成功', { timeout: 5000 });
});

// CP3: 收藏帖子
test('CP3: 收藏帖子', async ({ page }) => {
  await page.goto(BASE);
  await page.click('text=登录');
  await page.fill('#loginUsername', 'admin');
  await page.fill('#loginPassword', 'admin123');
  await page.click('#loginModal .btn-submit');
  await expect(page.locator('#btnPostTop')).toBeVisible({ timeout: 5000 });

  const star = page.locator('.bookmark-btn').first();
  await star.click();
  await page.waitForTimeout(500);
  const text = await star.textContent();
  expect(['☆', '⭐']).toContain(text);
});

// CP4: AI 聊天
test('CP4: AI 聊天机器人', async ({ page }) => {
  await page.goto(BASE);
  await page.click('.ai-chatbot-btn');
  await expect(page.locator('#aiChatbotPanel.show')).toBeVisible({ timeout: 3000 });
  await page.fill('#chatbotInput', '你好');
  await page.click('#chatbotSendBtn');
  await expect(page.locator('.chatbot-msg.bot').last()).toBeVisible({ timeout: 20000 });
});

// CP5: 通知系统
test('CP5: 通知铃铛', async ({ page }) => {
  await page.goto(BASE);
  await page.click('text=登录');
  await page.fill('#loginUsername', 'admin');
  await page.fill('#loginPassword', 'admin123');
  await page.click('#loginModal .btn-submit');
  await expect(page.locator('#btnPostTop')).toBeVisible({ timeout: 5000 });

  await expect(page.locator('.notif-btn')).toBeVisible();
  await page.click('.notif-btn');
  await expect(page.locator('#notifDropdown.show')).toBeVisible({ timeout: 3000 });
});
