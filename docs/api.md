# API сводки

`POST /api/digest` принимает JSON с временем сводки и массивом случаев. Пример
вне исходного задания можно отправить из корня проекта после `pnpm dev`.

```sh
curl --fail-with-body http://localhost:3000/api/digest \
  -H 'Content-Type: application/json' \
  --data '{
    "asOf": "2026-11-23T10:00:00+03:00",
    "cases": [{
      "id": "ДЕМО-1",
      "kind": "delivery",
      "crm": {
        "status": "in_transit",
        "dueAt": "2026-11-23T11:00:00+03:00"
      },
      "chat": [{"role": "courier", "text": "Приеду к 12:00."}]
    }]
  }'
```

| `kind` | Обязательные поля CRM |
| --- | --- |
| `onboarding` | `startDate` в формате `YYYY-MM-DD`, `documents` со значением `awaiting` или `confirmed`. |
| `offboarding` | `lastDay` в формате `YYYY-MM-DD`, логическое поле `managerConfirmed`. |
| `delivery` | `status` со значением `planned`, `in_transit` или `accepted`. Для открытых статусов требуется `dueAt`. Для `accepted` требуется `acceptedAt`, а `dueAt` можно указать дополнительно. |

Каждый случай содержит уникальный `id` и массив `chat`, который может быть
пустым. Роли авторов — `employee`, `manager`, `courier`, `recipient` и
`other`. Для меток времени со временем суток передавайте ISO 8601 со
смещением или `Z`. Сводка показывает даты и время по Москве.

Успешный ответ `200` содержит `digest.asOf` и `digest.items`. В каждом
элементе есть `id`, `kind`, `priority`, `reason`, `crm`, `chat`,
`verify` и `action`. Поле `chatNote` появляется рядом с сообщениями,
если правила извлекли оценку курьера или требуется уточнение.
Приоритеты в порядке вывода — `urgent`, `today`, `upcoming`, `none`.

Размер тела запроса ограничен 128 КиБ, число случаев — 30,
сообщений на случай — 5, символов в сообщении — 500.
Ошибки формата возвращаются как `400`, размера — как `413`,
типа содержимого — как `415`. Ошибка данных `422` содержит массив
`issues` с полями `path` и `message`.

`GET /api/health` возвращает `200` и `{"status":"ok"}`.
