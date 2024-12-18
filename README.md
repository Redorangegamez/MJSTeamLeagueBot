# Simple discord bot scraping games from Mahjong Soul tournament

## Requirement

Python discord library
`pip install discord`

## Run the bot

* Update the config file and name it `config.py`. See the `Config` section for instructions, and `example_config.py` for an example.
* Run `python3 bot.py`


## Config

### Mahjong Soul

```
MS_TOKEN  = "Majsoul XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
TOURN_ID  = 12345678
SEASON_ID = 0
```

You can find the Mahjong Soul token by login to the page `https://mahjongsoul.tournament.yo-star.com/contest_dashboard/`, and check the `Authorization` row in the headers of the http request. You should be able to find it in most of the requests to `engame.mahjongsoul.com`.

Similarly, you can get the tournament ID and season ID by clicking the tournament you are looking for, and check the url.

### Uma

```
uma = [30, 10, -10, -30]
```

Set the uma here – it should be an array of 4 integers, where the first one is the uma for the first place, and so on.

### Discord bot
```
BOT_TOKEN     = "?????"
CHANNEL_ID    = 12345678
UPDATE_PERIOD = 60  # in seconds
```
The bot token is self explanatory. The channel ID is the one where the bot send the message to. The update period decides how frequent the bot scraps the website and updates the message. Default is 60, which means once per minute.
