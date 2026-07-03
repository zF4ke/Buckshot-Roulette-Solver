from dataclasses import dataclass

from game_event import GameEvent


@dataclass(slots=True)
class EventRecord:
    index: int
    event: GameEvent
    summary: str


class EventHistory:

    def __init__(self):
        self._records: list[EventRecord] = []

    def add(self, event: GameEvent, summary: str) -> EventRecord:
        record = EventRecord(index=len(self._records) + 1, event=event, summary=summary)
        self._records.append(record)
        return record

    def all(self) -> list[EventRecord]:
        return list(self._records)

    def tail(self, count: int = 5) -> list[EventRecord]:
        if count <= 0:
            return []
        return self._records[-count:]
