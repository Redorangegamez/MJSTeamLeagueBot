import sqlite3
import unittest
from role_roster import connect, register, get_registration, team_mapping

class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.db = connect(":memory:")

    def tearDown(self):
        self.db.close()

    def test_register_and_update(self):
        register(self.db, 123, "mahjongA", "Team A")
        register(self.db, 123, "mahjongA", "Team B", True)
        self.assertEqual(get_registration(self.db, 123), {
            "username": "mahjongA", "team": "Team B", "is_leader": True
        })
        self.assertEqual(team_mapping(self.db), {"mahjongA": "Team B"})

    def test_no_duplicate_claim(self):
        register(self.db, 123, "mahjongA", "Team A")
        with self.assertRaises(ValueError):
            register(self.db, 456, "mahjongA", "Team A")

    def test_blank_rejected(self):
        with self.assertRaises(ValueError):
            register(self.db, 123, "", "Team A")

if __name__ == "__main__":
    unittest.main()
