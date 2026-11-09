import unittest
from datetime import datetime, timezone
from weekly_tracker import count_regular_season

def game(names, when, uuid="1", removed=0):
    return {"uuid": uuid, "end_time": int(datetime.fromisoformat(when).replace(tzinfo=timezone.utc).timestamp()),
            "removed": removed, "accounts": [{"nickname": n} for n in names],
            "result": {"players": []}}

class WeeklyTrackerTests(unittest.TestCase):
    def setUp(self):
        self.roster = {"a": "Red", "b": "Red", "c": "Blue", "d": "Green"}

    def test_two_teammates_both_count(self):
        result = count_regular_season([game(["a", "b", "c", "d"], "2026-09-08T12:00:00")], self.roster)
        self.assertEqual(result["teams"]["Red"]["played"], 2)
        self.assertEqual(len(result["teammate_games"]), 1)

    def test_removed_and_outside_season(self):
        games = [game(["a", "b", "c", "d"], "2026-09-08T12:00:00", removed=1),
                 game(["a", "b", "c", "d"], "2026-12-01T12:00:00", uuid="2")]
        self.assertEqual(count_regular_season(games, self.roster)["teams"]["Red"]["played"], 0)

    def test_missing_timestamp_not_guessed(self):
        g = game(["a", "b", "c", "d"], "2026-09-08T12:00:00")
        del g["end_time"]
        result = count_regular_season([g], self.roster)
        self.assertEqual(result["unknown_timestamp_games"], 1)
        self.assertEqual(result["teams"]["Red"]["played"], 0)

    def test_duplicate_uuid_only_once(self):
        g = game(["a", "b", "c", "d"], "2026-09-08T12:00:00")
        self.assertEqual(count_regular_season([g, g], self.roster)["teams"]["Red"]["played"], 2)

if __name__ == "__main__":
    unittest.main()
