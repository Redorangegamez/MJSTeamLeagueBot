import re
import config

def check_config():
    # if not config.MS_TOKEN.startswith("Majsoul"):
    #     config.MS_TOKEN = "Majsoul " + config.MS_TOKEN
    # pattern = "Majsoul [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    # assert re.fullmatch(pattern, config.MS_TOKEN), "Majsoul token format: Majsoul XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
    assert isinstance(config.TOURN_ID, int), "Tournament ID should be an integer"
    assert isinstance(config.SEASON_ID, int), "Season ID should be an integer"
    assert isinstance(config.SANMA_TOURN_ID, int), "Sanma Tournament ID should be an integer"
    assert isinstance(config.SANMA_SEASON_ID, int), "Sanma Season ID should be an integer"
