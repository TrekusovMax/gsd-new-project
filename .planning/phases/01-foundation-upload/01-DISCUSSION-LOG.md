# Phase 1: Discussion Log

**Date:** 2026-05-18
**Phase:** Foundation & Upload
**Areas discussed:** Layout & Visual, Post-upload state, Error UX, Project structure

---

## Area 1: Layout & Visual

| Question | Options | Selected |
|----------|---------|----------|
| Как выглядит главная страница до загрузки? | Single-purpose / With navigation | **Single-purpose** |
| Какая цветовая тема? | Dark / Light / You decide | **You decide** (Claude picks dark) |
| Размер upload зоны? | Centered card / Full-page | **Centered card** |

---

## Area 2: Post-upload state

| Question | Options | Selected |
|----------|---------|----------|
| Что видит пользователь после загрузки? | File info card / Inline transition | **File info card** |
| Что показывать пока новый файл не выбран? | Drop zone stays / Zone hidden | **Drop zone stays** |

---

## Area 3: Error UX

| Question | Options | Selected |
|----------|---------|----------|
| Как показывать ошибки валидации? | Inline on drop zone / Toast notification | **Inline on drop zone** |
| Где виден лимит 20 MB? | Always visible / Only on error | **Always visible** |

---

## Area 4: Project structure

| Question | Options | Selected |
|----------|---------|----------|
| Структура проекта? | Standard Next.js root / Monorepo /apps/web | **Standard Next.js root** |
| TypeScript strict mode? | Strict / Normal | **Strict** |

---

## Deferred Ideas

- Monorepo structure — возможна в будущем если проект вырастет
- Dashboard nav — v2, сейчас нет контента для nav

---

## Notes

- Пользователь выбрал все 4 области для обсуждения
- Все рекомендованные варианты приняты кроме темы (отдано на усмотрение Claude)
- Никакого scope creep замечено не было
