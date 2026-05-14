# PDF Compression App

## What This Is

Современное web-приложение для сжатия PDF-документов с удобным UX и высокой скоростью обработки. Пользователь загружает PDF-файл, выбирает уровень сжатия и получает оптимизированный PDF с минимальной потерей качества. Стек: Next.js, React, TypeScript, Ant Design, развёртывание на Vercel.

## Core Value

Пользователь должен уметь загрузить PDF, сжать его и скачать результат — максимум за 3 клика, без регистрации.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Пользователь может загрузить PDF через Drag & Drop или файловый диалог
- [ ] Пользователь может выбрать уровень сжатия
- [ ] Система сжимает PDF на сервере (Next.js API route)
- [ ] Пользователь видит прогресс загрузки и обработки в реальном времени
- [ ] Пользователь видит статистику сжатия (размер до/после, процент)
- [ ] Пользователь может скачать сжатый файл
- [ ] Интерфейс адаптивен для мобильных устройств
- [ ] Система валидирует загружаемые файлы (тип, размер)
- [ ] Понятная обработка и отображение ошибок

### Out of Scope

- Batch compression (множество файлов) — отложено на mid-term
- История файлов / Dashboard — отложено на mid-term
- Аутентификация — не нужна в MVP
- Cloud storage (S3) — только локальное временное хранение в MVP
- OCR, AI-оптимизация — долгосрочные цели
- Desktop app — долгосрочная цель

## Context

- Проект начинается с нуля (greenfield)
- Stack: Next.js (App Router) + TypeScript + Ant Design + Vite (для dev tools)
- Развёртывание на Vercel
- Сжатие PDF на серверной стороне через Next.js API routes
- Временное хранение файлов на сервере во время обработки
- UX-правило: максимум 3 клика до результата

## Constraints

- **Tech stack**: Next.js + TypeScript + Ant Design — зафиксировано в SPEC
- **Deployment**: Vercel — serverless, нет долгоживущих процессов
- **MVP scope**: Только базовый upload-compress-download флоу
- **Security**: Валидация файлов, лимиты размера, очистка временных файлов

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Server-side compression | Browser API ограничены для манипуляций с PDF; серверная обработка надёжнее | — Pending |
| Next.js API routes | Единый стек, не нужен отдельный backend | — Pending |
| Ant Design | Указан в SPEC, богатый набор компонентов (Upload, Progress, Table) | — Pending |
| 2 фазы для MVP | Минимальное дробление: фаза 1 = инфраструктура + upload, фаза 2 = compression + download | — Pending |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-14 after initialization*
