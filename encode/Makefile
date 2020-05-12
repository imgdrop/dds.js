ENC_CFLAGS = dds-enc.c -o dds-enc -std=c99 -Wall -Wextra -Wpedantic $(CFLAGS)

all: debug

debug:
	$(CC) $(ENC_CFLAGS) -g

release:
	$(CC) $(ENC_CFLAGS) -O3 -DNDEBUG
