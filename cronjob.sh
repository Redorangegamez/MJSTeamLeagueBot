# This is a cron job script that runs perodically
# To configure run frequency, run `sudo crontab -e` on VM.
#
# Figure out script absolute path
SCRIPT_PATH="${BASH_SOURCE[0]}"
if [[ -z "$SCRIPT_PATH" ]]; then
    SCRIPT_PATH="$0"
fi
SCRIPT_DIR="$( cd "$( dirname "$SCRIPT_PATH" )" && pwd )"

# When does this script run?
RUN_DATE=$(date +%Y%m%d_%H%M)


# Make sure output directory exists.
OUTPUT_DIR=${SCRIPT_DIR}/cronjob_output
mkdir -p ${OUTPUT_DIR}

# Test part to verify the cron works correctly.
echo "HELLO!" > ${OUTPUT_DIR}/${RUN_DATE}.py

# Actual job part.
/usr/bin/python3 ${SCRIPT_DIR}/bot.py > ${OUTPUT_DIR}/${RUN_DATE}.bot.out
#
