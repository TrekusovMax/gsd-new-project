---
status: partial
phase: 02-compression-download
source: [02-VERIFICATION.md]
started: 2026-05-19T00:00:00Z
updated: 2026-05-19T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. E2E Flow — Upload → Compress → Stats → Download → Reset
expected: Загрузить PDF → выбрать пресет (Balanced по умолчанию) → нажать Compress → увидеть loading state → после сжатия увидеть статистику "X MB → Y MB" с badge "↓ N% (− Z MB)" → нажать Download → файл скачается с именем "[оригинал]-compressed.pdf" → нажать "Сжать другой файл" → страница сбрасывается в idle
result: [pending]

### 2. Safari/iOS Download (UX-03)
expected: На iOS Safari нажать Download → браузер показывает диалог сохранения файла или автоматически скачивает, НЕ открывает PDF в браузере; Content-Disposition: attachment работает корректно
result: [pending]

### 3. Зашифрованный PDF — Error State (ERR-03)
expected: Загрузить зашифрованный (password-protected) PDF → нажать Compress → появляется error state с heading "Password-protected PDF" и сообщением об удалении пароля; кнопки "Повторить" и "Загрузить другой" видны
result: [pending]

### 4. Blob Cleanup после скачивания (INFRA-02)
expected: После успешного скачивания оба файла (исходный и сжатый) удаляются из Vercel Blob store; проверить через Vercel dashboard — blob URLs возвращают 404 после скачивания
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
