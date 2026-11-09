import unittest
from role_roster import connect, seed_from_csv, teams, roster, set_player, remove_player, register, team_mapping, name_mapping

class RosterTests(unittest.TestCase):
    def setUp(self):
        self.db = connect(":memory:")
        seed_from_csv(self.db, {"mahjongA": "Alice"}, {"Alice": "Team A"}, ["Team A", "Team B"])

    def tearDown(self):
        self.db.close()

    def test_seed_only_once(self):
        set_player(self.db, "mahjongA", "Alice", "Team B")
        seed_from_csv(self.db, {"mahjongA": "Alice"}, {"Alice": "Team A"}, ["Team A", "Team B"])
        self.assertEqual(team_mapping(self.db)["mahjongA"], "Team B")

    def test_register_and_move(self):
        register(self.db, 123, "mahjongA", "Team A")
        set_player(self.db, "mahjongA", "Alice", "Team B")
        self.assertEqual(team_mapping(self.db)["mahjongA"], "Team B")
        self.assertEqual(name_mapping(self.db)["mahjongA"], "Alice")

    def test_new_player_and_remove(self):
        set_player(self.db, "newuser", "New Player", "Team A")
        self.assertIn("newuser", team_mapping(self.db))
        self.assertEqual(remove_player(self.db, "newuser"), 1)
        self.assertNotIn("newuser", team_mapping(self.db))

    def test_unknown_team(self):
        with self.assertRaises(ValueError):
            set_player(self.db, "newuser", "New Player", "Not a team")

    def test_duplicate_discord_mapping(self):
        register(self.db, 123, "mahjongA", "Team A")
        with self.assertRaises(ValueError):
            register(self.db, 456, "mahjongA", "Team A")

if __name__ == "__main__":
    unittest.main()
